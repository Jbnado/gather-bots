/**
 * Local composition root: resolves what is configured, wires it into the core, and drives ticks.
 *
 *   pnpm once     one tick, then exit
 *   pnpm start    tick every POLL_INTERVAL_SECONDS
 *
 * Everything it knows comes from the two registries — `src/integrations/index.ts` and
 * `src/objects/registry.ts`. Adding an integration never means editing this file.
 */
import { createFileStateStore } from "./adapters/state/file-state-store.js";
import { refresh } from "./domain/refresh.js";
import { resolveObjects, resolveSources } from "./wiring.js";
import { assertNodeVersion } from "./node-version.js";

assertNodeVersion();

const once = process.argv.includes("--once");

const objects = await resolveObjects(process.env);
const sources = resolveSources(process.env);

for (const object of objects) {
  if (object.state === "broken") console.warn(`skip object ${object.key}: ${object.reason}`);
}
for (const source of sources) {
  if (source.state === "broken") console.warn(`skip integration ${source.id}: ${source.reason}`);
}

const targets = objects.flatMap((o) => (o.state === "on" ? [o.target] : []));
const live = sources.flatMap((s) => (s.state === "on" ? [s.source] : []));

// Refusing to start is friendlier than looping forever doing nothing.
if (targets.length === 0 || live.length === 0) {
  console.error("Nothing to do yet — run `pnpm doctor` to see what is missing.");
  process.exit(1);
}

const store = createFileStateStore(process.env.STATE_FILE ?? "./state/last-sent.json");

async function tick(): Promise<void> {
  try {
    const result = await refresh({ sources: live, targets, store, now: new Date() });
    const failed = result.failed.length === 0 ? "" : `  (${result.failed.join(", ")} failed)`;
    console.log(
      `${new Date().toISOString()}  ${result.signals} signals  ${result.commands} sent${failed}`,
    );
  } catch (error) {
    // A failed tick leaves the objects on their last good state; the next one retries.
    console.error(`${new Date().toISOString()}  tick failed: ${(error as Error).message}`);
  }
}

await tick();

if (!once) {
  const seconds = Number(process.env.POLL_INTERVAL_SECONDS ?? 60);
  console.log(`polling every ${seconds}s — ctrl+c to stop`);
  setInterval(() => void tick(), seconds * 1000);
}
