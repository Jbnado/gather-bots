import { describe, expect, test } from "vitest";
import { reduceStatus } from "../../src/domain/surfaces/status.js";
import { signal } from "../support/signals.js";

const NOW = new Date("2026-07-30T14:00:00Z");

/** Builds a calendar event window relative to NOW, in minutes. */
function window(startMin: number, endMin: number) {
  return {
    start: new Date(NOW.getTime() + startMin * 60_000),
    end: new Date(NOW.getTime() + endMin * 60_000),
  };
}

describe("reduceStatus", () => {
  test("reports alert when a prod build failed", () => {
    const state = reduceStatus(
      [
        signal("build", {
          source: "azdo-builds",
          state: "failed",
          environment: "prod",
          title: "svc-orders: main",
        }),
      ],
      NOW,
    );

    expect(state.state).toBe("alert");
  });

  test("reports question when only a develop build failed", () => {
    const state = reduceStatus(
      [signal("build", { source: "azdo-builds", state: "failed", environment: "develop" })],
      NOW,
    );

    expect(state.state).toBe("question");
  });

  test("a broken prod build outranks a broken develop build", () => {
    const state = reduceStatus(
      [
        signal("build", { source: "azdo-builds", state: "failed", environment: "develop" }),
        signal("build", { source: "azdo-builds", state: "failed", environment: "prod" }),
      ],
      NOW,
    );

    expect(state.state).toBe("alert");
  });

  // A red pipeline must not be hidden by a transient state like "in a meeting".
  test("a broken develop build outranks an ongoing meeting", () => {
    const state = reduceStatus(
      [
        signal("build", { source: "azdo-builds", state: "failed", environment: "develop" }),
        signal("calendar_event", { source: "gcal", window: window(-10, 20) }),
      ],
      NOW,
    );

    expect(state.state).toBe("question");
  });

  test("alert beats working when a build fails while a meeting runs", () => {
    const state = reduceStatus(
      [
        signal("build", { source: "azdo-builds", state: "failed", environment: "prod" }),
        signal("calendar_event", { source: "gcal", window: window(-10, 20) }),
      ],
      NOW,
    );

    expect(state.state).toBe("alert");
  });

  test("reports working while a meeting is happening", () => {
    const state = reduceStatus(
      [signal("calendar_event", { source: "gcal", window: window(-10, 20) })],
      NOW,
    );

    expect(state.state).toBe("working");
  });

  test("reports question when the next meeting is within 10 minutes", () => {
    const state = reduceStatus(
      [signal("calendar_event", { source: "gcal", window: window(8, 38) })],
      NOW,
    );

    expect(state.state).toBe("question");
  });

  test("reports on when everything is green and nothing is running", () => {
    const state = reduceStatus(
      [signal("build", { source: "azdo-builds", state: "succeeded" })],
      NOW,
    );

    expect(state.state).toBe("on");
  });

  // An uptime monitor reporting production down is the loudest thing this object can say.
  test("reports alert when an incident is open", () => {
    const state = reduceStatus(
      [signal("incident", { source: "uptime", state: "failed", environment: "prod", title: "API fora" })],
      NOW,
    );

    expect(state.state).toBe("alert");
    expect(state.activity.map((a) => a.text)).toContain("API fora");
  });

  test("reports off when there is nothing to show", () => {
    expect(reduceStatus([], NOW).state).toBe("off");
  });

  // Every green pipeline emits a signal so "all green" is distinguishable from "nothing
  // configured", but listing them all would bury the two entries that matter.
  test("counts succeeded builds towards the state without listing them in the feed", () => {
    const state = reduceStatus(
      [
        signal("build", { source: "azdo-builds", state: "succeeded", environment: "prod" }),
        signal("build", { id: "build:red", source: "azdo-builds", state: "failed", environment: "develop" }),
      ],
      NOW,
    );

    expect(state.state).toBe("question");
    expect(state.activity.map((a) => a.id)).toEqual(["build:red"]);
  });

  test("treats overlapping meetings as an alert", () => {
    const state = reduceStatus(
      [
        signal("calendar_event", { source: "gcal", window: window(30, 90) }),
        signal("calendar_event", { source: "outlook", window: window(60, 120) }),
      ],
      NOW,
    );

    expect(state.state).toBe("alert");
  });

  test("keeps signals that lost the precedence contest in the feed", () => {
    const state = reduceStatus(
      [
        signal("build", { id: "build:998", source: "azdo-builds", state: "failed", environment: "prod", title: "main falhou" }),
        signal("calendar_event", { id: "gcal:b21", source: "gcal", title: "Weekly", window: window(-10, 20) }),
      ],
      NOW,
    );

    expect(state.state).toBe("alert");
    expect(state.activity.map((a) => a.id)).toEqual(["build:998", "gcal:b21"]);
  });
});
