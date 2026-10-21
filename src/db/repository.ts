import { getDb, deviceId } from "./client";
import type { Category, Completion, Task, TaskStatus } from "../domain/types";

interface TaskRow {
  id: string;
  title: string;
  notes: string;
  category_id: string | null;
  status: TaskStatus;
  start_at: string | null;
  end_at: string | null;
  due_at: string | null;
  priority: number;
  all_day: number;
  created_at: string;
  updated_at: string;
  device_id: string;
  row_version: number;
  deleted: number;
  source: "local" | "caldav";
  external_uid: string | null;
}

interface CategoryRow {
  id: string;
  name_en: string;
  name_zh: string;
  color: string;
  sort_order: number;
  archived: number;
}

interface CompletionRow {
  id: string;
  task_id: string;
  completed_at: string;
  device_id: string;
}

const TASK_COLUMNS = `id, title, notes, category_id, status, start_at, end_at, due_at,
  priority, all_day, created_at, updated_at, device_id, row_version, deleted, source, external_uid`;

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    categoryId: row.category_id,
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at,
    dueAt: row.due_at,
    priority: row.priority,
    allDay: row.all_day === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deviceId: row.device_id,
    rowVersion: row.row_version,
    deleted: row.deleted === 1,
    source: row.source,
    externalUid: row.external_uid,
  };
}

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    nameEn: row.name_en,
    nameZh: row.name_zh,
    color: row.color,
    sortOrder: row.sort_order,
    archived: row.archived === 1,
  };
}

export async function listTasks(): Promise<Task[]> {
  const rows = await getDb().select<TaskRow[]>(
    `SELECT ${TASK_COLUMNS} FROM tasks WHERE deleted = 0 ORDER BY start_at IS NULL, start_at, priority DESC`,
  );
  return rows.map(toTask);
}

export async function listCategories(includeArchived = false): Promise<Category[]> {
  const rows = await getDb().select<CategoryRow[]>(
    `SELECT id, name_en, name_zh, color, sort_order, archived FROM categories
     ${includeArchived ? "" : "WHERE archived = 0"} ORDER BY sort_order, name_en`,
  );
  return rows.map(toCategory);
}

export async function createTask(input: {
  title: string;
  notes?: string;
  categoryId?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  dueAt?: string | null;
  priority?: number;
  allDay?: boolean;
}): Promise<Task> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const status: TaskStatus = input.startAt || input.dueAt ? "scheduled" : "backlog";
  await getDb().execute(
    `INSERT INTO tasks (id, title, notes, category_id, status, start_at, end_at, due_at,
       priority, all_day, created_at, updated_at, device_id, row_version, deleted, source, external_uid)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,1,0,'local',NULL)`,
    [
      id,
      input.title,
      input.notes ?? "",
      input.categoryId ?? null,
      status,
      input.startAt ?? null,
      input.endAt ?? null,
      input.dueAt ?? null,
      input.priority ?? 0,
      input.allDay ? 1 : 0,
      now,
      now,
      deviceId(),
    ],
  );
  await touchSyncMeta();
  return {
    id,
    title: input.title,
    notes: input.notes ?? "",
    categoryId: input.categoryId ?? null,
    status,
    startAt: input.startAt ?? null,
    endAt: input.endAt ?? null,
    dueAt: input.dueAt ?? null,
    priority: input.priority ?? 0,
    allDay: input.allDay ?? false,
    createdAt: now,
    updatedAt: now,
    deviceId: deviceId(),
    rowVersion: 1,
    deleted: false,
    source: "local",
    externalUid: null,
  };
}

export async function updateTask(task: Task): Promise<void> {
  await getDb().execute(
    `UPDATE tasks SET title=$2, notes=$3, category_id=$4, status=$5, start_at=$6,
       end_at=$7, due_at=$8, priority=$9, all_day=$10, updated_at=$11,
       row_version=row_version+1
     WHERE id=$1`,
    [
      task.id,
      task.title,
      task.notes,
      task.categoryId,
      task.status,
      task.startAt,
      task.endAt,
      task.dueAt,
      task.priority,
      task.allDay ? 1 : 0,
      new Date().toISOString(),
    ],
  );
  await touchSyncMeta();
}

export async function softDeleteTask(id: string): Promise<void> {
  await getDb().execute(
    "UPDATE tasks SET deleted=1, updated_at=$2, row_version=row_version+1 WHERE id=$1",
    [id, new Date().toISOString()],
  );
  await touchSyncMeta();
}

export async function completeTask(task: Task, completedAt = new Date().toISOString()): Promise<void> {
  await getDb().execute(
    "UPDATE tasks SET status='done', updated_at=$2, row_version=row_version+1 WHERE id=$1",
    [task.id, completedAt],
  );
  await getDb().execute(
    "INSERT INTO task_completions (id, task_id, completed_at, device_id) VALUES ($1,$2,$3,$4)",
    [crypto.randomUUID(), task.id, completedAt, deviceId()],
  );
  await touchSyncMeta();
}

export async function reopenTask(task: Task): Promise<void> {
  const status = task.startAt || task.dueAt ? "scheduled" : "backlog";
  await getDb().execute(
    "UPDATE tasks SET status=$2, updated_at=$3, row_version=row_version+1 WHERE id=$1",
    [task.id, status, new Date().toISOString()],
  );
  await getDb().execute("DELETE FROM task_completions WHERE task_id=$1", [task.id]);
  await touchSyncMeta();
}

export async function listCompletions(fromIso: string, toIso: string): Promise<Completion[]> {
  const rows = await getDb().select<CompletionRow[]>(
    "SELECT id, task_id, completed_at, device_id FROM task_completions WHERE completed_at BETWEEN $1 AND $2 ORDER BY completed_at",
    [fromIso, toIso],
  );
  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    completedAt: row.completed_at,
    deviceId: row.device_id,
  }));
}

export async function createCategory(nameEn: string, nameZh: string, color: string): Promise<void> {
  const rows = await getDb().select<Array<{ n: number }>>("SELECT COUNT(*) AS n FROM categories");
  await getDb().execute(
    "INSERT INTO categories (id, name_en, name_zh, color, sort_order, archived) VALUES ($1,$2,$3,$4,$5,0)",
    [crypto.randomUUID(), nameEn, nameZh, color, rows[0]?.n ?? 0],
  );
  await touchSyncMeta();
}

export async function archiveCategory(id: string): Promise<void> {
  await getDb().execute("UPDATE categories SET archived=1 WHERE id=$1", [id]);
  await touchSyncMeta();
}

export async function getSyncMeta(key: string): Promise<string | null> {
  const rows = await getDb().select<Array<{ value: string }>>(
    "SELECT value FROM sync_meta WHERE key=$1",
    [key],
  );
  return rows[0]?.value ?? null;
}

async function touchSyncMeta(): Promise<void> {
  const now = new Date().toISOString();
  await getDb().execute(
    "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_write_device', $1), ('last_write_at', $2)",
    [deviceId(), now],
  );
}
