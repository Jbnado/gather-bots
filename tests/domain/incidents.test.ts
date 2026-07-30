import { describe, expect, test } from "vitest";
import { applyIncident, toIncidentSignals } from "../../src/domain/incidents.js";

const T0 = Date.parse("2026-07-30T12:00:00Z");
const later = (minutes: number) => T0 + minutes * 60_000;

const down = { id: "api-prod", status: "down" as const, title: "API production", url: "https://status.example.com/api" };

describe("applyIncident", () => {
  // Presence in the map *is* the outage: there is no stored status field, so an entry can never
  // disagree with itself about whether the check is down.
  test("records a new outage", () => {
    const state = applyIncident({}, down, T0);

    expect(state["api-prod"]).toMatchObject({ title: "API production", since: T0, lastSeen: T0 });
  });

  // Recovery has to clear the entry, otherwise the light stays on after the site comes back.
  test("clears the outage when recovery arrives", () => {
    const opened = applyIncident({}, down, T0);
    const closed = applyIncident(opened, { ...down, status: "up" }, later(5));

    expect(closed["api-prod"]).toBeUndefined();
  });

  test("keeps the original start time when the same outage is reported again", () => {
    const opened = applyIncident({}, down, T0);
    const repeated = applyIncident(opened, down, later(30));

    expect(repeated["api-prod"]?.since).toBe(T0);
  });

  test("tracks unrelated checks separately", () => {
    const a = applyIncident({}, down, T0);
    const b = applyIncident(a, { ...down, id: "db-prod", title: "Database" }, T0);

    expect(Object.keys(b).sort()).toEqual(["api-prod", "db-prod"]);
  });
});

describe("toIncidentSignals", () => {
  test("emits a failed prod signal for an open outage", () => {
    const state = applyIncident({}, down, T0);
    const [signal] = toIncidentSignals(state, new Date(later(1)), { ttlHours: 24 });

    expect(signal).toMatchObject({
      id: "incident:api-prod",
      kind: "incident",
      state: "failed",
      environment: "prod",
      url: "https://status.example.com/api",
    });
  });

  // A monitor that dies mid-outage never sends recovery. Holding the alarm on forever would
  // teach everyone to ignore the object, so an unrefreshed outage ages out.
  test("drops an outage nobody has confirmed for longer than the ttl", () => {
    const state = applyIncident({}, down, T0);
    const signals = toIncidentSignals(state, new Date(later(25 * 60)), { ttlHours: 24 });

    expect(signals).toEqual([]);
  });

  test("keeps an outage that is still within the ttl", () => {
    const state = applyIncident({}, down, T0);
    const signals = toIncidentSignals(state, new Date(later(23 * 60)), { ttlHours: 24 });

    expect(signals).toHaveLength(1);
  });

  test("says how long the outage has been going in the title", () => {
    const state = applyIncident({}, down, T0);
    const [signal] = toIncidentSignals(state, new Date(later(90)), { ttlHours: 24 });

    expect(signal?.title).toBe("API production · fora há 1h30");
  });
});
