/**
 * One-time Microsoft authorisation via device code — no redirect URI to register, which matters
 * when the tenant is the company's and you may not own the app registration.
 *
 *   pnpm authorize:outlook
 *
 * Needs MS_TENANT_ID and MS_CLIENT_ID. See docs/setup-outlook.md.
 */
// This file has no imports, so without an explicit export marker TypeScript treats it as a
// script and rejects the top-level awaits below.
export {};

const SCOPE = "Calendars.Read offline_access";

const tenant = process.env.MS_TENANT_ID;
const clientId = process.env.MS_CLIENT_ID;

if (!tenant || !clientId) {
  console.error("Preencha MS_TENANT_ID e MS_CLIENT_ID no .env primeiro.");
  console.error("Passo a passo: docs/setup-outlook.md");
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
  console.error(`Não consegui iniciar: ${flow.error_description ?? start.status}`);
  process.exit(1);
}

console.log(`\nAbra:  ${flow.verification_uri}`);
console.log(`Código: ${flow.user_code}\n`);
console.log("Aguardando você autorizar...");

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
    console.log("\nPronto. Cole esta linha no .env:\n");
    console.log(`MS_REFRESH_TOKEN=${body.refresh_token}`);
    console.log("\nDepois rode: pnpm once");
    process.exit(0);
  }

  if (body.error !== "authorization_pending" && body.error !== "slow_down") {
    console.error(`\nFalhou: ${body.error_description ?? body.error}`);
    process.exit(1);
  }
}

console.error("\nTempo esgotado — rode de novo.");
process.exit(1);
