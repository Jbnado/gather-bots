import { describe, expect, test } from "vitest";
import { refresh, type SurfaceTarget } from "../../src/domain/refresh.js";
import { reduceInbox } from "../../src/domain/surfaces/inbox.js";
import { findSurface } from "../../src/objects/registry.js";
import {
  applyIncident,
  toIncidentSignals,
  type IncidentState,
} from "../../src/domain/incidents.js";
import { FakeSmartObject, FakeSource, InMemoryStateStore } from "../support/fakes.js";
import { signal } from "../support/signals.js";

const NOW = new Date("2026-07-30T12:00:00Z");

function inboxTarget(object: FakeSmartObject): SurfaceTarget {
  return {
    key: "inbox",
    object,
    snapshotOf: (signals) => {
      const state = reduceInbox(signals);
      return { count: state.count, activity: state.activity };
    },
  };
}

describe("refresh", () => {
  test("writes the reduced state to the object", async () => {
    const object = new FakeSmartObject("inbox");
    const source = new FakeSource("azdo-prs", [
      signal("review_requested", { id: "pr:1", title: "corrige retry" }),
    ]);

    await refresh({
      sources: [source],
      targets: [inboxTarget(object)],
      store: new InMemoryStateStore(),
      now: NOW,
    });

    expect(object.applied).toEqual([
      { type: "counter.set", data: { count: 1 } },
      { type: "activity.add", data: { id: "pr:1", text: "corrige retry" } },
    ]);
  });

  test("a second identical run sends nothing", async () => {
    const object = new FakeSmartObject("inbox");
    const store = new InMemoryStateStore();
    const deps = {
      sources: [new FakeSource("azdo-prs", [signal("review_requested", { id: "pr:1" })])],
      targets: [inboxTarget(object)],
      store,
      now: NOW,
    };

    await refresh(deps);
    const afterFirst = object.applied.length;
    await refresh(deps);

    expect(object.applied.length).toBe(afterFirst);
    expect(object.applyCalls).toBe(1);
  });

  // One badly behaved integration must not freeze every other object. Transient blips are
  // already absorbed by withLastKnownGood; a failure that reaches here has persisted.
  test("keeps going when one source among several fails", async () => {
    const object = new FakeSmartObject("inbox");

    const result = await refresh({
      sources: [
        new FakeSource("azdo-prs", [signal("review_requested", { id: "pr:1", title: "fix" })]),
        new FakeSource("gcal", [], new Error("timeout")),
      ],
      targets: [inboxTarget(object)],
      store: new InMemoryStateStore(),
      now: NOW,
    });

    expect(result.failed).toEqual(["gcal"]);
    expect(object.applied).toContainEqual({ type: "counter.set", data: { count: 1 } });
  });

  // Total failure is different in kind: it usually means the network is down, not that every
  // queue emptied at once. Writing then would blank every object at once.
  test("writes nothing when every source fails", async () => {
    const store = new InMemoryStateStore();
    const object = new FakeSmartObject("inbox");

    await refresh({
      sources: [new FakeSource("azdo-prs", [signal("review_requested", { id: "pr:1" })])],
      targets: [inboxTarget(object)],
      store,
      now: NOW,
    });
    const saved = await store.get("inbox");
    const before = object.applied.length;

    const result = await refresh({
      sources: [new FakeSource("azdo-prs", [], new Error("boom"))],
      targets: [inboxTarget(object)],
      store,
      now: NOW,
    });

    expect(result.failed).toEqual(["azdo-prs"]);
    expect(object.applied.length).toBe(before);
    expect(await store.get("inbox")).toEqual(saved);
  });

  // Nothing configured yet is the normal first run, not a crash.
  test("does nothing gracefully when there are no sources at all", async () => {
    const object = new FakeSmartObject("inbox");

    const result = await refresh({
      sources: [],
      targets: [inboxTarget(object)],
      store: new InMemoryStateStore(),
      now: NOW,
    });

    expect(result.signals).toBe(0);
    expect(object.applied).toEqual([]);
  });

  // Surfaces need to tell "this source answered with nothing" from "this source is not there":
  // the first is evidence, the second is not.
  test("tells the surface which sources answered this tick", async () => {
    let seen: ReadonlySet<string> | undefined;
    const target: SurfaceTarget = {
      key: "probe",
      object: new FakeSmartObject("probe"),
      snapshotOf: (_signals, _now, reporting) => {
        seen = reporting;
        return { on: false };
      },
    };

    await refresh({
      sources: [
        new FakeSource("uptime", []),
        new FakeSource("azdo-builds", [], new Error("down")),
      ],
      targets: [target],
      store: new InMemoryStateStore(),
      now: NOW,
    });

    expect([...(seen ?? [])]).toEqual(["uptime"]);
  });

  // End to end through the real surface: an uptime source that answers with nothing open makes
  // the status monitor smile, and one that fails leaves it off.
  test("the activity monitor smiles only while the uptime source answers", async () => {
    const surface = findSurface("activity-monitor");
    if (surface === undefined) throw new Error("activity-monitor surface missing");

    async function stateWith(uptime: FakeSource) {
      const object = new FakeSmartObject("status");
      await refresh({
        sources: [uptime, new FakeSource("azdo-prs", [])],
        targets: [{ key: "status", object, snapshotOf: surface!.snapshotOf }],
        store: new InMemoryStateStore(),
        now: NOW,
      });
      return object.applied.find((c) => c.type === "status.set")?.data;
    }

    expect(await stateWith(new FakeSource("uptime", []))).toEqual({ state: "on" });
    expect(await stateWith(new FakeSource("uptime", [], new Error("down")))).toEqual({
      state: "off",
    });
  });

  // End to end through both real surfaces, from the state file's point of view: a check that
  // goes from down to slow turns the bulb off and the face from alert to question.
  test("down then degraded turns the bulb off and the face to question", async () => {
    const status = findSurface("activity-monitor");
    const bulb = findSurface("prod-health");
    if (status === undefined || bulb === undefined) throw new Error("surface missing");

    const T0 = NOW.getTime();
    const report = { id: "upwatch:1", title: "RPA / prod · api" };
    const down = applyIncident({}, { ...report, status: "down" }, T0);
    const slow = applyIncident(down, { ...report, status: "degraded" }, T0 + 60_000);

    async function run(state: IncidentState) {
      const statusObject = new FakeSmartObject("status");
      const bulbObject = new FakeSmartObject("lightbulb");
      await refresh({
        sources: [new FakeSource("uptime", toIncidentSignals(state, NOW, { ttlHours: 24 }))],
        targets: [
          { key: "status", object: statusObject, snapshotOf: status!.snapshotOf },
          { key: "lightbulb", object: bulbObject, snapshotOf: bulb!.snapshotOf },
        ],
        store: new InMemoryStateStore(),
        now: NOW,
      });
      return {
        face: statusObject.applied.find((c) => c.type === "status.set")?.data,
        bulb: bulbObject.applied.find((c) => c.type === "switch.set_state")?.data,
      };
    }

    expect(await run(down)).toMatchObject({ face: { state: "alert" }, bulb: { on: true } });
    expect(await run(slow)).toMatchObject({ face: { state: "question" }, bulb: { on: false } });
  });
});
