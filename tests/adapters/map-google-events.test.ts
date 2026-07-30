import { describe, expect, test } from "vitest";
import { type GoogleEvent, toCalendarSignals } from "../../src/adapters/calendar/map-google-events.js";

function event(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: "evt_abc",
    summary: "Weekly de produto",
    status: "confirmed",
    htmlLink: "https://calendar.google.com/event?eid=abc",
    start: { dateTime: "2026-07-30T14:00:00-03:00" },
    end: { dateTime: "2026-07-30T15:00:00-03:00" },
    attendees: [{ self: true, responseStatus: "accepted" }],
    ...overrides,
  };
}

describe("toCalendarSignals", () => {
  test("maps a timed event to a calendar event signal", () => {
    const [signal] = toCalendarSignals([event()]);

    expect(signal?.kind).toBe("calendar_event");
    expect(signal?.id).toBe("gcal:evt_abc");
    expect(signal?.source).toBe("gcal");
    expect(signal?.window).toEqual({
      start: new Date("2026-07-30T14:00:00-03:00"),
      end: new Date("2026-07-30T15:00:00-03:00"),
    });
  });

  test("skips cancelled events", () => {
    expect(toCalendarSignals([event({ status: "cancelled" })])).toEqual([]);
  });

  // An all-day "Férias" or a birthday would otherwise hold the switch off for the whole day.
  test("skips all-day events, which do not occupy a specific hour", () => {
    const allDay = event({ start: { date: "2026-07-30" }, end: { date: "2026-07-31" } });

    expect(toCalendarSignals([allDay])).toEqual([]);
  });

  test("skips events I declined", () => {
    const declined = event({ attendees: [{ self: true, responseStatus: "declined" }] });

    expect(toCalendarSignals([declined])).toEqual([]);
  });

  // Google's "show me as free" flag means the event is on the calendar but not blocking.
  test("skips events marked as free", () => {
    expect(toCalendarSignals([event({ transparency: "transparent" })])).toEqual([]);
  });

  test("maps an unanswered invite to its own kind", () => {
    const invite = event({ attendees: [{ self: true, responseStatus: "needsAction" }] });
    const [signal] = toCalendarSignals([invite]);

    expect(signal?.kind).toBe("calendar_invite_unanswered");
    expect(signal?.url).toBe("https://calendar.google.com/event?eid=abc");
  });

  test("treats an event with no attendees as mine", () => {
    const solo = event({ attendees: undefined });

    expect(toCalendarSignals([solo])[0]?.kind).toBe("calendar_event");
  });

  test("falls back to a placeholder when the event has no title", () => {
    expect(toCalendarSignals([event({ summary: undefined })])[0]?.title).toBe("(sem título)");
  });
});
