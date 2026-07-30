import { describe, expect, test } from "vitest";
import { reduceLightbulb } from "../../src/domain/surfaces/lightbulb.js";
import { signal } from "../support/signals.js";

const NOW = new Date("2026-07-30T14:00:00Z");

function window(startMin: number, endMin: number) {
  return {
    start: new Date(NOW.getTime() + startMin * 60_000),
    end: new Date(NOW.getTime() + endMin * 60_000),
  };
}

describe("reduceLightbulb", () => {
  test("goes off during a meeting", () => {
    const state = reduceLightbulb(
      [signal("calendar_event", { source: "gcal", title: "Weekly", window: window(-10, 20) })],
      NOW,
    );

    expect(state.on).toBe(false);
  });

  test("goes off when a meeting starts within 5 minutes", () => {
    const state = reduceLightbulb(
      [signal("calendar_event", { source: "gcal", title: "1:1", window: window(4, 34) })],
      NOW,
    );

    expect(state.on).toBe(false);
  });

  test("stays on when the next meeting is further out than 5 minutes", () => {
    const state = reduceLightbulb(
      [signal("calendar_event", { source: "gcal", title: "Retro", window: window(30, 60) })],
      NOW,
    );

    expect(state.on).toBe(true);
  });

  test("ignores work that is not a calendar event", () => {
    const state = reduceLightbulb(
      [signal("build", { source: "azdo-builds", state: "running" })],
      NOW,
    );

    expect(state.on).toBe(true);
  });

  // A switch has no activity feed, so the reason has to ride along in `info.set`.
  test("explains an ongoing meeting in the description", () => {
    const state = reduceLightbulb(
      [signal("calendar_event", { source: "gcal", title: "Weekly", window: window(-10, 20) })],
      NOW,
    );

    expect(state.description).toBe("Em reunião: Weekly");
  });

  test("explains an imminent meeting in the description", () => {
    const state = reduceLightbulb(
      [signal("calendar_event", { source: "outlook", title: "1:1", window: window(4, 34) })],
      NOW,
    );

    expect(state.description).toBe("Reunião em 4 min: 1:1");
  });

  test("says so when nothing is blocking", () => {
    expect(reduceLightbulb([], NOW).description).toBe("Livre");
  });
});
