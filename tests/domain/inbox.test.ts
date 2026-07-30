import { describe, expect, test } from "vitest";
import { reduceInbox } from "../../src/domain/surfaces/inbox.js";
import { signal } from "../support/signals.js";

describe("reduceInbox", () => {
  test("counts only signals that need my action", () => {
    const state = reduceInbox([
      signal("review_requested"),
      signal("work_item_assigned"),
      signal("build"),
      signal("calendar_event"),
    ]);

    expect(state.count).toBe(2);
  });

  test("lists actionable signals in the feed, oldest first", () => {
    const state = reduceInbox([
      signal("review_requested", {
        id: "pr:2",
        title: "bump sdk",
        url: "https://dev.azure.com/pr/2",
        since: new Date("2026-07-30T10:00:00Z"),
      }),
      signal("build", { id: "build:9", title: "main pipeline" }),
      signal("review_requested", {
        id: "pr:1",
        title: "fix auth retry",
        url: "https://dev.azure.com/pr/1",
        since: new Date("2026-07-28T10:00:00Z"),
      }),
    ]);

    expect(state.activity).toEqual([
      { id: "pr:1", text: "fix auth retry", url: "https://dev.azure.com/pr/1" },
      { id: "pr:2", text: "bump sdk", url: "https://dev.azure.com/pr/2" },
    ]);
  });

  test("caps the feed at 15 entries but keeps the badge truthful", () => {
    const many = Array.from({ length: 18 }, (_, i) =>
      signal("review_requested", {
        id: `pr:${i}`,
        title: `pr ${i}`,
        since: new Date(Date.UTC(2026, 6, 1, 0, i)),
      }),
    );

    const state = reduceInbox(many);

    expect(state.count).toBe(18);
    expect(state.activity).toHaveLength(16);
    expect(state.activity.at(-1)).toEqual({ id: "overflow", text: "+3 outros" });
  });

  test("truncates feed text to the 500 char wire limit", () => {
    const state = reduceInbox([signal("review_requested", { title: "x".repeat(600) })]);

    expect(state.activity[0]?.text).toHaveLength(500);
    expect(state.activity[0]?.text.endsWith("…")).toBe(true);
  });
});
