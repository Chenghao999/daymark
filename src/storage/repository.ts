import type { Category, Completion, Task } from "../domain/types";
import {
  completeTask as completeTaskState,
  hasSchedule,
  normalizeStatus,
  reopenTask as reopenTaskState,
  sortTasks,
  type NewTaskInput,
} from "../domain/tasks";
import { getStoreState } from "./client";
import { deviceId } from "./device";
import { removeFile, writeTextFile } from "./fs";
import { serializeCategoriesMarkdown, serializeMarkdown } from "./markdown";
import { backlogPath, categoriesPath, dateKeyOf, dayFilePath, extrasKey } from "./paths";
import { parseTombstone, tombstoneLine } from "./tombstone";
import { BACKLOG_KEY, type ExternalImportPlan, type StoreState, type StoredTask } from "./types";

/**
 * The storage layer owns file I/O and the in-memory index. All task state
 * transitions are delegated to `domain/tasks`, so the same rules apply to the
 * editor, the checklist and any future importer.
 */
export type { NewTaskInput } from "../domain/tasks";

export async function listTasks(): Promise<Task[]> {
  const state = getStoreState();
  return sortTasks([...state.tasks.values()].map((stored) => stored.task));
}

export async function listCategories(includeArchived = false): Promise<Category[]> {
  const state = getStoreState();
  return [...state.categories]
    .filter((category) => includeArchived || !category.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  const now = new Date().toISOString();
  const task: Task = {
    id: crypto.randomUUID(),
    title: input.title,
    notes: input.notes ?? "",
    categoryId: input.categoryId ?? null,
    status: hasSchedule({ startAt: input.startAt ?? null, dueAt: input.dueAt ?? null })
      ? "scheduled"
      : "backlog",
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
  await writeEntry({ task, completion: null, dateKey: dateKeyOf(task) });
  return task;
}

export async function updateTask(task: Task): Promise<void> {
  const existing = getStoreState().tasks.get(task.id);
  if (!existing) throw new Error(`Task not found: ${task.id}`);
  const updated: Task = {
    ...task,
    status: existing.completion ? "done" : normalizeStatus({ ...task, status: "backlog" }),
    updatedAt: new Date().toISOString(),
    rowVersion: existing.task.rowVersion + 1,
    deleted: false,
  };
  await writeEntry(
    { task: updated, completion: existing.completion, dateKey: dateKeyOf(updated) },
    existing.dateKey,
  );
}

export async function softDeleteTask(id: string): Promise<void> {
  const state = getStoreState();
  const existing = state.tasks.get(id);
  if (!existing) return;
  state.tasks.delete(id);
  // Leave a marker so a merge on another device does not re-add the task
  // (tombstone.ts). A hand-written line has no stable id to name, so its
  // removal is the whole record.
  if (!existing.handWritten) {
    const key = extrasKey(existing.dateKey);
    const marker = tombstoneLine({
      id,
      deletedAt: new Date().toISOString(),
      deviceId: deviceId(),
    });
    const extras = (state.extrasByDate.get(key) ?? []).filter(
      (line) => parseTombstone(line)?.id !== id,
    );
    state.extrasByDate.set(key, [...extras, marker]);
  }
  await persistDate(existing.dateKey);
}

export async function completeTask(
  task: Task,
  completedAt = new Date().toISOString(),
): Promise<void> {
  const existing = getStoreState().tasks.get(task.id);
  if (!existing) throw new Error(`Task not found: ${task.id}`);
  const completion: Completion = {
    id: crypto.randomUUID(),
    taskId: task.id,
    completedAt,
    deviceId: deviceId(),
  };
  const updated = completeTaskState(existing.task, completedAt);
  await writeEntry({ task: updated, completion, dateKey: existing.dateKey });
}

export async function reopenTask(task: Task): Promise<void> {
  const existing = getStoreState().tasks.get(task.id);
  if (!existing) throw new Error(`Task not found: ${task.id}`);
  const updated = reopenTaskState(existing.task);
  await writeEntry({ task: updated, completion: null, dateKey: existing.dateKey });
}

export async function listCompletions(fromIso: string, toIso: string): Promise<Completion[]> {
  const completions: Completion[] = [];
  for (const stored of getStoreState().tasks.values()) {
    const completion = stored.completion;
    if (!completion) continue;
    if (completion.completedAt >= fromIso && completion.completedAt <= toIso) {
      completions.push(completion);
    }
  }
  return completions.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}

export async function createCategory(
  nameEn: string,
  nameZh: string,
  color: string,
): Promise<void> {
  const state = getStoreState();
  state.categories.push({
    id: crypto.randomUUID(),
    nameEn,
    nameZh,
    color,
    sortOrder: state.categories.length,
    archived: false,
  });
  await writeCategories();
}

export async function archiveCategory(id: string): Promise<void> {
  const state = getStoreState();
  const category = state.categories.find((item) => item.id === id);
  if (!category) return;
  category.archived = true;
  await writeCategories();
}

/**
 * Applies a plan produced by an importer (currently CalDAV). Files are written
 * once per affected day rather than once per task, so a first import of a
 * full calendar is a handful of writes instead of hundreds.
 *
 * Imported tasks keep their id and completion record on update; only the
 * remote-owned fields change. A deleted remote event leaves the usual
 * tombstone, so another device using WebDAV sync removes it too.
 */
export async function applyExternalImport(plan: ExternalImportPlan): Promise<void> {
  const state = getStoreState();
  const now = new Date().toISOString();
  const dates = new Set<string | null>();

  for (const draft of plan.creates) {
    // A stable id means two devices importing the same event produce the same
    // task instead of two copies once WebDAV sync merges the day files.
    const id = externalTaskId(draft.externalUid);
    for (const key of removeTombstone(state, id)) {
      dates.add(key === BACKLOG_KEY ? null : key);
    }
    const task: Task = {
      id,
      title: draft.title,
      notes: draft.notes,
      categoryId: draft.categoryId,
      status: "scheduled",
      startAt: draft.startAt,
      endAt: draft.endAt,
      dueAt: null,
      priority: 0,
      allDay: draft.allDay,
      createdAt: now,
      updatedAt: now,
      deviceId: deviceId(),
      rowVersion: 1,
      deleted: false,
      source: "caldav",
      externalUid: draft.externalUid,
    };
    const dateKey = dateKeyOf(task);
    state.tasks.set(task.id, { task, completion: null, dateKey });
    dates.add(dateKey);
  }

  for (const update of plan.updates) {
    const existing = state.tasks.get(update.id);
    if (!existing || existing.task.source !== "caldav") continue;
    const task: Task = {
      ...existing.task,
      title: update.title,
      notes: update.notes,
      categoryId: update.categoryId,
      startAt: update.startAt,
      endAt: update.endAt,
      allDay: update.allDay,
      status: existing.completion ? "done" : "scheduled",
      updatedAt: now,
      rowVersion: existing.task.rowVersion + 1,
    };
    const nextDateKey = dateKeyOf(task);
    state.tasks.set(update.id, { task, completion: existing.completion, dateKey: nextDateKey });
    dates.add(existing.dateKey);
    dates.add(nextDateKey);
  }

  for (const id of plan.deletes) {
    const existing = state.tasks.get(id);
    if (!existing) continue;
    state.tasks.delete(id);
    dates.add(existing.dateKey);
    if (!existing.handWritten) {
      const key = extrasKey(existing.dateKey);
      const marker = tombstoneLine({ id, deletedAt: now, deviceId: deviceId() });
      const extras = (state.extrasByDate.get(key) ?? []).filter(
        (line) => parseTombstone(line)?.id !== id,
      );
      state.extrasByDate.set(key, [...extras, marker]);
    }
  }

  for (const dateKey of dates) await persistDate(dateKey);
}

/**
 * Turns an imported event into an ordinary local task. The caller records the
 * series UID as ignored, so the next calendar sync does not re-import it.
 */
export async function detachExternalTask(id: string): Promise<void> {
  const state = getStoreState();
  const existing = state.tasks.get(id);
  if (!existing || existing.task.source !== "caldav") return;
  const task: Task = {
    ...existing.task,
    source: "local",
    externalUid: null,
    updatedAt: new Date().toISOString(),
    rowVersion: existing.task.rowVersion + 1,
  };
  state.tasks.set(id, { task, completion: existing.completion, dateKey: existing.dateKey });
  await persistDate(existing.dateKey);
}

/**
 * Stable task id for an imported item. Two devices importing the same event
 * must produce the same id, or WebDAV sync would keep two copies. The value is
 * not a security hash — two 32-bit FNV-1a passes only make a collision with a
 * local UUID or another UID practically impossible.
 */
function externalTaskId(externalUid: string): string {
  return `caldav-${fnv1a(externalUid, 0x811c9dc5)}${fnv1a(externalUid, 0x5bd1e995)}`;
}

function fnv1a(value: string, seed: number): string {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Removes a stale deletion marker before a task with that id is created
 * again. Without this, `openStore` would filter the re-added event out.
 * Returns the extras keys that changed so their files are rewritten.
 */
function removeTombstone(state: StoreState, id: string): string[] {
  const changed: string[] = [];
  for (const [key, lines] of state.extrasByDate) {
    const filtered = lines.filter((line) => parseTombstone(line)?.id !== id);
    if (filtered.length !== lines.length) {
      state.extrasByDate.set(key, filtered);
      changed.push(key);
    }
  }
  return changed;
}

async function writeEntry(stored: StoredTask, previousDateKey?: string | null): Promise<void> {
  const state = getStoreState();
  state.tasks.set(stored.task.id, stored);
  await persistDate(stored.dateKey);
  if (previousDateKey !== undefined && previousDateKey !== stored.dateKey) {
    await persistDate(previousDateKey);
  }
}

async function persistDate(dateKey: string | null): Promise<void> {
  const state = getStoreState();
  const key = extrasKey(dateKey);
  const entries = [...state.tasks.values()].filter((stored) => stored.dateKey === dateKey);
  const extras = state.extrasByDate.get(key) ?? [];
  const path = dateKey ? dayFilePath(state.root, dateKey) : backlogPath(state.root);

  // A day file with no tasks and no hand-written content is removed. The
  // backlog file is canonical and is always kept.
  if (dateKey && entries.length === 0 && extras.length === 0) {
    await removeFile(path);
    return;
  }

  const text = serializeMarkdown(dateKey, entries, state.categories, extras, {
    updatedAt: new Date().toISOString(),
    deviceId: deviceId(),
  });
  await writeTextFile(path, text);
}

async function writeCategories(): Promise<void> {
  const state = getStoreState();
  await writeTextFile(categoriesPath(state.root), serializeCategoriesMarkdown(state.categories));
}

