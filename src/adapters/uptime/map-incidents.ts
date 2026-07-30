import type { IncidentReport } from "../../domain/incidents.js";

/**
 * Each of these turns one vendor's notification into `IncidentReport[]`. They are the only place
 * that knows a vendor's field names, and they are pure — adding support for another tool means
 * writing one of these and a route, nothing else.
 *
 * They throw on malformed input rather than guessing. An outage opened under a wrong id can never
 * be cleared, because recovery arrives under the right one and matches nothing.
 */

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function fromGeneric(body: Record<string, unknown>): IncidentReport[] {
  const id = text(body["id"]);
  if (id === undefined) throw new Error("missing id");

  const status = text(body["status"]);
  if (status !== "down" && status !== "up") {
    throw new Error(`status must be "down" or "up", got ${JSON.stringify(body["status"])}`);
  }

  return [
    {
      id,
      status,
      title: text(body["title"]) ?? id,
      url: text(body["url"]),
    },
  ];
}

type GrafanaAlert = {
  status?: string;
  fingerprint?: string | undefined;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  generatorURL?: string;
};

/**
 * Grafana unified alerting and Alertmanager send the same envelope: a batch of alerts, each
 * `firing` or `resolved`.
 */
export function fromGrafana(body: { alerts?: GrafanaAlert[] }): IncidentReport[] {
  return (body.alerts ?? []).map((alert) => {
    const labels = alert.labels ?? {};
    const name = text(labels["alertname"]) ?? "alert";

    // The fingerprint is stable across notifications for the same alert, which is exactly what
    // the id needs to be. Without one, the labels that identify the alert are the next best key.
    const id =
      text(alert.fingerprint) ??
      [name, text(labels["instance"])].filter((p) => p !== undefined).join("/");

    return {
      id,
      status: alert.status === "resolved" ? ("up" as const) : ("down" as const),
      title: text(alert.annotations?.["summary"]) ?? name,
      url: text(alert.generatorURL),
    };
  });
}

/** UptimeRobot posts form fields, and `alertType` is a string: 1 down, 2 up, 3 SSL expiry. */
export function fromUptimeRobot(body: Record<string, unknown>): IncidentReport[] {
  const id = text(body["monitorID"]);
  if (id === undefined) throw new Error("missing monitorID");

  const alertType = text(body["alertType"]);

  // An SSL expiry warning is real but it is not an outage; lighting the object for it would
  // train people to ignore the object.
  if (alertType !== "1" && alertType !== "2") return [];

  return [
    {
      id,
      status: alertType === "1" ? "down" : "up",
      title: text(body["monitorFriendlyName"]) ?? id,
      url: text(body["monitorURL"]),
    },
  ];
}
