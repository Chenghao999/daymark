import { formatHeading } from "./numbering";
import type {
  Category,
  Completion,
  NumberingStyle,
  ReportDocument,
  ReportItem,
  ReportKind,
  ReportSection,
  Task,
} from "./types";

export interface ReportInput {
  kind: ReportKind;
  language: "en" | "zh-CN";
  periodLabel: string;
  periodStart: Date;
  /** Inclusive end of the reporting period. */
  periodEnd: Date;
  numbering: NumberingStyle;
  categories: Category[];
  tasks: Task[];
  completions: Completion[];
  generatedAt?: Date;
}

export interface ReportPeriod {
  /** First moment of the period in local time. */
  start: Date;
  /** Last moment of the period in local time, inclusive. */
  end: Date;
}

/**
 * Canonical period boundaries for a report. Weeks start on Monday. Every kind
 * spans whole local days, which is what the completion query and the report
 * filter both expect.
 */
export function reportPeriod(kind: ReportKind, anchor: Date): ReportPeriod {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const day = anchor.getDate();

  if (kind === "daily") {
    return {
      start: new Date(year, month, day),
      end: new Date(year, month, day, 23, 59, 59, 999),
    };
  }

  if (kind === "weekly") {
    // getDay(): Sunday = 0. Shift so Monday = 0.
    const offsetFromMonday = (anchor.getDay() + 6) % 7;
    const start = new Date(year, month, day - offsetFromMonday);
    return {
      start,
      end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999),
    };
  }

  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0, 23, 59, 59, 999),
  };
}

const UTC_UNCATEGORIZED = "uncategorized";

/**
 * Reports are derived, never hand-written: completed work comes from
 * completion records, planned work comes from task schedules. Both are
 * bucketed by category and numbered in category order.
 */
export function generateReport(input: ReportInput): ReportDocument {
  const { periodStart, periodEnd, categories, tasks, completions, language, numbering } = input;
  const from = startOfDay(periodStart).getTime();
  const to = endOfDay(periodEnd).getTime();

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const completionByTask = new Map<string, Completion[]>();
  for (const completion of completions) {
    const at = new Date(completion.completedAt).getTime();
    if (Number.isNaN(at) || at < from || at > to) continue;
    const list = completionByTask.get(completion.taskId) ?? [];
    list.push(completion);
    completionByTask.set(completion.taskId, list);
  }

  const sections = new Map<string, ReportItem[]>();
  const seen = new Set<string>();
  let completedCount = 0;
  let scheduledCount = 0;

  for (const task of tasks) {
    if (task.deleted) continue;
    const completionDates = completionByTask.get(task.id) ?? [];
    const scheduledHit = isWithin(task.startAt ?? task.dueAt, from, to);

    if (completionDates.length > 0) {
      completedCount += 1;
      seen.add(task.id);
      pushItem(sections, categoryKey(task), {
        taskId: task.id,
        text: task.title,
        date: localDateKey(completionDates[0]?.completedAt),
        completed: true,
      });
      continue;
    }

    if (task.status !== "done" && scheduledHit) {
      scheduledCount += 1;
      seen.add(task.id);
      pushItem(sections, categoryKey(task), {
        taskId: task.id,
        text: task.title,
        date: (task.startAt ?? task.dueAt)?.slice(0, 10) ?? null,
        completed: false,
      });
    }
  }

  // Keep report ordering stable and predictable: category sort order first,
  // then the uncategorized bucket last.
  const orderedKeys = [...sections.keys()].sort((a, b) => {
    if (a === UTC_UNCATEGORIZED) return 1;
    if (b === UTC_UNCATEGORIZED) return -1;
    const ca = categoryById.get(a);
    const cb = categoryById.get(b);
    return (ca?.sortOrder ?? 999) - (cb?.sortOrder ?? 999);
  });

  const reportSections: ReportSection[] = orderedKeys.map((key, index) => {
    const category = categoryById.get(key);
    return {
      categoryId: category?.id ?? null,
      categoryName: category ? (language === "zh-CN" ? category.nameZh : category.nameEn) : uncategorizedLabel(language),
      heading: formatHeading(index, numbering),
      items: (sections.get(key) ?? []).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
    };
  });

  return {
    kind: input.kind,
    title: reportTitle(input.kind, language),
    periodLabel: input.periodLabel,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    sections: reportSections,
    completedCount,
    scheduledCount,
  };
}

export function reportTitle(kind: ReportKind, language: "en" | "zh-CN"): string {
  if (language === "zh-CN") {
    if (kind === "daily") return "日报";
    if (kind === "weekly") return "周报";
    return "月报";
  }
  if (kind === "daily") return "Daily Report";
  if (kind === "weekly") return "Weekly Report";
  return "Monthly Report";
}

export function uncategorizedLabel(language: "en" | "zh-CN"): string {
  return language === "zh-CN" ? "未分类" : "Uncategorized";
}

function categoryKey(task: Task): string {
  return task.categoryId ?? UTC_UNCATEGORIZED;
}

function pushItem(map: Map<string, ReportItem[]>, key: string, item: ReportItem) {
  const list = map.get(key) ?? [];
  list.push(item);
  map.set(key, list);
}

function isWithin(value: string | null, from: number, to: number): boolean {
  if (!value) return false;
  const time = parseLocal(value);
  if (Number.isNaN(time)) return false;
  return time >= from && time <= to;
}

/**
 * Task schedule values are local wall-clock strings. A date-only value (all-day
 * start, due date) must be read as local midnight; JavaScript otherwise parses
 * it as UTC, which shifts it to the previous day west of UTC.
 */
function parseLocal(value: string): number {
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).getTime();
}

/** Local calendar date of a UTC completion timestamp, as YYYY-MM-DD. */
function localDateKey(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
