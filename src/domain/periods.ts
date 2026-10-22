import type { ReportKind } from "./types";

export interface ReportPeriod {
  /** First moment of the period in local time. */
  start: Date;
  /** Last moment of the period in local time, inclusive. */
  end: Date;
}

export interface PeriodOptions {
  /** 0 = Sunday, 1 = Monday. Defaults to Monday. */
  weekStartsOn?: 0 | 1;
  /**
   * Day of month that starts an assessment month. `1` is the calendar month;
   * `26` means the 26th of one month through the 25th of the next. Clamped to
   * 1-28 so every month has the day.
   */
  assessmentMonthStartDay?: number;
  /** Month (1-12) that starts an assessment year. Defaults to January. */
  assessmentYearStartMonth?: number;
}

/**
 * Canonical period boundaries for a report. Every kind spans whole local days,
 * which is what the completion query and the report filter both expect.
 *
 * Periods are "assessment" periods, not necessarily calendar ones: an
 * organisation can run monthly reports from the 26th to the 25th and yearly
 * reports from April to March. Those choices live in `_settings.md` so they
 * travel with the data folder.
 */
export function reportPeriod(
  kind: ReportKind,
  anchor: Date,
  options: PeriodOptions = {},
): ReportPeriod {
  const weekStartsOn = options.weekStartsOn ?? 1;
  const monthStartDay = clamp(options.assessmentMonthStartDay ?? 1, 1, 28);
  const yearStartMonth = clamp(options.assessmentYearStartMonth ?? 1, 1, 12);

  if (kind === "daily") {
    return dayPeriod(anchor);
  }

  if (kind === "weekly") {
    // getDay(): Sunday = 0. Shift so the configured first day is offset 0.
    const offset = (anchor.getDay() - weekStartsOn + 7) % 7;
    return dayPeriod(addDays(anchor, -offset), 6);
  }
  if (kind === "monthly") {
    const start = assessmentMonthStart(anchor, monthStartDay);
    const next = new Date(start.getFullYear(), start.getMonth() + 1, monthStartDay);
    return { start, end: new Date(next.getTime() - 1) };
  }

  const start = assessmentYearStart(anchor, yearStartMonth, monthStartDay);
  const next = new Date(start.getFullYear() + 1, yearStartMonth - 1, monthStartDay);
  return { start, end: new Date(next.getTime() - 1) };
}

function dayPeriod(start: Date, daysAfter = 0): ReportPeriod {
  const first = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(first.getFullYear(), first.getMonth(), first.getDate() + daysAfter, 23, 59, 59, 999);
  return { start: first, end: last };
}

function assessmentMonthStart(anchor: Date, startDay: number): Date {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  if (anchor.getDate() >= startDay) {
    return new Date(year, month, startDay);
  }
  return new Date(year, month - 1, startDay);
}

function assessmentYearStart(anchor: Date, startMonth: number, startDay: number): Date {
  const year = anchor.getFullYear();
  const candidate = new Date(year, startMonth - 1, startDay);
  const start = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
  return anchor >= start ? start : new Date(year - 1, startMonth - 1, startDay);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
