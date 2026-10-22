import { describe, expect, it } from "vitest";
import { reportPeriod } from "../src/domain/periods";

describe("reportPeriod", () => {
  it("spans the whole local day for a daily report", () => {
    const { start, end } = reportPeriod("daily", new Date(2026, 9, 22, 15, 30));
    expect(start).toEqual(new Date(2026, 9, 22, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 9, 22, 23, 59, 59, 999));
  });

  it("starts the week on Monday by default", () => {
    const { start, end } = reportPeriod("weekly", new Date(2026, 9, 21));
    expect(start).toEqual(new Date(2026, 9, 19));
    expect(end).toEqual(new Date(2026, 9, 25, 23, 59, 59, 999));
  });

  it("honours a Sunday week start", () => {
    const { start, end } = reportPeriod("weekly", new Date(2026, 9, 21), { weekStartsOn: 0 });
    expect(start).toEqual(new Date(2026, 9, 18));
    expect(end).toEqual(new Date(2026, 9, 24, 23, 59, 59, 999));
  });

  it("uses the calendar month when the assessment month starts on day 1", () => {
    const { start, end } = reportPeriod("monthly", new Date(2026, 9, 22));
    expect(start).toEqual(new Date(2026, 9, 1));
    expect(end).toEqual(new Date(2026, 9, 31, 23, 59, 59, 999));
  });

  it("supports an assessment month that starts on the 26th", () => {
    const before = reportPeriod("monthly", new Date(2026, 9, 22), { assessmentMonthStartDay: 26 });
    expect(before.start).toEqual(new Date(2026, 8, 26));
    expect(before.end).toEqual(new Date(2026, 9, 25, 23, 59, 59, 999));

    const onStart = reportPeriod("monthly", new Date(2026, 9, 26), { assessmentMonthStartDay: 26 });
    expect(onStart.start).toEqual(new Date(2026, 9, 26));
    expect(onStart.end).toEqual(new Date(2026, 10, 25, 23, 59, 59, 999));
  });

  it("rolls the assessment month across a year boundary", () => {
    const { start, end } = reportPeriod("monthly", new Date(2026, 0, 10), { assessmentMonthStartDay: 26 });
    expect(start).toEqual(new Date(2025, 11, 26));
    expect(end).toEqual(new Date(2026, 0, 25, 23, 59, 59, 999));
  });

  it("uses the calendar year when the assessment year starts in January", () => {
    const { start, end } = reportPeriod("yearly", new Date(2026, 9, 22));
    expect(start).toEqual(new Date(2026, 0, 1));
    expect(end).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
  });

  it("supports an assessment year that starts in April", () => {
    const before = reportPeriod("yearly", new Date(2026, 2, 31), { assessmentYearStartMonth: 4 });
    expect(before.start).toEqual(new Date(2025, 3, 1));
    expect(before.end).toEqual(new Date(2026, 2, 31, 23, 59, 59, 999));

    const onStart = reportPeriod("yearly", new Date(2026, 3, 1), { assessmentYearStartMonth: 4 });
    expect(onStart.start).toEqual(new Date(2026, 3, 1));
    expect(onStart.end).toEqual(new Date(2027, 2, 31, 23, 59, 59, 999));
  });

  it("combines a custom year month with a custom month start day", () => {
    const { start } = reportPeriod("yearly", new Date(2026, 3, 25), {
      assessmentYearStartMonth: 4,
      assessmentMonthStartDay: 26,
    });
    expect(start).toEqual(new Date(2025, 3, 26));
  });

  it("clamps hand-edited values into a valid range", () => {
    const { start, end } = reportPeriod("monthly", new Date(2026, 9, 22), {
      assessmentMonthStartDay: 31,
    });
    expect(start).toEqual(new Date(2026, 8, 28));
    expect(end).toEqual(new Date(2026, 9, 27, 23, 59, 59, 999));
  });
});
