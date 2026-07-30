import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { IncidentReport } from "../../domain/incidents.js";
import { fromGeneric, fromGrafana, fromUptimeRobot } from "./map-incidents.js";

/** Refuse a body larger than this rather than buffering whatever an unauthenticated caller sends. */
const MAX_BODY_BYTES = 64 * 1024;

export type WebhookServerOptions = {
  token: string;
  apply: (report: IncidentReport, now: Date) => Promise<void>;
  now?: () => Date;
};

/** Compared in constant time so a wrong token cannot be found one character at a time. */
function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (provided === undefined) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the length.
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("payload too large");
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

/** UptimeRobot posts form fields; Grafana and the generic contract post JSON. */
function parseBody(raw: string, contentType: string | undefined): Record<string, unknown> {
  if (contentType?.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  const parsed: unknown = JSON.parse(raw === "" ? "{}" : raw);
  if (typeof parsed !== "object" || parsed === null) throw new Error("body must be an object");
  return parsed as Record<string, unknown>;
}

const ROUTES: Record<string, (body: Record<string, unknown>) => IncidentReport[]> = {
  "/incidents": fromGeneric,
  "/incidents/grafana": (body) => fromGrafana(body as { alerts?: [] }),
  "/incidents/uptimerobot": fromUptimeRobot,
};

/**
 * Receives outage notifications. This is a *driving* adapter: it pushes into the same incident
 * state the uptime source later reads, so the polling core never learns that something arrived
 * by HTTP rather than by asking.
 */
export function createWebhookServer(options: WebhookServerOptions): Server {
  const now = options.now ?? (() => new Date());

  return createServer((req, res) => {
    void (async () => {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;

      // Deliberately before the token check: an orchestrator probing liveness should not need
      // to hold a secret.
      if (req.method === "GET" && path === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"status":"ok"}');
        return;
      }

      const mapper = ROUTES[path];
      if (req.method !== "POST" || mapper === undefined) {
        res.writeHead(404).end();
        return;
      }

      if (!tokenMatches(req.headers["x-webhook-token"] as string | undefined, options.token)) {
        res.writeHead(401).end();
        return;
      }

      try {
        const body = parseBody(await readBody(req), req.headers["content-type"]);
        const reports = mapper(body);
        for (const report of reports) await options.apply(report, now());

        // 202 rather than 200: the object updates on the next tick, not during this request.
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ accepted: reports.length }));
      } catch (error) {
        // A monitor with a broken template deserves to know it is its own fault.
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
    })();
  });
}
