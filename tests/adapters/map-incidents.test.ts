import { describe, expect, test } from "vitest";
import {
  fromGeneric,
  fromGrafana,
  fromUpwatch,
  fromUptimeRobot,
} from "../../src/adapters/uptime/map-incidents.js";

describe("fromGeneric", () => {
  test("accepts the documented shape", () => {
    const reports = fromGeneric({
      id: "api",
      status: "down",
      title: "API production",
      url: "https://example.com",
    });

    expect(reports).toEqual([
      { id: "api", status: "down", title: "API production", url: "https://example.com" },
    ]);
  });

  test("falls back to the id when no title is given", () => {
    expect(fromGeneric({ id: "api", status: "up" })[0]?.title).toBe("api");
  });

  // A monitor with a broken template would otherwise open an outage called "undefined" that
  // nobody can clear, because the id would never match again.
  test("rejects a payload with no id", () => {
    expect(() => fromGeneric({ status: "down" })).toThrow(/id/);
  });

  test("rejects an unknown status", () => {
    expect(() => fromGeneric({ id: "api", status: "flapping" })).toThrow(/status/);
  });
});

describe("fromGrafana", () => {
  const alert = {
    status: "firing",
    fingerprint: "abc123",
    labels: { alertname: "HighErrorRate", instance: "api-1" },
    annotations: { summary: "Error rate above 5%" },
    generatorURL: "https://grafana.example.com/alert",
  };

  test("maps a firing alert to an outage", () => {
    const [report] = fromGrafana({ alerts: [alert] });

    expect(report).toEqual({
      id: "abc123",
      status: "down",
      title: "Error rate above 5%",
      url: "https://grafana.example.com/alert",
    });
  });

  test("maps a resolved alert to a recovery", () => {
    const [report] = fromGrafana({ alerts: [{ ...alert, status: "resolved" }] });

    expect(report?.status).toBe("up");
  });

  // One Alertmanager notification carries a batch, and dropping the tail would leave outages
  // permanently open.
  test("maps every alert in the batch", () => {
    const batch = fromGrafana({
      alerts: [alert, { ...alert, fingerprint: "def456", status: "resolved" }],
    });

    expect(batch.map((r) => [r.id, r.status])).toEqual([
      ["abc123", "down"],
      ["def456", "up"],
    ]);
  });

  test("builds an id from the labels when there is no fingerprint", () => {
    const [report] = fromGrafana({ alerts: [{ ...alert, fingerprint: undefined }] });

    expect(report?.id).toBe("HighErrorRate/api-1");
  });

  test("falls back to the alert name when there is no summary", () => {
    const [report] = fromGrafana({ alerts: [{ ...alert, annotations: {} }] });

    expect(report?.title).toBe("HighErrorRate");
  });
});

describe("fromUptimeRobot", () => {
  // UptimeRobot posts form fields, and alertType is a string: 1 down, 2 up, 3 SSL.
  test("maps alertType 1 to an outage", () => {
    const [report] = fromUptimeRobot({
      monitorID: "78901",
      monitorFriendlyName: "Checkout",
      monitorURL: "https://shop.example.com",
      alertType: "1",
    });

    expect(report).toEqual({
      id: "78901",
      status: "down",
      title: "Checkout",
      url: "https://shop.example.com",
    });
  });

  test("maps alertType 2 to a recovery", () => {
    const [report] = fromUptimeRobot({ monitorID: "1", alertType: "2" });

    expect(report?.status).toBe("up");
  });

  // An SSL-expiry notice is not an outage, and treating it as one would light the object for
  // something that needs a calendar entry rather than a page.
  test("ignores the SSL expiry alert type", () => {
    expect(fromUptimeRobot({ monitorID: "1", alertType: "3" })).toEqual([]);
  });

  test("rejects a payload with no monitor id", () => {
    expect(() => fromUptimeRobot({ alertType: "1" })).toThrow(/monitorID/);
  });
});

describe("fromUpwatch", () => {
  // The envelope upwatch's webhook channel sends when no body mapping is configured.
  const envelope = {
    text: "api caiu",
    monitor: "api",
    monitor_id: 42,
    target: "https://api.example.com/health",
    status: "down",
    previous_status: "up",
    message: "connection refused",
    at: "2026-10-28T12:00:00Z",
    duration_seconds: 0,
    group: "RPA/prod",
  };

  test("maps a down notification to an outage", () => {
    expect(fromUpwatch(envelope)).toEqual([
      {
        id: "upwatch:42",
        status: "down",
        title: "RPA/prod · api",
        url: "https://api.example.com/health",
        detail: "connection refused",
      },
    ]);
  });

  // Recovery must land on the same id as the outage, or the light never goes out.
  test("maps up to a recovery under the same id", () => {
    const [report] = fromUpwatch({ ...envelope, status: "up", previous_status: "down" });

    expect(report).toMatchObject({ id: "upwatch:42", status: "up" });
  });

  // Monitors are usually named "api" or "front" inside a group; without the group the title
  // would not say which system is down.
  test("uses the monitor name alone when there is no group", () => {
    const { group: _, ...withoutGroup } = envelope;

    expect(fromUpwatch(withoutGroup)[0]?.title).toBe("api");
    expect(fromUpwatch({ ...envelope, group: "" })[0]?.title).toBe("api");
  });

  // Degraded still answers, and unknown is the absence of a result — neither is an outage, and
  // lighting the object for them would train people to ignore it.
  test.each(["degraded", "unknown"])("ignores %s on purpose", (status) => {
    expect(fromUpwatch({ ...envelope, status })).toEqual([]);
  });

  test("rejects a status it does not know", () => {
    expect(() => fromUpwatch({ ...envelope, status: "flapping" })).toThrow(/status/);
  });

  test("rejects a payload with no numeric monitor id", () => {
    const { monitor_id: _, ...withoutId } = envelope;

    expect(() => fromUpwatch(withoutId)).toThrow(/monitor_id/);
    expect(() => fromUpwatch({ ...envelope, monitor_id: "42" })).toThrow(/monitor_id/);
  });

  // TCP, DNS and ping targets are host names, not pages anyone can open from the feed.
  test("only links the target when it is a web address", () => {
    expect(fromUpwatch({ ...envelope, target: "db.internal:1521" })[0]?.url).toBeUndefined();
  });

  test("omits the detail when there is no message", () => {
    expect(fromUpwatch({ ...envelope, message: "" })[0]?.detail).toBeUndefined();
  });
});
