import { createHash } from "node:crypto";
import type { Signal } from "../../domain/signal.js";

export type GraphDateTime = { dateTime: string; timeZone: string };

export type OutlookEvent = {
  id: string;
  subject?: string;
  isCancelled?: boolean;
  isAllDay?: boolean;
  /** "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown" */
  showAs?: string;
  webLink?: string;
  start?: GraphDateTime;
  end?: GraphDateTime;
  responseStatus?: { response?: string };
};

/**
 * Graph event ids run past 128 characters, which is the cap on `activity.id`. Hashing gives a
 * short id that is stable across runs — required, since the dispatcher matches feed entries by id
 * to decide what changed.
 */
function shortId(graphId: string): string {
  const digest = createHash("sha256").update(graphId).digest("base64url").slice(0, 22);
  return `outlook:${digest}`;
}

/**
 * Graph returns `"2026-07-30T17:00:00.0000000"` with the zone in a separate field, so the string
 * carries no offset. `new Date` would read it as local time — three hours off in UTC-3, which
 * would light the switch during the wrong hour. We request UTC and mark it explicitly.
 */
function parseGraphDate(value: GraphDateTime): Date {
  const utc = value.timeZone.toUpperCase() === "UTC" && !/(Z|[+-]\d{2}:?\d{2})$/.test(value.dateTime);
  return new Date(utc ? `${value.dateTime}Z` : value.dateTime);
}

export function toOutlookSignals(events: readonly OutlookEvent[]): Signal[] {
  const signals: Signal[] = [];

  for (const event of events) {
    if (event.isCancelled === true) continue;
    if (event.isAllDay === true) continue;
    if (event.showAs === "free") continue;

    const response = event.responseStatus?.response;
    if (response === "declined") continue;

    if (event.start === undefined || event.end === undefined) continue;
    const window = { start: parseGraphDate(event.start), end: parseGraphDate(event.end) };

    signals.push({
      id: shortId(event.id),
      source: "outlook",
      kind: response === "none" ? "calendar_invite_unanswered" : "calendar_event",
      title: event.subject ?? "(sem título)",
      ...(event.webLink === undefined ? {} : { url: event.webLink }),
      window,
      since: window.start,
    });
  }

  return signals;
}
