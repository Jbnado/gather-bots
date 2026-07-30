import { describe, expect, test } from "vitest";
import {
  type OutlookEvent,
  toOutlookSignals,
} from "../../src/adapters/calendar/map-outlook-events.js";

/** Graph ids really are this long — this one is trimmed but still over the 128 char wire cap. */
const LONG_ID = `AAMkAGI2${"Yk".repeat(70)}wAAA=`;

function event(overrides: Partial<OutlookEvent> = {}): OutlookEvent {
  return {
    id: LONG_ID,
    subject: "Weekly de produto",
    isCancelled: false,
    isAllDay: false,
    showAs: "busy",
    webLink: "https://outlook.office365.com/calendar/item/abc",
    start: { dateTime: "2026-07-30T17:00:00.0000000", timeZone: "UTC" },
    end: { dateTime: "2026-07-30T18:00:00.0000000", timeZone: "UTC" },
    responseStatus: { response: "accepted" },
    ...overrides,
  };
}

describe("toOutlookSignals", () => {
  test("maps a timed event to a calendar event signal", () => {
    const [signal] = toOutlookSignals([event()]);

    expect(signal?.kind).toBe("calendar_event");
    expect(signal?.source).toBe("outlook");
  });

  // Graph ids blow past the 128 char cap on activity.id, so they are hashed to a stable short id.
  test("shortens the id to fit the wire limit while staying stable", () => {
    const [first] = toOutlookSignals([event()]);
    const [again] = toOutlookSignals([event()]);

    expect(first?.id.length).toBeLessThanOrEqual(128);
    expect(first?.id).toMatch(/^outlook:/);
    expect(first?.id).toBe(again?.id);
  });

  test("gives different events different ids", () => {
    const [a] = toOutlookSignals([event()]);
    const [b] = toOutlookSignals([event({ id: `${LONG_ID}X` })]);

    expect(a?.id).not.toBe(b?.id);
  });

  // Graph returns "2026-07-30T17:00:00.0000000" with no offset. Parsed as-is that is read as
  // local time, which in UTC-3 lands three hours off and lights the bulb during the wrong hour.
  test("reads the UTC timestamp as UTC rather than local time", () => {
    const [signal] = toOutlookSignals([event()]);

    expect(signal?.window?.start.toISOString()).toBe("2026-07-30T17:00:00.000Z");
  });

  test("skips cancelled events", () => {
    expect(toOutlookSignals([event({ isCancelled: true })])).toEqual([]);
  });

  test("skips all-day events", () => {
    expect(toOutlookSignals([event({ isAllDay: true })])).toEqual([]);
  });

  test("skips events I declined", () => {
    expect(toOutlookSignals([event({ responseStatus: { response: "declined" } })])).toEqual([]);
  });

  test("skips events shown as free", () => {
    expect(toOutlookSignals([event({ showAs: "free" })])).toEqual([]);
  });

  test("maps an unanswered invite to its own kind", () => {
    const [signal] = toOutlookSignals([event({ responseStatus: { response: "none" } })]);

    expect(signal?.kind).toBe("calendar_invite_unanswered");
  });
});
