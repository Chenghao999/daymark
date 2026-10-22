export type TaskStatus = "backlog" | "scheduled" | "done";

export type TaskSource = "local" | "caldav";

export type NumberingStyle = "chinese" | "arabic" | "alpha";

export type ReportKind = "daily" | "weekly" | "monthly" | "yearly";

export type AppLanguage = "en" | "zh-CN";

export interface Category {
  id: string;
  nameEn: string;
  nameZh: string;
  color: string;
  sortOrder: number;
  archived: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  categoryId: string | null;
  status: TaskStatus;
  /** ISO 8601 datetime in local wall-clock time, or null for backlog tasks. */
  startAt: string | null;
  endAt: string | null;
  dueAt: string | null;
  priority: number;
  allDay: boolean;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  rowVersion: number;
  deleted: boolean;
  source: TaskSource;
  externalUid: string | null;
}

export interface Completion {
  id: string;
  taskId: string;
  completedAt: string;
  deviceId: string;
}

export interface ReportItem {
  taskId: string | null;
  text: string;
  date: string | null;
  completed: boolean;
}

export interface ReportSection {
  categoryId: string | null;
  categoryName: string;
  heading: string;
  items: ReportItem[];
}

export interface ReportDocument {
  kind: ReportKind;
  title: string;
  periodLabel: string;
  generatedAt: string;
  sections: ReportSection[];
  completedCount: number;
  scheduledCount: number;
}
