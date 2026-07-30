import { describe, expect, test } from "vitest";
import {
  fromGeneric,
  fromGrafana,
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
