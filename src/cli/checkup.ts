/**
 * Reports what is configured, what is off, and what is broken — the first thing to run when
 * something looks wrong, and the thing to read when setting up.
 *
 *   pnpm doctor
 */
import { resolveObjects, resolveSources } from "../wiring.js";
import { assertNodeVersion } from "../node-version.js";

assertNodeVersion();

const ON = "✓";
const OFF = "○";
const BROKEN = "✗";

const objects = await resolveObjects(process.env);
const sources = resolveSources(process.env);

console.log("\nSmart objects");
for (const object of objects) {
  const label = object.label.padEnd(20);
  if (object.state === "on") {
    const name = object.name === undefined ? "" : ` "${object.name}"`;
    console.log(`  ${ON} ${label} ${object.preset} · ${object.surface}${name}`);
  } else if (object.state === "off") {
    console.log(`  ${OFF} ${label} not configured — ${object.reason}`);
  } else {
    console.log(`  ${BROKEN} ${label} ${object.reason}`);
  }
}

console.log("\nIntegrations");
for (const source of sources) {
  const label = source.label.padEnd(34);
  if (source.state === "on") {
    console.log(`  ${ON} ${label} ready`);
  } else if (source.state === "off") {
    console.log(`  ${OFF} ${label} off — missing ${source.missing.join(", ")}`);
    console.log(`  ${" ".repeat(36)}→ ${source.docs}`);
  } else {
    console.log(`  ${BROKEN} ${label} ${source.reason}`);
    console.log(`  ${" ".repeat(36)}→ ${source.docs}`);
  }
}

const liveObjects = objects.filter((o) => o.state === "on").length;
const liveSources = sources.filter((s) => s.state === "on").length;
const broken = [...objects, ...sources].filter((x) => x.state === "broken").length;

console.log(`\n${liveObjects} object(s) · ${liveSources} integration(s) ready`);

// Nothing configured is a first run, not a fault — say what to do rather than what is wrong.
if (liveObjects === 0) {
  console.log("\nNo objects yet. To get started:");
  console.log("  1. In Gather, open Main Menu → Decorate Desk → Smart Objects and place one.");
  console.log("  2. Click it, copy the webhook URL and generate an API key.");
  console.log("  3. Put both in .env (see .env.example), then run pnpm checkup again.");
} else if (liveSources === 0) {
  console.log("\nObjects are reachable but no integration is configured, so nothing will be");
  console.log("sent. Pick one above and follow its guide.");
}

if (broken > 0) {
  console.log(`\n${broken} item(s) marked ${BROKEN} are configured but not working.`);
  process.exitCode = 1;
}
