import type { Task } from "../domain/types";
import { BACKLOG_KEY } from "./types";

export const SETTINGS_FILE = "_settings.md";
export const CATEGORIES_FILE = "_categories.md";
export const BACKLOG_FILE = "_backlog.md";
/** Legacy database, only read once during migration. */
export const LEGACY_DB_FILE = "daymark.db";

/** The date a task is filed under: start date, else due date, else backlog. */
export function dateKeyOf(task: Pick<Task, "startAt" | "dueAt">): string | null {
  return (task.startAt ?? task.dueAt)?.slice(0, 10) ?? null;
}

export function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function monthDir(root: string, dateKey: string): string {
  return `${root}/${monthKey(dateKey)}`;
}

export function dayFilePath(root: string, dateKey: string): string {
  return `${monthDir(root, dateKey)}/${dateKey}.md`;
}

export function backlogPath(root: string): string {
  return `${root}/${BACKLOG_FILE}`;
}

export function categoriesPath(root: string): string {
  return `${root}/${CATEGORIES_FILE}`;
}

export function settingsPath(root: string): string {
  return `${root}/${SETTINGS_FILE}`;
}

export function legacyDbPath(root: string): string {
  return `${root}/${LEGACY_DB_FILE}`;
}

export function extrasKey(dateKey: string | null): string {
  return dateKey ?? BACKLOG_KEY;
}

export function isMonthFolder(name: string): boolean {
  return /^\d{4}-\d{2}$/.test(name);
}

export function isDayFile(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}\.md$/.test(name);
}

export function dateKeyOfFile(name: string): string {
  return name.slice(0, 10);
}
