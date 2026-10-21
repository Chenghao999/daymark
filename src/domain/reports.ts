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
        date: completionDates[0]?.completedAt.slice(0, 10) ?? null,
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
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  return time >= from && time <= to;
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
