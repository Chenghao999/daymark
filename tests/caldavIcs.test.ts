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

  it("shifts this and future occurrences with a THISANDFUTURE override", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:series-3",
        "DTSTART:20261102T090000",
        "DTEND:20261102T100000",
        "RRULE:FREQ=WEEKLY;COUNT=4",
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
      "2026-11-09T10:00",
      "2026-11-16T10:00",
      "2026-11-23T10:00",
    ]);
    expect(events.map((event) => event.key)).toEqual([
      "series-3#occ=2026-11-02T09:00",
      "series-3#occ=2026-11-09T09:00",
      "series-3#occ=2026-11-16T09:00",
      "series-3#occ=2026-11-23T09:00",
    ]);
    expect(events.map((event) => event.title)).toEqual([
      "Weekly",
      "Shifted",
      "Shifted",
      "Shifted",
    ]);
    expect(events[1].endAt).toBe("2026-11-09T11:00");
  });

  it("cancels this and future occurrences with a THISANDFUTURE override", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:series-4",
        "DTSTART:20261102T090000",
        "RRULE:FREQ=DAILY;COUNT=3",
        "SUMMARY:Daily",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-4",
        "RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T090000",
        "DTSTART:20261103T090000",
        "STATUS:CANCELLED",
        "END:VEVENT",
      ),
      { now },
    );
    expect(events.filter((event) => !event.cancelled).map((event) => event.startAt)).toEqual([
      "2026-11-02T09:00",
    ]);
    expect(events.filter((event) => event.cancelled).map((event) => event.key)).toEqual([
      "series-4#occ=2026-11-03T09:00",
      "series-4#occ=2026-11-04T09:00",
    ]);
  });

  it("shifts this and prior occurrences with a THISANDPRIOR override", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:series-4p",
        "DTSTART:20261102T090000",
        "DTEND:20261102T100000",
        "RRULE:FREQ=WEEKLY;COUNT=3",
        "SUMMARY:Weekly",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-4p",
        "RECURRENCE-ID;RANGE=THISANDPRIOR:20261109T090000",
        "DTSTART:20261109T100000",
        "SUMMARY:Earlier shifted",
        "END:VEVENT",
      ),
      { now },
    );
    expect(events.map((event) => [event.key, event.startAt, event.title])).toEqual([
      ["series-4p#occ=2026-11-02T09:00", "2026-11-02T10:00", "Earlier shifted"],
      ["series-4p#occ=2026-11-09T09:00", "2026-11-09T10:00", "Earlier shifted"],
      ["series-4p#occ=2026-11-16T09:00", "2026-11-16T09:00", "Weekly"],
    ]);
    expect(events[0].endAt).toBe("2026-11-02T11:00");
  });

  it("cancels this and prior occurrences with a THISANDPRIOR override", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:series-4c",
        "DTSTART:20261102T090000",
        "RRULE:FREQ=DAILY;COUNT=4",
        "SUMMARY:Daily",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-4c",
        "RECURRENCE-ID;RANGE=THISANDPRIOR:20261104T090000",
        "DTSTART:20261104T090000",
        "STATUS:CANCELLED",
        "END:VEVENT",
      ),
      { now },
    );
    expect(events.filter((event) => !event.cancelled).map((event) => event.startAt)).toEqual([
      "2026-11-05T09:00",
    ]);
    expect(events.filter((event) => event.cancelled).map((event) => event.key)).toEqual([
      "series-4c#occ=2026-11-02T09:00",
      "series-4c#occ=2026-11-03T09:00",
      "series-4c#occ=2026-11-04T09:00",
    ]);
  });

  it("lets the closest THISANDPRIOR override win", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:series-4n",
        "DTSTART:20261102T090000",
        "RRULE:FREQ=DAILY;COUNT=5",
        "SUMMARY:Daily",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-4n",
        "RECURRENCE-ID;RANGE=THISANDPRIOR:20261103T090000",
        "DTSTART:20261103T100000",
        "SUMMARY:Ten",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-4n",
        "RECURRENCE-ID;RANGE=THISANDPRIOR:20261104T090000",
        "DTSTART:20261104T110000",
        "SUMMARY:Eleven",
        "END:VEVENT",
      ),
      { now },
    );
    expect(events.map((event) => [event.key, event.startAt, event.title])).toEqual([
      ["series-4n#occ=2026-11-02T09:00", "2026-11-02T10:00", "Ten"],
      ["series-4n#occ=2026-11-03T09:00", "2026-11-03T10:00", "Ten"],
      ["series-4n#occ=2026-11-04T09:00", "2026-11-04T11:00", "Eleven"],
      ["series-4n#occ=2026-11-05T09:00", "2026-11-05T09:00", "Daily"],
      ["series-4n#occ=2026-11-06T09:00", "2026-11-06T09:00", "Daily"],
    ]);
  });

  it("lets a single occurrence override win over a prior range shift", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:series-4s",
        "DTSTART:20261102T090000",
        "RRULE:FREQ=DAILY;COUNT=3",
        "SUMMARY:Daily",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-4s",
        "RECURRENCE-ID;RANGE=THISANDPRIOR:20261103T090000",
        "DTSTART:20261103T100000",
        "SUMMARY:Shifted",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-4s",
        "RECURRENCE-ID:20261102T090000",
        "DTSTART:20261102T120000",
        "SUMMARY:Special",
        "END:VEVENT",
      ),
      { now },
    );
    expect(events.map((event) => [event.key, event.startAt, event.title])).toEqual([
      ["series-4s#occ=2026-11-02T09:00", "2026-11-02T12:00", "Special"],
      ["series-4s#occ=2026-11-03T09:00", "2026-11-03T10:00", "Shifted"],
      ["series-4s#occ=2026-11-04T09:00", "2026-11-04T09:00", "Daily"],
    ]);
  });

  it("uses the nearest boundary when future and prior ranges overlap", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:series-4m",
        "DTSTART:20261102T090000",
        "RRULE:FREQ=DAILY;COUNT=5",
        "SUMMARY:Daily",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-4m",
        "RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T090000",
        "DTSTART:20261103T100000",
        "SUMMARY:Future",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-4m",
        "RECURRENCE-ID;RANGE=THISANDPRIOR:20261105T090000",
        "DTSTART:20261105T110000",
        "SUMMARY:Prior",
        "END:VEVENT",
      ),
      { now },
    );
    expect(events.map((event) => [event.key, event.startAt, event.title])).toEqual([
      ["series-4m#occ=2026-11-02T09:00", "2026-11-02T11:00", "Prior"],
      ["series-4m#occ=2026-11-03T09:00", "2026-11-03T10:00", "Future"],
      ["series-4m#occ=2026-11-04T09:00", "2026-11-04T10:00", "Future"],
      ["series-4m#occ=2026-11-05T09:00", "2026-11-05T11:00", "Prior"],
      ["series-4m#occ=2026-11-06T09:00", "2026-11-06T10:00", "Future"],
    ]);
  });

  it("lets a single-occurrence override win over an earlier range shift", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:series-5",
        "DTSTART:20261102T090000",
        "RRULE:FREQ=WEEKLY;COUNT=3",
        "SUMMARY:Weekly",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-5",
        "RECURRENCE-ID;RANGE=THISANDFUTURE:20261109T090000",
        "DTSTART:20261109T100000",
        "SUMMARY:Shifted",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-5",
        "RECURRENCE-ID:20261116T090000",
        "DTSTART:20261116T120000",
        "SUMMARY:Special",
        "END:VEVENT",
      ),
      { now },
    );
    expect(events.map((event) => [event.key, event.startAt, event.title])).toEqual([
      ["series-5#occ=2026-11-02T09:00", "2026-11-02T09:00", "Weekly"],
      ["series-5#occ=2026-11-09T09:00", "2026-11-09T10:00", "Shifted"],
      ["series-5#occ=2026-11-16T09:00", "2026-11-16T12:00", "Special"],
    ]);
  });

  it("lets the closest THISANDFUTURE override win", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:series-6",
        "DTSTART:20261102T090000",
        "RRULE:FREQ=DAILY;COUNT=3",
        "SUMMARY:Daily",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-6",
        "RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T090000",
        "DTSTART:20261103T100000",
        "SUMMARY:Ten",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-6",
        "RECURRENCE-ID;RANGE=THISANDFUTURE:20261104T090000",
        "DTSTART:20261104T110000",
        "SUMMARY:Eleven",
        "END:VEVENT",
      ),
      { now },
    );
    expect(events.map((event) => [event.key, event.startAt, event.title])).toEqual([
      ["series-6#occ=2026-11-02T09:00", "2026-11-02T09:00", "Daily"],
      ["series-6#occ=2026-11-03T09:00", "2026-11-03T10:00", "Ten"],
      ["series-6#occ=2026-11-04T09:00", "2026-11-04T11:00", "Eleven"],
    ]);
  });

  it("shifts an all-day series by whole days", () => {
    const events = parseCalendarData(
      calendar(
        "BEGIN:VEVENT",
        "UID:series-7",
        "DTSTART;VALUE=DATE:20261102",
        "RRULE:FREQ=DAILY;COUNT=3",
        "SUMMARY:Habit",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-7",
        "RECURRENCE-ID;RANGE=THISANDFUTURE;VALUE=DATE:20261103",
        "DTSTART;VALUE=DATE:20261105",
        "SUMMARY:Habit moved",
        "END:VEVENT",
      ),
      { now },
    );
    expect(events.map((event) => [event.key, event.startAt, event.allDay])).toEqual([
      ["series-7#occ=2026-11-02", "2026-11-02", true],
      ["series-7#occ=2026-11-03", "2026-11-05", true],
      ["series-7#occ=2026-11-04", "2026-11-06", true],
    ]);
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
