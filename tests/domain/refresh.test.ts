import { describe, expect, test } from "vitest";
import { refresh, type SurfaceTarget } from "../../src/domain/refresh.js";
import { reduceInbox } from "../../src/domain/surfaces/inbox.js";
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
});
