/**
 * One-time Google authorisation. Opens the consent screen, catches the redirect on a local port,
 * exchanges the code and prints the refresh token to paste into .env.
 *
 *   pnpm authorize:google
 *
 * Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from a "Desktop app" OAuth client.
 * See docs/integrations/google-calendar.md for the console steps.
 */
import { createServer } from "node:http";
import { assertNodeVersion } from "../node-version.js";
import { openBrowser } from "../open-browser.js";

assertNodeVersion();

/** Least privilege: reading events is all this service ever does. */
const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.");
  console.error("Step by step: docs/integrations/google-calendar.md");
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    // offline + consent is what makes Google hand back a refresh token rather than only an
    // access token; without prompt=consent a repeat authorisation silently omits it.
    access_type: "offline",
    prompt: "consent",
  });

const code = await new Promise<string>((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", REDIRECT);
    const received = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      received
        ? "<h2>Authorised.</h2><p>You can close this tab and return to the terminal.</p>"
        : `<h2>Failed.</h2><p>${error ?? "no code returned"}</p>`,
    );

    server.close();
    if (received) resolve(received);
    else reject(new Error(error ?? "authorisation returned no code"));
  });

  server.listen(PORT, () => {
    console.log("Opening the consent screen in your browser...");
    console.log(`If it does not open, paste this URL:\n\n${authUrl}\n`);
    openBrowser(authUrl);
  });
});

const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT,
    grant_type: "authorization_code",
  }),
});

const body = (await res.json()) as { refresh_token?: string; error_description?: string };

if (!res.ok || !body.refresh_token) {
  console.error(`Token exchange failed: ${body.error_description ?? res.status}`);
  process.exit(1);
}

console.log("\nDone. Paste this line into .env:\n");
console.log(`GOOGLE_REFRESH_TOKEN=${body.refresh_token}`);
console.log("\nThen run: pnpm checkup");
