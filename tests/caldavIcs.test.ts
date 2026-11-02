import { describe, expect, it } from "vitest";
import { parseCalendarData } from "../src/sync/caldav/ics";

const CRLF = "\r\n";
const now = new Date(2026, 10, 1, 12, 0, 0);

function localKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function calendar(...lines: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...lines, "END:VCALENDAR"].join(CRLF);
}

describe("iCalendar parsing", () => {
  it("keeps an all-day event on its date", () => {
    const [event] = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:all-day-1",
        "DTSTART;VALUE=DATE:20261102",
        "DTEND;VALUE=DATE:20261103",
        "SUMMARY:Offsite",
        "DESCRIPTION:Line one\\nLine two",
        "CATEGORIES:Work,Personal",
        "END:VEVENT",
      ),
      { now },
    );

    expect(event.startAt).toBe("2026-11-02");
    expect(event.endAt).toBeNull();
    expect(event.allDay).toBe(true);
    expect(event.key).toBe("all-day-1");
    expect(event.title).toBe("Offsite");
    expect(event.notes).toBe("Line one\nLine two");
    expect(event.categories).toEqual(["Work", "Personal"]);
  });

  it("converts a UTC event to local wall-clock time", () => {
    const [event] = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:utc-1",
        "DTSTART:20261102T140000Z",
        "DTEND:20261102T150000Z",
        "SUMMARY:Call",
        "END:VEVENT",
      ),
      { now },
    );
    const start = new Date(Date.UTC(2026, 10, 2, 14, 0));
    const end = new Date(Date.UTC(2026, 10, 2, 15, 0));
    expect(event.startAt).toBe(localKey(start));
    expect(event.endAt).toBe(localKey(end));
    expect(event.allDay).toBe(false);
  });

  it("resolves an IANA TZID", () => {
    const [event] = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:tz-1",
        "DTSTART;TZID=America/New_York:20261102T090000",
        "DTEND;TZID=America/New_York:20261102T100000",
        "SUMMARY:Standup",
        "END:VEVENT",
      ),
      { now },
    );
    // 09:00 EST is 14:00 UTC on 2 November 2026.
    expect(event.startAt).toBe(localKey(new Date(Date.UTC(2026, 10, 2, 14, 0))));
  });

  it("treats a floating time as local time", () => {
    const [event] = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:floating-1",
        "DTSTART:20261102T090000",
        "SUMMARY:Focus",
        "END:VEVENT",
      ),
      { now },
    );
    expect(event.startAt).toBe("2026-11-02T09:00");
  });

  it("unfolds folded lines", () => {
    const [event] = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:fold-1",
        "DTSTART:20261102T090000",
        "SUMMARY:A very long",
        "  title",
        "DESCRIPTION:First line",
        "  continues here",
        "END:VEVENT",
      ),
      { now },
    );
    expect(event.title).toBe("A very long title");
    expect(event.notes).toBe("First line continues here");
  });

  it("expands a weekly BYDAY series and reports EXDATE as a cancellation", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:weekly-1",
        "DTSTART:20261102T090000",
        "DTEND:20261102T100000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4",
        "EXDATE:20261104T090000",
        "SUMMARY:Planning",
        "END:VEVENT",
      ),
      { now },
    );
    const active = events.filter((event) => !event.cancelled);
    expect(active.map((event) => event.startAt)).toEqual([
      "2026-11-02T09:00",
      "2026-11-09T09:00",
      "2026-11-11T09:00",
    ]);
    expect(active[0].key).toBe("weekly-1#occ=2026-11-02T09:00");
    expect(active[1].key).toBe("weekly-1#occ=2026-11-09T09:00");
    expect(events.filter((event) => event.cancelled)).toEqual([
      expect.objectContaining({
        uid: "weekly-1",
        key: "weekly-1#occ=2026-11-04T09:00",
        cancelled: true,
      }),
    ]);
  });

  it("stops a daily all-day series at UNTIL", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:daily-1",
        "DTSTART;VALUE=DATE:20261101",
        "RRULE:FREQ=DAILY;UNTIL=20261103",
        "SUMMARY:Habit",
        "END:VEVENT",
      ),
      { now },
    );
    expect(events.map((event) => event.startAt)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(events.every((event) => event.allDay)).toBe(true);
  });

  it("marks a cancelled event instead of importing it", () => {
    const [event] = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:cancel-1",
        "DTSTART:20261102T090000",
        "SUMMARY:Gone",
        "STATUS:CANCELLED",
        "END:VEVENT",
      ),
      { now },
    );
    expect(event.cancelled).toBe(true);
    expect(event.key).toBe("cancel-1");
  });

  it("replaces one occurrence with its RECURRENCE-ID override", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:series-1",
        "DTSTART:20261102T090000",
        "DTEND:20261102T100000",
        "RRULE:FREQ=WEEKLY;COUNT=3",
        "SUMMARY:Standup",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-1",
        "RECURRENCE-ID:20261109T090000",
        "DTSTART:20261109T150000",
        "DTEND:20261109T163000",
        "SUMMARY:Moved standup",
        "END:VEVENT",
      ),
      { now },
    );
    const active = events.filter((event) => !event.cancelled);
    expect(active.map((event) => event.startAt)).toEqual([
      "2026-11-02T09:00",
      "2026-11-09T15:00",
      "2026-11-16T09:00",
    ]);
    expect(active[1]).toMatchObject({
      key: "series-1#occ=2026-11-09T09:00",
      title: "Moved standup",
      endAt: "2026-11-09T16:30",
    });
  });

  it("cancels a single occurrence without cancelling the series", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:series-2",
        "DTSTART:20261102T090000",
        "RRULE:FREQ=WEEKLY;COUNT=3",
        "SUMMARY:Class",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-2",
        "RECURRENCE-ID:20261109T090000",
        "DTSTART:20261109T090000",
        "STATUS:CANCELLED",
        "END:VEVENT",
      ),
      { now },
    );
    expect(events.filter((event) => !event.cancelled).map((event) => event.startAt)).toEqual([
      "2026-11-02T09:00",
      "2026-11-16T09:00",
    ]);
    expect(events.filter((event) => event.cancelled)).toEqual([
      expect.objectContaining({
        key: "series-2#occ=2026-11-09T09:00",
        cancelled: true,
      }),
    ]);
  });

  it("keeps an override that has no master component", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:orphan-1",
        "RECURRENCE-ID:20261102T090000",
        "DTSTART:20261102T110000",
        "SUMMARY:Moved",
        "END:VEVENT",
      ),
      { now },
    );
    expect(events).toEqual([
      expect.objectContaining({
        key: "orphan-1#occ=2026-11-02T09:00",
        startAt: "2026-11-02T11:00",
        title: "Moved",
      }),
    ]);
  });

  it("ignores a THISANDFUTURE override", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:series-3",
        "DTSTART:20261102T090000",
        "RRULE:FREQ=WEEKLY;COUNT=2",
        "SUMMARY:Weekly",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-3",
        "RECURRENCE-ID;RANGE=THISANDFUTURE:20261109T090000",
        "DTSTART:20261109T100000",
        "SUMMARY:Shifted",
        "END:VEVENT",
      ),
      { now },
    );
    expect(events.map((event) => event.startAt)).toEqual([
      "2026-11-02T09:00",
      "2026-11-09T09:00",
    ]);
    expect(events.every((event) => event.title === "Weekly")).toBe(true);
  });

  it("falls back to local time for an unknown TZID", () => {
    const [event] = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:unknown-tz",
        "DTSTART;TZID=Custom/Zone:20261102T090000",
        "SUMMARY:Odd zone",
        "END:VEVENT",
      ),
      { now },
    );
    expect(event.startAt).toBe("2026-11-02T09:00");
  });

  it("ignores VEVENTs without UID or DTSTART", () => {
    expect(
      parseCalendarData(calendar("BEGIN:VEVENT", "SUMMARY:No uid", "END:VEVENT"), { now }),
    ).toEqual([]);
  });
});
