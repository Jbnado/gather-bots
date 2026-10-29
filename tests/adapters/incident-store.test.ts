import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createIncidentStore } from "../../src/adapters/uptime/incident-store.js";

const T0 = new Date("2026-10-28T12:00:00Z");

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "incident-store-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("createIncidentStore", () => {
  // A restart must not clear a slowdown any more than an outage: the recovery may already have
  // been sent, and it only arrives once.
  test("a slowdown survives a restart", async () => {
    const path = join(dir, "incidents.json");
    await createIncidentStore(path).apply(
      { id: "upwatch:1", status: "degraded", title: "api", detail: "lento" },
      T0,
    );

    const reopened = await createIncidentStore(path).read();

    expect(reopened["upwatch:1"]).toMatchObject({ severity: "degraded", detail: "lento" });
  });

  test("down then degraded leaves only the slowdown on disk", async () => {
    const store = createIncidentStore(join(dir, "incidents.json"));
    await store.apply({ id: "upwatch:1", status: "down", title: "api" }, T0);
    await store.apply({ id: "upwatch:1", status: "degraded", title: "api" }, T0);

    expect(Object.values(await store.read()).map((i) => i.severity)).toEqual(["degraded"]);
  });
});
