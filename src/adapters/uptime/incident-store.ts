import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { applyIncident, type IncidentReport, type IncidentState } from "../../domain/incidents.js";

/**
 * Open outages, on disk.
 *
 * Persistence is the point: a restart during an outage must not turn the light green while the
 * site is still down. Recovery may not arrive for hours, and it only arrives once.
 *
 * Nothing is cached in memory, deliberately. The webhook server and the polling source hold
 * separate handles to this file, and a cache in either would let one miss the other's writes —
 * the outage would be recorded and then never shown. A few kilobytes of JSON once a minute is
 * not a cost worth that class of bug.
 */
export function createIncidentStore(path: string) {
  // Writes are read-modify-write, and two notifications arriving together would otherwise
  // interleave and lose one. Chaining keeps them in order without a lock.
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<IncidentState> {
    try {
      return JSON.parse(await readFile(path, "utf8")) as IncidentState;
    } catch {
      return {};
    }
  }

  return {
    read,
    apply(report: IncidentReport, now: Date): Promise<void> {
      const next = queue.then(async () => {
        const state = applyIncident(await read(), report, now.getTime());
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify(state, null, 2));
      });
      // Swallow here so one failed write does not poison every later one; the caller still sees it.
      queue = next.catch(() => undefined);
      return next;
    },
  };
}

export type IncidentStore = ReturnType<typeof createIncidentStore>;
