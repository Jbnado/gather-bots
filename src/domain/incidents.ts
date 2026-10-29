import type { Signal } from "./signal.js";

/** What an uptime monitor tells us, once mapped out of whatever shape it sent. */
export type IncidentReport = {
  /** Stable per monitored check — the same check reporting again must reuse it. */
  id: string;
  status: "down" | "up";
  title: string;
  url?: string | undefined;
  /** Why the monitor thinks it is down, when it says — "timeout" and "HTTP 502" call for different people. */
  detail?: string | undefined;
};

export type OpenIncident = {
  title: string;
  url?: string;
  /** The latest cause reported; unlike `since`, a repeat replaces it, since the cause can change mid-outage. */
  detail?: string;
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

  const existing = next[report.id];
  next[report.id] = {
    title: report.title,
    ...(report.url === undefined ? {} : { url: report.url }),
    ...(report.detail === undefined ? {} : { detail: report.detail }),
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
    .map(([id, incident]) => ({
      id: `incident:${id}`,
      source: "uptime" as const,
      kind: "incident" as const,
      // Surfaces only render a line of text per entry, so the cause rides on the title; the
      // feed truncates, which is why it goes last.
      title: [
        incident.title,
        `fora há ${humanDuration(now.getTime() - incident.since)}`,
        ...(incident.detail === undefined ? [] : [incident.detail]),
      ].join(" · "),
      ...(incident.url === undefined ? {} : { url: incident.url }),
      state: "failed" as const,
      // An uptime monitor watches production by definition; nobody pages on staging being down.
      environment: "prod" as const,
      since: new Date(incident.since),
    }));
}
