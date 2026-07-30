import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { IncidentReport } from "../../src/domain/incidents.js";
import { createWebhookServer } from "../../src/adapters/uptime/webhook-server.js";

const TOKEN = "s3cret-token";

let received: IncidentReport[] = [];
let server: ReturnType<typeof createWebhookServer>;
let base = "";

beforeEach(async () => {
  received = [];
  server = createWebhookServer({
    token: TOKEN,
    apply: async (report) => {
      received.push(report);
    },
  });
  // Port 0 lets the OS pick a free one, so tests never collide with something already listening.
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// null, not undefined: a default parameter fires for undefined too, which silently sent the
// real token and left the unauthenticated case untested.
function post(path: string, body: unknown, token: string | null = TOKEN) {
  return fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token === null ? {} : { "x-webhook-token": token }),
    },
    body: JSON.stringify(body),
  });
}

describe("createWebhookServer", () => {
  test("accepts a generic outage and hands it on", async () => {
    const res = await post("/incidents", { id: "api", status: "down", title: "API" });

    expect(res.status).toBe(202);
    expect(received).toEqual([{ id: "api", status: "down", title: "API", url: undefined }]);
  });

  // The endpoint is reachable from wherever the monitor lives, so an unauthenticated caller
  // must not be able to light up someone's office.
  test("refuses a request with no token", async () => {
    const res = await post("/incidents", { id: "api", status: "down" }, null);

    expect(res.status).toBe(401);
    expect(received).toEqual([]);
  });

  test("refuses a wrong token", async () => {
    const res = await post("/incidents", { id: "api", status: "down" }, "wrong");

    expect(res.status).toBe(401);
    expect(received).toEqual([]);
  });

  test("routes the grafana path through the grafana mapper", async () => {
    const res = await post("/incidents/grafana", {
      alerts: [{ status: "firing", fingerprint: "abc", annotations: { summary: "Latency" } }],
    });

    expect(res.status).toBe(202);
    expect(received[0]).toMatchObject({ id: "abc", status: "down", title: "Latency" });
  });

  test("reads uptimerobot form encoding", async () => {
    const res = await fetch(`${base}/incidents/uptimerobot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-webhook-token": TOKEN,
      },
      body: new URLSearchParams({
        monitorID: "42",
        monitorFriendlyName: "Checkout",
        alertType: "1",
      }),
    });

    expect(res.status).toBe(202);
    expect(received[0]).toMatchObject({ id: "42", status: "down", title: "Checkout" });
  });

  // A monitor with a broken template should get a clear 400, not a 500 that looks like our fault.
  test("answers 400 for a payload it cannot read", async () => {
    const res = await post("/incidents", { status: "down" });

    expect(res.status).toBe(400);
    expect(received).toEqual([]);
  });

  test("answers 404 for an unknown path", async () => {
    expect((await post("/nope", {})).status).toBe(404);
  });

  // Container orchestrators need a liveness probe that does not require them to hold a secret.
  test("serves health without a token", async () => {
    const res = await fetch(`${base}/health`);

    expect(res.status).toBe(200);
  });
});
