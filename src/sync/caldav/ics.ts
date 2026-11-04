import type { CalDavEvent } from "./types";

/**
 * A small iCalendar reader for the read-only import.
 *
 * It keeps one VEVENT per occurrence: timed values in UTC or with a TZID are
 * converted to this device's local wall-clock time, which is the format day
 * files store. `VTIMEZONE` blocks are not interpreted; IANA TZIDs are resolved
 * through `Intl`, and an unknown TZID falls back to treating the value as
 * local time. Recurring series are expanded for a window around today; a
 * `RECURRENCE-ID` override replaces that one occurrence, and an override marked
 * cancelled removes it. An override with `RANGE=THISANDFUTURE` shifts (or
 * cancels) that occurrence and every later one, while `RANGE=THISANDPRIOR`
 * shifts (or cancels) that occurrence and every earlier one; the nearest
 * boundary wins until a single-occurrence override replaces one instance.
 */

const DAY_MS = 86_400_000;

export interface ParseCalendarOptions {
  /** Clock used for the recurrence window; injectable for tests. */
  now?: Date;
  /** Recurring occurrences before today are kept for this many days. */
  pastDays?: number;
  /** Recurring occurrences after today are kept for this many days. */
  futureDays?: number;
}

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface Moment {
  allDay: boolean;
  /** Local `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` for a timed value. */
  dateKey: string;
  /** Local Date of the value (noon for all-day). */
  instant: Date;
}

interface RecurrenceRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count: number | null;
  until: Moment | null;
  byDay: number[];
  byMonthDay: number[];
  weekStart: number;
}

interface ParsedEvent {
  uid: string;
  /** Set on a `RECURRENCE-ID` override; the original occurrence start. */
  recurrenceId: Moment | null;
  /**
   * `RECURRENCE-ID;RANGE=…`: `"future"` applies the change to later
   * instances, `"prior"` to earlier ones. `null` is a single instance.
   */
  range: "future" | "prior" | null;
  start: Moment;
  summary: string;
  notes: string;
  categories: string[];
  cancelled: boolean;
  durationMs: number | null;
  rule: RecurrenceRule | null;
  exdates: Set<string>;
}

interface Expansion {
  occurrences: Moment[];
  /** Occurrence keys removed by `EXDATE`; reported as cancellations. */
  excluded: Set<string>;
}

const WEEKDAYS: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

/** Parses every VEVENT in a calendar object into local occurrences. */
export function parseCalendarData(text: string, options: ParseCalendarOptions = {}): CalDavEvent[] {
  const now = options.now ?? new Date();
  const parsed = eventBlocks(text)
    .map((block) => parseEvent(block))
    .filter((event): event is ParsedEvent => event !== null);

  const masters = new Map<string, ParsedEvent>();
  const overrides = new Map<string, ParsedEvent[]>();
  for (const event of parsed) {
    if (event.recurrenceId) {
      const list = overrides.get(event.uid) ?? [];
      list.push(event);
      overrides.set(event.uid, list);
    } else if (!masters.has(event.uid)) {
      masters.set(event.uid, event);
    }
  }

  const events: CalDavEvent[] = [];
  const uids = new Set([...masters.keys(), ...overrides.keys()]);
  for (const uid of uids) {
    const master = masters.get(uid);
    const list = overrides.get(uid) ?? [];

    if (!master) {
      // A server can send an override without the master. Showing it is still
      // more useful than dropping the event.
      for (const override of list) events.push(overrideEvent(override, null));
      continue;
    }

    if (master.cancelled) {
      events.push(masterEvent(master, master.start, uid));
      continue;
    }

    // An override only makes sense for a recurring master; a one-off event
    // with a RECURRENCE-ID is malformed and the master is kept unchanged.
    const exactByKey = new Map<string, ParsedEvent>();
    const futureOverrides: ParsedEvent[] = [];
    const priorOverrides: ParsedEvent[] = [];
    for (const override of master.rule ? list : []) {
      if (override.range === "future") futureOverrides.push(override);
      else if (override.range === "prior") priorOverrides.push(override);
      else exactByKey.set(occurrenceKey(uid, override.recurrenceId!.dateKey), override);
    }
    const byRecurrenceStart = (a: ParsedEvent, b: ParsedEvent) =>
      a.recurrenceId!.instant.getTime() - b.recurrenceId!.instant.getTime();
    futureOverrides.sort(byRecurrenceStart);
    priorOverrides.sort(byRecurrenceStart);

    const windowStart = startOfLocalDay(addDays(now, -(options.pastDays ?? 366)));
    const windowEnd = endOfLocalDay(addDays(now, options.futureDays ?? 731));

    // A range override can move occurrences into the window from outside it.
    // Expand a little beyond the window so those instances are not lost.
    const shiftDays = Math.min(
      731,
      Math.ceil(
        Math.max(
          0,
          ...[...futureOverrides, ...priorOverrides].map((override) =>
            Math.abs(override.start.instant.getTime() - override.recurrenceId!.instant.getTime()),
          ),
        ) / DAY_MS,
      ),
    );
    const expansionOptions: ParseCalendarOptions =
      shiftDays > 0
        ? {
            ...options,
            pastDays: (options.pastDays ?? 366) + shiftDays,
            futureDays: (options.futureDays ?? 731) + shiftDays,
          }
        : options;

    const expansion = master.rule
      ? expandRecurrence(master.start, master.rule, now, expansionOptions, master.exdates)
      : { occurrences: [master.start], excluded: new Set<string>() };
    const emitted = new Set<string>();

    for (const occurrence of expansion.occurrences) {
      const key = master.rule ? occurrenceKey(uid, occurrence.dateKey) : uid;
      emitted.add(key);
      const exact = exactByKey.get(key);
      if (exact) {
        events.push(overrideEvent(exact, master));
        continue;
      }

      const range = rangeFor(futureOverrides, priorOverrides, occurrence);
      if (range) {
        const shifted = shiftedMoment(range, occurrence);
        if (!withinWindow(shifted, windowStart, windowEnd)) continue;
        events.push(
          range.cancelled
            ? cancellationEvent(master, key, shifted.dateKey)
            : rangeEvent(range, master, occurrence, shifted),
        );
        continue;
      }

      if (!withinWindow(occurrence, windowStart, windowEnd)) continue;
      events.push(masterEvent(master, occurrence, key));
    }

    // An override can point at an occurrence outside the window, or at one
    // that EXDATE removed. Emit it so the moved event is not lost.
    for (const [key, override] of exactByKey) {
      if (emitted.has(key)) continue;
      emitted.add(key);
      events.push(overrideEvent(override, master));
    }

    // A range override whose own occurrence was not expanded (it lies before
    // the window, or EXDATE removed it) still has to appear. Its boundary
    // instance is emitted like a single override.
    for (const override of [...futureOverrides, ...priorOverrides].sort(byRecurrenceStart)) {
      const key = occurrenceKey(uid, override.recurrenceId!.dateKey);
      if (emitted.has(key)) continue;
      emitted.add(key);
      events.push(
        override.cancelled
          ? cancellationEvent(master, key, override.start.dateKey)
          : overrideEvent(override, master),
      );
    }

    // An EXDATE means "this occurrence does not exist". The cancellation is
    // emitted so the import can remove a task left by an earlier sync.
    for (const excluded of expansion.excluded) {
      const key = occurrenceKey(uid, excluded);
      if (emitted.has(key)) continue;
      events.push(cancellationEvent(master, key, excluded));
    }
  }
  return events;
}

function parseEvent(lines: string[]): ParsedEvent | null {
  const props = parseProperties(lines);
  const uid = firstValue(props, "UID");
  const start = parseMomentProp(firstProperty(props, "DTSTART"));
  if (!uid || !start) return null;

  const recurrenceProp = firstProperty(props, "RECURRENCE-ID");
  const recurrenceId = recurrenceProp ? parseMomentProp(recurrenceProp) : null;
  if (recurrenceProp && !recurrenceId) return null;

  const summary = decodeText(firstValue(props, "SUMMARY") ?? "");
  const description = decodeText(firstValue(props, "DESCRIPTION") ?? "");
  const location = decodeText(firstValue(props, "LOCATION") ?? "");
  const categories = props
    .filter((prop) => prop.name === "CATEGORIES")
    .flatMap((prop) => splitList(prop.value))
    .map((name) => name.trim())
    .filter(Boolean);
  const status = (firstValue(props, "STATUS") ?? "").toUpperCase();
  const notes = [description, location ? `📍 ${location}` : ""].filter(Boolean).join("\n");

  const endProp = firstProperty(props, "DTEND") ?? firstProperty(props, "DUE");
  const end = parseMomentProp(endProp);
  const duration = end ? end.instant.getTime() - start.instant.getTime() : null;
  const declaredDuration = firstValue(props, "DURATION");
  const durationMs =
    duration !== null && duration > 0
      ? duration
      : declaredDuration
        ? parseDuration(declaredDuration)
        : null;

  const exdates = new Set<string>(
    props
      .filter((prop) => prop.name === "EXDATE")
      .flatMap((prop) =>
        prop.value
          .split(",")
          .map((value) => parseMoment(value, prop.params))
          .filter((moment): moment is Moment => moment !== null)
          .map((moment) => moment.dateKey),
      ),
  );

  return {
    uid,
    recurrenceId,
    range: parseRange(recurrenceProp),
    start,
    summary,
    notes,
    categories,
    cancelled: status === "CANCELLED",
    durationMs,
    rule: parseRule(firstValue(props, "RRULE")),
    exdates,
  };
}

function occurrenceKey(uid: string, dateKey: string): string {
  return `${uid}#occ=${dateKey}`;
}

function parseRange(prop: Property | undefined): "future" | "prior" | null {
  const value = (prop?.params.RANGE ?? "").toUpperCase();
  if (value === "THISANDFUTURE") return "future";
  if (value === "THISANDPRIOR") return "prior";
  return null;
}

/**
 * The range override covering an occurrence: the latest `THISANDFUTURE`
 * boundary at or before it, or the earliest `THISANDPRIOR` boundary at or
 * after it. When both cover the same instance, the closer boundary wins (a
 * tie goes to the future range).
 */
function rangeFor(
  future: ParsedEvent[],
  prior: ParsedEvent[],
  occurrence: Moment,
): ParsedEvent | null {
  let after: ParsedEvent | null = null;
  for (const range of future) {
    if (range.recurrenceId!.instant.getTime() > occurrence.instant.getTime()) break;
    after = range;
  }

  let before: ParsedEvent | null = null;
  for (let index = prior.length - 1; index >= 0; index -= 1) {
    const range = prior[index];
    if (range.recurrenceId!.instant.getTime() < occurrence.instant.getTime()) break;
    before = range;
  }

  if (!after) return before;
  if (!before) return after;
  const afterDistance = occurrence.instant.getTime() - after.recurrenceId!.instant.getTime();
  const beforeDistance = before.recurrenceId!.instant.getTime() - occurrence.instant.getTime();
  return beforeDistance < afterDistance ? before : after;
}

/** Apply a range override's start shift to one later occurrence. */
function shiftedMoment(override: ParsedEvent, occurrence: Moment): Moment {
  const original = override.recurrenceId!;
  const start = override.start;
  // Shift by local calendar days and wall-clock minutes, not by a raw
  // millisecond delta: the same override must keep its wall-clock time across
  // a daylight-saving change.
  const dayShift = Math.round(
    (startOfLocalDay(start.instant).getTime() -
      startOfLocalDay(original.instant).getTime()) /
      DAY_MS,
  );
  const minuteShift =
    start.instant.getHours() * 60 +
    start.instant.getMinutes() -
    (original.instant.getHours() * 60 + original.instant.getMinutes());

  const base = addDays(occurrence.instant, dayShift);
  const instant = occurrence.allDay
    ? base
    : new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate(),
        base.getHours(),
        base.getMinutes() + minuteShift,
        base.getSeconds(),
      );
  return {
    allDay: occurrence.allDay,
    dateKey: occurrence.allDay ? localDateKey(instant) : localMinute(instant),
    instant,
  };
}

function withinWindow(moment: Moment, from: Date, to: Date): boolean {
  return moment.instant.getTime() >= from.getTime() && moment.instant.getTime() <= to.getTime();
}

function cancellationEvent(master: ParsedEvent, key: string, dateKey: string): CalDavEvent {
  return {
    uid: master.uid,
    key,
    title: master.summary || "Untitled",
    notes: "",
    categories: master.categories,
    startAt: dateKey,
    endAt: null,
    allDay: master.start.allDay,
    cancelled: true,
  };
}

function masterEvent(master: ParsedEvent, occurrence: Moment, key: string): CalDavEvent {
  return {
    uid: master.uid,
    key,
    title: master.summary || "Untitled",
    notes: master.notes,
    categories: master.categories,
    startAt: occurrence.dateKey,
    endAt: endOfOccurrence(master, occurrence),
    allDay: master.start.allDay,
    cancelled: master.cancelled,
  };
}

function overrideEvent(override: ParsedEvent, master: ParsedEvent | null): CalDavEvent {
  return {
    uid: override.uid,
    key: occurrenceKey(override.uid, override.recurrenceId!.dateKey),
    title: override.summary || master?.summary || "Untitled",
    notes: override.notes,
    categories:
      override.categories.length > 0 ? override.categories : (master?.categories ?? []),
    startAt: override.start.dateKey,
    endAt: endOfOccurrence(override, override.start),
    allDay: override.start.allDay,
    cancelled: override.cancelled,
  };
}

function rangeEvent(
  override: ParsedEvent,
  master: ParsedEvent,
  occurrence: Moment,
  shifted: Moment,
): CalDavEvent {
  return {
    uid: override.uid,
    // The key stays on the original recurrence start, so a shifted occurrence
    // updates its existing task instead of creating a new one.
    key: occurrenceKey(override.uid, occurrence.dateKey),
    title: override.summary || master.summary || "Untitled",
    notes: override.notes,
    categories:
      override.categories.length > 0 ? override.categories : master.categories,
    startAt: shifted.dateKey,
    endAt: endOfOccurrence(
      { ...override, durationMs: override.durationMs ?? master.durationMs },
      shifted,
    ),
    allDay: shifted.allDay,
    cancelled: false,
  };
}

function endOfOccurrence(event: ParsedEvent, occurrence: Moment): string | null {
  const duration = event.durationMs;
  if (occurrence.allDay || duration === null || duration <= 0) return null;
  return localMinute(new Date(occurrence.instant.getTime() + duration));
}

function eventBlocks(text: string): string[][] {
  const lines = unfold(text);
  const blocks: string[][] = [];
  let current: string[] | null = null;
  let nested = 0;

  for (const line of lines) {
    if (/^BEGIN:VEVENT\s*$/i.test(line)) {
      current = [];
      nested = 0;
      continue;
    }
    if (current === null) continue;
    if (/^END:VEVENT\s*$/i.test(line)) {
      blocks.push(current);
      current = null;
      continue;
    }
    if (/^BEGIN:/i.test(line)) {
      nested++;
      continue;
    }
    if (/^END:/i.test(line)) {
      if (nested > 0) nested--;
      continue;
    }
    // Properties of VALARM and other nested components are not VEVENT fields.
    if (nested === 0) current.push(line);
  }
  return blocks;
}

function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}

function parseProperties(lines: string[]): Property[] {
  const props: Property[] = [];
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const segments = head.split(";");
    const name = segments[0].trim().toUpperCase();
    if (!name) continue;
    const params: Record<string, string> = {};
    for (const segment of segments.slice(1)) {
      const equals = segment.indexOf("=");
      if (equals < 0) continue;
      params[segment.slice(0, equals).trim().toUpperCase()] = segment
        .slice(equals + 1)
        .trim()
        .replace(/^"|"$/g, "");
    }
    props.push({ name, params, value });
  }
  return props;
}

function firstProperty(props: Property[], name: string): Property | undefined {
  return props.find((prop) => prop.name === name);
}

function firstValue(props: Property[], name: string): string | null {
  return firstProperty(props, name)?.value ?? null;
}

function parseMomentProp(prop: Property | undefined): Moment | null {
  return prop ? parseMoment(prop.value, prop.params) : null;
}

function parseMoment(value: string, params: Record<string, string>): Moment | null {
  const raw = value.trim();
  if (!raw) return null;

  const dateOnly = params.VALUE?.toUpperCase() === "DATE" || /^\d{8}$/.test(raw);
  if (dateOnly) {
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!validDate(year, month, day)) return null;
    return {
      allDay: true,
      dateKey: `${match[1]}-${match[2]}-${match[3]}`,
      instant: new Date(year, month - 1, day, 12),
    };
  }

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (!validDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;

  let instant: Date;
  if (match[7]) {
    instant = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  } else {
    const zone = params.TZID ? normalizeTimeZone(params.TZID) : null;
    instant = zone
      ? zonedInstant(year, month, day, hour, minute, second, zone)
      : new Date(year, month - 1, day, hour, minute, second);
  }
  return { allDay: false, dateKey: localMinute(instant), instant };
}

function validDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day, 12);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

/**
 * An IANA zone such as `Europe/Berlin`, including the prefixed forms some
 * clients emit (`/mozilla.org/20050126_1/Europe/Berlin`).
 */
function normalizeTimeZone(value: string): string | null {
  const tzfile = /(?:^|\/)Tzfile\/(.+)$/.exec(value);
  const candidate = (tzfile ? tzfile[1] : value.replace(/^\/+/, "")).trim();
  if (!candidate) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return null;
  }
}

/** Wall-clock parts in `timeZone` → the UTC instant they denote. */
function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = new Date(utcGuess - zoneOffset(new Date(utcGuess), timeZone));
  const corrected = new Date(utcGuess - zoneOffset(instant, timeZone));
  if (corrected.getTime() !== instant.getTime()) instant = corrected;
  return instant;
}

function zoneOffset(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return (
    Date.UTC(
      Number(values.get("year")),
      Number(values.get("month")) - 1,
      Number(values.get("day")),
      Number(values.get("hour")),
      Number(values.get("minute")),
      Number(values.get("second")),
    ) - date.getTime()
  );
}

function parseDuration(value: string): number | null {
  const match = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(
    value.trim(),
  );
  if (!match) return null;
  const [, weeks = "0", days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  return (
    (Number(weeks) * 7 * 24 * 3600 +
      Number(days) * 24 * 3600 +
      Number(hours) * 3600 +
      Number(minutes) * 60 +
      Number(seconds)) *
    1000
  );
}

function parseRule(value: string | null): RecurrenceRule | null {
  if (!value) return null;
  const parts = new Map<string, string>();
  for (const piece of value.split(";")) {
    const equals = piece.indexOf("=");
    if (equals >= 0) {
      parts.set(piece.slice(0, equals).toUpperCase(), piece.slice(equals + 1).trim());
    }
  }
  const freq = (parts.get("FREQ") ?? "").toUpperCase();
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") {
    return null;
  }
  const interval = Math.max(1, Number(parts.get("INTERVAL") ?? "1") || 1);
  const countText = parts.get("COUNT");
  const count = countText ? Number(countText) : null;
  const until = parts.get("UNTIL")
    ? parseMoment(parts.get("UNTIL") as string, {})
    : null;

  const byDay = (parts.get("BYDAY") ?? "")
    .split(",")
    .map((code) => WEEKDAYS[code.replace(/^[+-]?\d+/, "").toUpperCase()])
    .filter((day): day is number => day !== undefined);
  const byMonthDay = (parts.get("BYMONTHDAY") ?? "")
    .split(",")
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day !== 0);
  const weekStart = WEEKDAYS[(parts.get("WKST") ?? "MO").toUpperCase()] ?? 1;

  return {
    freq: freq as RecurrenceRule["freq"],
    interval,
    count: count !== null && Number.isFinite(count) && count > 0 ? count : null,
    until,
    byDay,
    byMonthDay,
    weekStart,
  };
}

function expandRecurrence(
  start: Moment,
  rule: RecurrenceRule,
  now: Date,
  options: ParseCalendarOptions,
  exdates: Set<string>,
): Expansion {
  const windowStart = startOfLocalDay(addDays(now, -(options.pastDays ?? 366)));
  const windowEnd = endOfLocalDay(addDays(now, options.futureDays ?? 731));
  const base = start.instant;
  const candidates: Date[] = [];
  const excluded = new Set<string>();
  let index = 0;

  const add = (date: Date) => {
    const key = start.allDay ? localDateKey(date) : localMinute(date);
    if (exdates.has(key)) excluded.add(key);
    else candidates.push(date);
  };
  const done = (): Expansion => ({
    occurrences: toMoments(candidates, start.allDay),
    excluded,
  });

  if (rule.freq === "DAILY") {
    const step = rule.interval;
    // A daily series may have started years ago; start at the window instead
    // of walking every occurrence since then.
    const firstIndex =
      rule.count === null
        ? Math.max(0, Math.floor((windowStart.getTime() - base.getTime()) / (step * DAY_MS)))
        : 0;
    index = firstIndex;
    for (let cursor = firstIndex; cursor < firstIndex + 3700; cursor += 1) {
      const date = addDays(base, cursor * step);
      if (date.getTime() > windowEnd.getTime()) break;
      if (rule.count !== null && cursor >= rule.count) break;
      if (rule.until && afterUntil(date, start.allDay, rule.until)) break;
      if (date.getTime() < windowStart.getTime()) continue;
      if (date.getTime() < base.getTime()) continue;
      index = cursor + 1;
      add(date);
    }
    return done();
  }

  if (rule.freq === "WEEKLY" && rule.byDay.length === 0) {
    const step = 7 * rule.interval;
    const firstIndex =
      rule.count === null
        ? Math.max(0, Math.floor((windowStart.getTime() - base.getTime()) / (step * DAY_MS)))
        : 0;
    for (let cursor = firstIndex; cursor < firstIndex + 530; cursor += 1) {
      const date = addDays(base, cursor * step);
      if (date.getTime() > windowEnd.getTime()) break;
      if (rule.count !== null && cursor >= rule.count) break;
      if (rule.until && afterUntil(date, start.allDay, rule.until)) break;
      if (date.getTime() < windowStart.getTime()) continue;
      add(date);
    }
    return done();
  }

  if (rule.freq === "WEEKLY") {
    const baseWeek = startOfWeek(base, rule.weekStart);
    for (let week = 0; week < 530; week += 1) {
      const weekStart = addDays(baseWeek, week * 7 * rule.interval);
      if (weekStart.getTime() > windowEnd.getTime()) break;
      for (const day of [...rule.byDay].sort((a, b) => a - b)) {
        const dayStart = addDays(weekStart, (day - rule.weekStart + 7) % 7);
        const date = new Date(
          dayStart.getFullYear(),
          dayStart.getMonth(),
          dayStart.getDate(),
          base.getHours(),
          base.getMinutes(),
          base.getSeconds(),
        );
        if (date.getTime() < base.getTime()) continue;
        if (rule.count !== null && index >= rule.count) return done();
        index += 1;
        if (rule.until && afterUntil(date, start.allDay, rule.until)) {
          return done();
        }
        if (date.getTime() > windowEnd.getTime() || date.getTime() < windowStart.getTime()) {
          continue;
        }
        add(date);
      }
    }
    return done();
  }

  const months = rule.freq === "MONTHLY";
  const limit = months ? 900 : 120;
  for (let step = 0; step < limit; step += 1) {
    const cursor = months
      ? addMonths(base, step * rule.interval)
      : addYears(base, step * rule.interval);
    if (cursor.getTime() > windowEnd.getTime() && step > 0) {
      const fallback = months
        ? new Date(cursor.getFullYear(), cursor.getMonth(), 1)
        : new Date(cursor.getFullYear(), 0, 1);
      if (fallback.getTime() > windowEnd.getTime()) break;
    }
    const days = rule.byMonthDay.length > 0 ? rule.byMonthDay : [base.getDate()];
    for (const day of days) {
      const date = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        day,
        base.getHours(),
        base.getMinutes(),
        base.getSeconds(),
      );
      if (date.getMonth() !== cursor.getMonth()) continue;
      if (date.getTime() < base.getTime()) continue;
      if (rule.count !== null && index >= rule.count) return done();
      index += 1;
      if (rule.until && afterUntil(date, start.allDay, rule.until)) {
        return done();
      }
      if (date.getTime() > windowEnd.getTime() || date.getTime() < windowStart.getTime()) {
        continue;
      }
      add(date);
    }
  }
  return done();
}

function toMoments(dates: Date[], allDay: boolean): Moment[] {
  return dates.map((date) => ({
    allDay,
    dateKey: allDay ? localDateKey(date) : localMinute(date),
    instant: date,
  }));
}

function afterUntil(date: Date, allDay: boolean, until: Moment): boolean {
  return allDay
    ? localDateKey(date) > until.dateKey
    : date.getTime() > until.instant.getTime();
}

function splitList(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === ",") {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts;
}

function decodeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function localMinute(date: Date): string {
  return `${localDateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

function addYears(date: Date, years: number): Date {
  const next = new Date(date.getTime());
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfWeek(date: Date, weekStart: number): Date {
  const day = startOfLocalDay(date);
  return addDays(day, -((day.getDay() - weekStart + 7) % 7));
}
