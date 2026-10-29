import type { Environment, Signal } from "./signal.js";

/** What an uptime monitor tells us, once mapped out of whatever shape it sent. */
export type IncidentReport = {
  /** Stable per monitored check — the same check reporting again must reuse it. */
  id: string;
  /** `degraded` is slow, not down: it answers, but outside what is acceptable. */
  status: "down" | "up" | "degraded";
  title: string;
  url?: string | undefined;
  /** Why the monitor thinks it is down, when it says — "timeout" and "HTTP 502" call for different people. */
  detail?: string | undefined;
  /** Absent means prod: a monitor that does not say which environment it watches is assumed to watch the one that matters. */
  environment?: Environment | undefined;
};

export type OpenIncident = {
  /**
   * Absent means an outage, so state files written before slowdowns existed still read right.
   * One entry per check: a check is down, slow or fine, never two at once.
   */
  severity?: "degraded";
  title: string;
  url?: string;
  /** The latest cause reported; unlike `since`, a repeat replaces it, since the cause can change mid-outage. */
  detail?: string;
  /** Only stored when it is not prod, so state files written before environments existed still read as prod. */
  environment?: "develop";
  /** When the outage was first reported; repeats do not move it. */
  since: number;
  /** Last time the monitor said anything about this check — what the TTL measures. */
  lastSeen: number;
};

/** Plain JSON so it survives a restart in the state file without any revival logic. */
export type IncidentState = Record<string, OpenIncident>;

/**
 * Folds one report into the open set.
 *
 * `since` deliberately survives a repeated `down`, so "out for two hours" stays true when the
 * monitor re-notifies every five minutes. `lastSeen` is what moves, and it is what the TTL uses.
 */
export function applyIncident(
  state: IncidentState,
  report: IncidentReport,
  now: number,
): IncidentState {
  const next = { ...state };

  if (report.status === "up") {
    delete next[report.id];
    return next;
  }

  const severity = report.status === "degraded" ? "degraded" : undefined;
  // Going from down to slow (or back) ends one problem and starts another, so the clock restarts;
  // only a repeat of the same problem keeps it.
  const existing = next[report.id]?.severity === severity ? next[report.id] : undefined;
  next[report.id] = {
    ...(severity === undefined ? {} : { severity }),
    title: report.title,
    ...(report.url === undefined ? {} : { url: report.url }),
    ...(report.detail === undefined ? {} : { detail: report.detail }),
    ...(report.environment === "develop" ? { environment: "develop" as const } : {}),
    since: existing?.since ?? now,
    lastSeen: now,
  };

  return next;
}

function humanDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
}

export type IncidentSignalOptions = {
  /**
   * How long an outage survives without the monitor mentioning it again. A monitor that dies
   * mid-outage never sends recovery, and an alarm nobody can clear is one everybody learns to
   * ignore.
   */
  ttlHours: number;
};

export function toIncidentSignals(
  state: IncidentState,
  now: Date,
  options: IncidentSignalOptions,
): Signal[] {
  const ttlMs = options.ttlHours * 3_600_000;

  return Object.entries(state)
    .filter(([, incident]) => now.getTime() - incident.lastSeen <= ttlMs)
    .map(([id, incident]): Signal => ({
      id: `incident:${id}`,
      source: "uptime",
      // A slowdown is not a failure: it carries no state, so nothing that counts failures —
      // the prod-health bulb included — mistakes it for an outage.
      ...(incident.severity === "degraded"
        ? { kind: "slowdown" as const }
        : { kind: "incident" as const, state: "failed" as const }),
      // Surfaces only render a line of text per entry, so the cause rides on the title; the
      // feed truncates, which is why it goes last.
      title: [
        incident.title,
        `${incident.severity === "degraded" ? "lento" : "fora"} há ${humanDuration(now.getTime() - incident.since)}`,
        ...(incident.detail === undefined ? [] : [incident.detail]),
      ].join(" · "),
      ...(incident.url === undefined ? {} : { url: incident.url }),
      // Staging shows on the feed but does not light the prod bulb; anything not marked otherwise
      // is prod, since the quiet mistake is the dangerous one.
      environment: incident.environment ?? "prod",
      since: new Date(incident.since),
    }));
}
