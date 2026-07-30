import type { Signal } from "../../domain/signal.js";

/** All-day events carry `date`; timed events carry `dateTime`. */
export type GoogleDateTime = { dateTime?: string; date?: string };

export type GoogleEvent = {
  id: string;
  summary?: string | undefined;
  status?: string;
  htmlLink?: string;
  start?: GoogleDateTime;
  end?: GoogleDateTime;
  /** "transparent" means the organiser marked it as not blocking. */
  transparency?: string;
  attendees?: Array<{ self?: boolean; responseStatus?: string }> | undefined;
};

/**
 * An event only matters here if it occupies a specific hour and I am actually expected at it.
 * All-day entries (holidays, birthdays, "Férias") would otherwise hold the switch off for a
 * whole day while saying nothing about whether I can be interrupted.
 */
function timedWindow(event: GoogleEvent): { start: Date; end: Date } | undefined {
  const start = event.start?.dateTime;
  const end = event.end?.dateTime;
  if (start === undefined || end === undefined) return undefined;
  return { start: new Date(start), end: new Date(end) };
}

function myResponse(event: GoogleEvent): string | undefined {
  return event.attendees?.find((a) => a.self === true)?.responseStatus;
}

export function toCalendarSignals(events: readonly GoogleEvent[]): Signal[] {
  const signals: Signal[] = [];

  for (const event of events) {
    if (event.status === "cancelled") continue;
    if (event.transparency === "transparent") continue;

    const window = timedWindow(event);
    if (window === undefined) continue;

    const response = myResponse(event);
    if (response === "declined") continue;

    // No attendee list at all means a solo block I put on my own calendar.
    const unanswered = response === "needsAction";

    signals.push({
      id: `gcal:${event.id}`,
      source: "gcal",
      kind: unanswered ? "calendar_invite_unanswered" : "calendar_event",
      title: event.summary ?? "(sem título)",
      ...(event.htmlLink === undefined ? {} : { url: event.htmlLink }),
      window,
      since: window.start,
    });
  }

  return signals;
}
