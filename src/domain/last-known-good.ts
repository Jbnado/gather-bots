import type { Signal } from "./signal.js";
import type { SignalSourcePort } from "../ports/signal-source.js";

export type LastKnownGoodOptions = {
  /** How long a cached result stays trustworthy after the source starts failing. */
  maxAgeMs: number;
};

/**
 * Wraps a source so a brief outage does not read as "everything this source reported is gone".
 *
 * Without it, one timed-out request produces an empty result, the diff sees every entry vanish,
 * and the feed is wiped over a hiccup. With it, the previous result stands in — but only for a
 * while: past `maxAge` stale data is worse than none, since a meeting that ended an hour ago
 * would still be holding the switch off. After that the failure surfaces and the caller decides.
 *
 * The cache is in memory on purpose. A restart re-collects everything anyway, so persisting it
 * would add serialisation and staleness questions to buy nothing.
 */
export function withLastKnownGood(
  source: SignalSourcePort,
  options: LastKnownGoodOptions,
): SignalSourcePort {
  let cached: { signals: Signal[]; at: number } | undefined;

  return {
    id: source.id,
    async collect(now: Date): Promise<Signal[]> {
      try {
        const signals = await source.collect(now);
        cached = { signals, at: now.getTime() };
        return signals;
      } catch (error) {
        if (cached !== undefined && now.getTime() - cached.at <= options.maxAgeMs) {
          return cached.signals;
        }
        throw error;
      }
    },
  };
}
