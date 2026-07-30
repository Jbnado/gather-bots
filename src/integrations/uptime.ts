import { createIncidentStore } from "../adapters/uptime/incident-store.js";
import { createUptimeSource } from "../adapters/uptime/uptime-source.js";
import { createWebhookServer } from "../adapters/uptime/webhook-server.js";
import { optional, required } from "./env.js";
import type { Env, Integration } from "./registry.js";

const DEFAULT_PORT = 8787;
const DEFAULT_TTL_HOURS = 24;

function storePath(env: Env): string {
  return optional(env, "UPTIME_STATE_FILE") ?? "./state/incidents.json";
}

function ttlHours(env: Env): number {
  const raw = Number(optional(env, "UPTIME_TTL_HOURS") ?? DEFAULT_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_HOURS;
}

/**
 * The only push integration so far: an uptime monitor posts here when something goes down, and
 * the state it writes is read like any other source on the next tick.
 */
export const uptimeWebhook: Integration = {
  id: "uptime-webhook",
  label: "Uptime monitor (webhook)",
  docs: "docs/integrations/uptime.md",
  env: [
    {
      name: "UPTIME_WEBHOOK_TOKEN",
      required: true,
      describe: "shared secret your monitor sends in the x-webhook-token header",
    },
    { name: "UPTIME_WEBHOOK_PORT", required: false, describe: `listen port (default ${DEFAULT_PORT})` },
    {
      name: "UPTIME_TTL_HOURS",
      required: false,
      describe: `drop an outage nobody re-reports after this long (default ${DEFAULT_TTL_HOURS})`,
    },
    { name: "UPTIME_STATE_FILE", required: false, describe: "where open outages are persisted" },
  ],

  create: (env) => createUptimeSource(createIncidentStore(storePath(env)), ttlHours(env)),

  start: async (env) => {
    const store = createIncidentStore(storePath(env));
    const server = createWebhookServer({
      token: required(env, "UPTIME_WEBHOOK_TOKEN"),
      apply: (report, now) => store.apply(report, now),
    });

    const port = Number(optional(env, "UPTIME_WEBHOOK_PORT") ?? DEFAULT_PORT);
    await new Promise<void>((resolve) => server.listen(port, resolve));
    console.log(`uptime webhook listening on :${port}`);

    return () => new Promise<void>((resolve) => server.close(() => resolve()));
  },
};
