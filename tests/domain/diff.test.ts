import { describe, expect, test } from "vitest";
import { diff, type Snapshot } from "../../src/domain/diff.js";

const base: Snapshot = {
  count: 2,
  activity: [
    { id: "pr:1", text: "fix auth", url: "https://example.com/1" },
    { id: "pr:2", text: "bump sdk" },
  ],
};

describe("diff", () => {
  // The whole point of the state store: a quiet minute must cost zero requests,
  // because the Gather rate limit is shared across the entire space.
  test("emits nothing when the snapshot is unchanged", () => {
    expect(diff(base, structuredClone(base))).toEqual([]);
  });

  test("emits everything on the first run", () => {
    const commands = diff(null, { count: 1, activity: [{ id: "pr:1", text: "fix auth" }] });

    expect(commands).toEqual([
      { type: "counter.set", data: { count: 1 } },
      { type: "activity.add", data: { id: "pr:1", text: "fix auth" } },
    ]);
  });

  test("sets the counter only when the count changed", () => {
    expect(diff(base, { ...structuredClone(base), count: 5 })).toEqual([
      { type: "counter.set", data: { count: 5 } },
    ]);
  });

  test("adds only the entries that are new", () => {
    const next = structuredClone(base);
    next.activity?.push({ id: "pr:3", text: "new one" });
    next.count = 3;

    expect(diff(base, next)).toEqual([
      { type: "counter.set", data: { count: 3 } },
      { type: "activity.add", data: { id: "pr:3", text: "new one" } },
    ]);
  });

  test("removes entries that disappeared", () => {
    const next: Snapshot = { count: 1, activity: [{ id: "pr:1", text: "fix auth", url: "https://example.com/1" }] };

    expect(diff(base, next)).toEqual([
      { type: "counter.set", data: { count: 1 } },
      { type: "activity.remove", data: { id: "pr:2" } },
    ]);
  });

  test("re-adds an entry whose text changed", () => {
    const next = structuredClone(base);
    next.activity![1] = { id: "pr:2", text: "bump sdk (2 comments)" };

    expect(diff(base, next)).toEqual([
      { type: "activity.add", data: { id: "pr:2", text: "bump sdk (2 comments)" } },
    ]);
  });

  test("removes before adding so the feed never overshoots its cap", () => {
    const next: Snapshot = { count: 1, activity: [{ id: "pr:9", text: "brand new" }] };
    const types = diff(base, next).map((c) => c.type);

    expect(types.indexOf("activity.remove")).toBeLessThan(types.indexOf("activity.add"));
  });

  test("emits status, switch and description only when they change", () => {
    const previous: Snapshot = { status: "on", on: true, description: "Livre" };

    expect(diff(previous, { status: "alert", on: true, description: "Livre" })).toEqual([
      { type: "status.set", data: { state: "alert" } },
    ]);
    expect(diff(previous, { status: "on", on: false, description: "Em reunião: Weekly" })).toEqual([
      { type: "info.set", data: { description: "Em reunião: Weekly" } },
      { type: "switch.set_state", data: { on: false } },
    ]);
  });
});
