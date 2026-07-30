/**
 * One-time Microsoft authorisation via device code — no redirect URI to register, which matters
 * when the tenant belongs to your employer and you may not own the app registration.
 *
 *   pnpm authorize:outlook
 *
 * Needs MS_TENANT_ID and MS_CLIENT_ID. See docs/integrations/outlook.md.
 */
import { assertNodeVersion } from "../node-version.js";

assertNodeVersion();

const SCOPE = "Calendars.Read offline_access";

const tenant = process.env.MS_TENANT_ID;
const clientId = process.env.MS_CLIENT_ID;

if (!tenant || !clientId) {
  console.error("Set MS_TENANT_ID and MS_CLIENT_ID in .env first.");
  console.error("Step by step: docs/integrations/outlook.md");
  process.exit(1);
}

const base = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;

const start = await fetch(`${base}/devicecode`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ client_id: clientId, scope: SCOPE }),
});

const flow = (await start.json()) as {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  interval?: number;
  error_description?: string;
};

if (!start.ok || !flow.device_code) {
  console.error(`Could not start: ${flow.error_description ?? start.status}`);
  process.exit(1);
}

console.log(`\nOpen:  ${flow.verification_uri}`);
console.log(`Code:  ${flow.user_code}\n`);
console.log("Waiting for you to approve...");

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// The endpoint answers authorization_pending until the browser step completes; polling faster
// than `interval` earns a slow_down and a longer wait, so we honour what it asked for.
const pollEvery = (flow.interval ?? 5) * 1000;
const deadline = Date.now() + 10 * 60_000;

while (Date.now() < deadline) {
  await wait(pollEvery);

  const res = await fetch(`${base}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: clientId,
      device_code: flow.device_code,
    }),
  });

  const body = (await res.json()) as {
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (res.ok && body.refresh_token) {
    console.log("\nDone. Paste this line into .env:\n");
    console.log(`MS_REFRESH_TOKEN=${body.refresh_token}`);
    console.log("\nThen run: pnpm checkup");
    process.exit(0);
  }

  if (body.error !== "authorization_pending" && body.error !== "slow_down") {
    console.error(`\nFailed: ${body.error_description ?? body.error}`);
    process.exit(1);
  }
}

console.error("\nTimed out — run it again.");
process.exit(1);
