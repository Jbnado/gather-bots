import { describe, expect, test } from "vitest";
import { withLastKnownGood } from "../../src/domain/last-known-good.js";
import type { Signal } from "../../src/domain/signal.js";
import type { SignalSourcePort } from "../../src/ports/signal-source.js";

const T0 = new Date("2026-07-30T12:00:00Z");
const later = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const one: Signal[] = [
  { id: "pr:1", source: "azdo-prs", kind: "review_requested", title: "fix auth" },
];

/** Succeeds while `failing` is false; flip it mid-test to simulate an outage. */
class Flaky implements SignalSourcePort {
  readonly id = "azdo-prs" as const;
  failing = false;
  calls = 0;

  async collect(): Promise<Signal[]> {
    this.calls += 1;
    if (this.failing) throw new Error("upstream timeout");
    return one;
  }
}

describe("withLastKnownGood", () => {
  test("passes successful results straight through", async () => {
    const source = withLastKnownGood(new Flaky(), { maxAgeMs: 60_000 });

    expect(await source.collect(T0)).toEqual(one);
  });

  // A blip must not read as "those items went away" — that would emit activity.remove for all
  // of them and blank the feed over a momentary network hiccup.
  test("serves the last good result when the source fails", async () => {
    const flaky = new Flaky();
    const source = withLastKnownGood(flaky, { maxAgeMs: 15 * 60_000 });

    await source.collect(T0);
    flaky.failing = true;

    expect(await source.collect(later(5))).toEqual(one);
  });

  // Past the window, stale is worse than absent: a meeting that ended an hour ago would still
  // be holding the switch off.
  test("gives up once the cached result is older than maxAge", async () => {
    const flaky = new Flaky();
    const source = withLastKnownGood(flaky, { maxAgeMs: 15 * 60_000 });

    await source.collect(T0);
    flaky.failing = true;

    await expect(source.collect(later(16))).rejects.toThrow(/upstream timeout/);
  });

  test("fails outright when it has never succeeded", async () => {
    const flaky = new Flaky();
    flaky.failing = true;
    const source = withLastKnownGood(flaky, { maxAgeMs: 60_000 });

    await expect(source.collect(T0)).rejects.toThrow(/upstream timeout/);
  });

  test("keeps the wrapped source's id so logs still name the right thing", () => {
    expect(withLastKnownGood(new Flaky(), { maxAgeMs: 1 }).id).toBe("azdo-prs");
  });
});
