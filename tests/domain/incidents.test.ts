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

  // The cause is what tells people whether to drop everything: "timeout" and "500" are different
  // conversations.
  test("appends the cause to the title when the monitor sent one", () => {
    const state = applyIncident({}, { ...down, detail: "connection refused" }, T0);
    const [signal] = toIncidentSignals(state, new Date(later(5)), { ttlHours: 24 });

    expect(signal?.title).toBe("API production · fora há 5min · connection refused");
  });

  test("shows the latest cause when the outage is reported again", () => {
    const opened = applyIncident({}, { ...down, detail: "timeout" }, T0);
    const repeated = applyIncident(opened, { ...down, detail: "HTTP 502" }, later(5));

    expect(repeated["api-prod"]?.detail).toBe("HTTP 502");
  });
});

// Slow is not down. A slowdown shares the check's id with its outage, so each transition replaces
// the other — a check is down, slow or fine, never two at once.
describe("slowdowns", () => {
  const slow = { ...down, status: "degraded" as const, detail: "latência 2300ms" };

  test("down then degraded closes the outage and opens a slowdown", () => {
    const opened = applyIncident({}, down, T0);
    const slowed = applyIncident(opened, slow, later(10));

    expect(slowed["api-prod"]).toMatchObject({ severity: "degraded", since: later(10) });
  });

  test("degraded then down closes the slowdown and opens an outage", () => {
    const slowed = applyIncident({}, slow, T0);
    const opened = applyIncident(slowed, down, later(10));

    expect(opened["api-prod"]?.severity).toBeUndefined();
    expect(opened["api-prod"]?.since).toBe(later(10));
  });

  test("degraded then up closes the slowdown", () => {
    const slowed = applyIncident({}, slow, T0);

    expect(applyIncident(slowed, { ...down, status: "up" }, later(5))["api-prod"]).toBeUndefined();
  });

  test("keeps the start of a slowdown that is reported again", () => {
    const slowed = applyIncident({}, slow, T0);

    expect(applyIncident(slowed, slow, later(30))["api-prod"]?.since).toBe(T0);
  });

  test("emits a slowdown signal that is not a failure", () => {
    const state = applyIncident({}, slow, T0);
    const [signal] = toIncidentSignals(state, new Date(later(5)), { ttlHours: 24 });

    expect(signal).toMatchObject({ id: "incident:api-prod", kind: "slowdown", environment: "prod" });
    expect(signal?.state).toBeUndefined();
    expect(signal?.title).toBe("API production · lento há 5min · latência 2300ms");
  });

  // A forgotten slowdown would hold the attention face forever, exactly like a forgotten outage.
  test("ages out like an outage", () => {
    const state = applyIncident({}, slow, T0);

    expect(toIncidentSignals(state, new Date(later(25 * 60)), { ttlHours: 24 })).toEqual([]);
  });
});

