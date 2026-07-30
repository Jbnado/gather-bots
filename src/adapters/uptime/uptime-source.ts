import { toIncidentSignals } from "../../domain/incidents.js";
import type { Signal } from "../../domain/signal.js";
import type { SignalSourcePort } from "../../ports/signal-source.js";
import type { IncidentStore } from "./incident-store.js";

/**
 * Reads outages that arrived by webhook.
 *
 * It looks like every other source to the core, which is the whole trick: the push adapter writes
 * to the store, this reads from it, and nothing in `src/domain` has to know that some signals
 * arrive rather than being fetched.
 */
export function createUptimeSource(store: IncidentStore, ttlHours: number): SignalSourcePort {
  return {
    id: "uptime",
    async collect(now: Date): Promise<Signal[]> {
      return toIncidentSignals(await store.read(), now, { ttlHours });
    },
  };
}
