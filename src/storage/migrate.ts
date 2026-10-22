import Database from "@tauri-apps/plugin-sql";
import type { Category, Completion, Task } from "../domain/types";
import { DEFAULT_CATEGORIES } from "./defaults";
import { deviceId } from "./device";
import { renamePath, writeTextFile } from "./fs";
import { serializeCategoriesMarkdown, serializeMarkdown } from "./markdown";
import { backlogPath, categoriesPath, dayFilePath, legacyDbPath } from "./paths";
import type { StoredTask } from "./types";

interface LegacyCategoryRow {
  id: string;
  name_en: string;
  name_zh: string;
  color: string;
  sort_order: number;
  archived: number;
}

interface LegacyTaskRow {
  id: string;
  title: string;
  notes: string;
  category_id: string | null;
  status: "backlog" | "scheduled" | "done";
  start_at: string | null;
  end_at: string | null;
  due_at: string | null;
  priority: number;
  all_day: number;
  created_at: string;
  updated_at: string;
  device_id: string;
  row_version: number;
  source: "local" | "caldav";
  external_uid: string | null;
}

interface LegacyCompletionRow {
  id: string;
  task_id: string;
  completed_at: string;
  device_id: string;
}

/**
 * One-time migration from the 0.1 SQLite file. Markdown is written first and
 * the categories file last; its presence is what marks the store as migrated.
 * The database is then renamed, never deleted.
 */
export async function migrateLegacyDatabase(root: string): Promise<boolean> {
  const legacyPath = legacyDbPath(root);
  const db = await Database.load(`sqlite:${legacyPath}`);
  try {
    const categoryRows = await db.select<LegacyCategoryRow[]>(
      "SELECT id, name_en, name_zh, color, sort_order, archived FROM categories ORDER BY sort_order",
    );
    const taskRows = await db.select<LegacyTaskRow[]>(
      `SELECT id, title, notes, category_id, status, start_at, end_at, due_at,
        priority, all_day, created_at, updated_at, device_id, row_version,
        source, external_uid
       FROM tasks WHERE deleted = 0 ORDER BY created_at`,
    );
    const completionRows = await db.select<LegacyCompletionRow[]>(
      "SELECT id, task_id, completed_at, device_id FROM task_completions ORDER BY completed_at",
    );

    const categories = buildCategories(categoryRows);
    const completionByTask = new Map<string, LegacyCompletionRow>();
    for (const row of completionRows) {
      if (!completionByTask.has(row.task_id)) completionByTask.set(row.task_id, row);
    }

    const groups = new Map<string, StoredTask[]>();
    for (const row of taskRows) {
      const completionRow = completionByTask.get(row.id) ?? null;
      let completion: Completion | null = completionRow
        ? {
            id: completionRow.id,
            taskId: row.id,
            completedAt: completionRow.completed_at,
            deviceId: completionRow.device_id,
          }
        : null;
      // A task marked done without a completion row still has a completion
      // date in `updated_at`; synthesise one so the checked box survives.
      if (!completion && row.status === "done") {
        completion = {
          id: crypto.randomUUID(),
          taskId: row.id,
          completedAt: row.updated_at,
          deviceId: row.device_id,
        };
      }
      const task = toTask(row, completion);
      const dateKey = (task.startAt ?? task.dueAt)?.slice(0, 10) ?? null;
      if (dateKey) task.status = "scheduled";
      if (completion) task.status = "done";
      const key = dateKey ?? "";
      const list = groups.get(key) ?? [];
      list.push({ task, completion, dateKey });
      groups.set(key, list);
    }

    const updatedAt = new Date().toISOString();
    const meta = { updatedAt, deviceId: deviceId() };
    for (const [key, entries] of groups) {
      if (!key) continue;
      await writeTextFile(dayFilePath(root, key), serializeMarkdown(key, entries, categories, [], meta));
    }
    await writeTextFile(
      backlogPath(root),
      serializeMarkdown(null, groups.get("") ?? [], categories, [], meta),
    );
    // Commit marker: once this exists, migration will not run again.
    await writeTextFile(categoriesPath(root), serializeCategoriesMarkdown(categories));

    try {
      await renamePath(legacyPath, `${legacyPath}.migrated-${stamp()}`);
    } catch {
      // The Markdown data is already safe; a failed rename only leaves the
      // legacy file in place for manual cleanup.
    }
    return true;
  } finally {
    await db.close().catch(() => undefined);
  }
}

function buildCategories(rows: LegacyCategoryRow[]): Category[] {
  if (rows.length > 0) {
    return rows.map((row) => ({
      id: row.id,
      nameEn: row.name_en,
      nameZh: row.name_zh,
      color: row.color,
      sortOrder: row.sort_order,
      archived: row.archived === 1,
    }));
  }
  return DEFAULT_CATEGORIES.map((category, index) => ({
    id: crypto.randomUUID(),
    nameEn: category.nameEn,
    nameZh: category.nameZh,
    color: category.color,
    sortOrder: index,
    archived: false,
  }));
}

function toTask(row: LegacyTaskRow, completion: Completion | null): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    categoryId: row.category_id,
    status: completion ? "done" : row.status,
    startAt: row.start_at,
    endAt: row.end_at,
    dueAt: row.due_at,
    priority: row.priority,
    allDay: row.all_day === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deviceId: row.device_id,
    rowVersion: row.row_version,
    deleted: false,
    source: row.source,
    externalUid: row.external_uid,
  };
}

function stamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
