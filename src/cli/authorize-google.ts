/**
 * One-time Google authorisation. Opens the consent screen, catches the redirect on a local port,
 * exchanges the code and prints the refresh token to paste into .env.
 *
 *   pnpm authorize:google
 *
 * Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from a "Desktop app" OAuth client.
 * See docs/setup-google.md for the console steps.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";

/** Least privilege: reading events is all this service ever does. */
const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env primeiro.");
  console.error("Passo a passo: docs/setup-google.md");
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
        ? "<h2>Autorizado.</h2><p>Pode fechar esta aba e voltar ao terminal.</p>"
        : `<h2>Falhou.</h2><p>${error ?? "sem código"}</p>`,
    );

    server.close();
    if (received) resolve(received);
    else reject(new Error(error ?? "authorisation returned no code"));
  });

  server.listen(PORT, () => {
    console.log("Abrindo o consentimento no browser...");
    console.log(`Se não abrir sozinho, cole esta URL:\n\n${authUrl}\n`);
    spawn("cmd", ["/c", "start", "", authUrl], { detached: true, stdio: "ignore" }).unref();
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
  console.error(`Troca do código falhou: ${body.error_description ?? res.status}`);
  process.exit(1);
}

console.log("\nPronto. Cole esta linha no .env:\n");
console.log(`GOOGLE_REFRESH_TOKEN=${body.refresh_token}`);
console.log("\nDepois rode: pnpm once");
