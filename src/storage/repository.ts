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
import type { StoredTask } from "./types";

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

