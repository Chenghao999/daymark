import type { Category, Task } from "../../domain/types";
import { parseMarkdown, serializeMarkdown } from "../../storage/markdown";
import type { StoredTask } from "../../storage/types";
import type { MergeConflict, MergeOutcome } from "./types";

export interface MergeOptions {
  /** `YYYY-MM-DD`, or null for the backlog file. */
  dateKey: string | null;
  categories: Category[];
  deviceId: string;
  /** Timestamp written into the merged file header. */
  updatedAt: string;
}

/**
 * Merge two copies of one day or backlog file at the task level (doc 06 §4).
 *
 * Task identity is the `id` in the metadata comment, so a task edited on one
 * device and a different task edited on the other are simply combined. When
 * both copies of the same task differ, the higher `rowVersion` wins, then the
 * later `updatedAt`; a completion beats a reopen. A tie that no rule can order
 * is reported as a conflict, and the caller keeps both copies untouched rather
 * than writing a half-merged file.
 */
export function mergeTaskFile(
  localText: string,
  remoteText: string,
  options: MergeOptions,
): MergeOutcome {
  const local = parseMarkdown(localText, options.dateKey, options.categories);
  const remote = parseMarkdown(remoteText, options.dateKey, options.categories);

  const merged = new Map<string, StoredTask>();
  for (const entry of local.tasks) merged.set(entry.task.id, entry);

  // A hand-written line gets a fresh id on every parse, so the same line on
  // both sides has two different ids. Match those by content, once per copy.
  const handWritten = new Map<string, StoredTask[]>();
  for (const entry of local.tasks) {
    if (!entry.handWritten) continue;
    const key = contentKey(entry);
    handWritten.set(key, [...(handWritten.get(key) ?? []), entry]);
  }

  const conflicts: MergeConflict[] = [];

  for (const entry of remote.tasks) {
    const existing = merged.get(entry.task.id);
    if (existing) {
      merged.set(entry.task.id, resolvePair(existing, entry, conflicts));
      continue;
    }
    if (entry.handWritten && takeHandWritten(handWritten, entry)) continue;
    merged.set(entry.task.id, entry);
  }

  if (conflicts.length > 0) {
    return { clean: false, text: localText, conflicts, itemCount: 0 };
  }

  const extras = [...new Set([...local.extras, ...remote.extras])];
  const text = serializeMarkdown(
    options.dateKey,
    [...merged.values()],
    options.categories,
    extras,
    { updatedAt: options.updatedAt, deviceId: options.deviceId },
  );
  return { clean: true, text, conflicts: [], itemCount: merged.size };
}

function resolvePair(
  local: StoredTask,
  remote: StoredTask,
  conflicts: MergeConflict[],
): StoredTask {
  if (sameEntry(local, remote)) return local;

  // Completion wins over a reopen until the user resolves it (doc 06 §4).
  if (local.completion && !remote.completion) return local;
  if (remote.completion && !local.completion) return remote;

  const version = compareVersion(local.task, remote.task);
  if (version > 0) return local;
  if (version < 0) return remote;

  if (local.completion && remote.completion) {
    const completed =
      local.completion.completedAt === remote.completion.completedAt
        ? 0
        : local.completion.completedAt > remote.completion.completedAt
          ? 1
          : -1;
    if (completed !== 0) return completed > 0 ? local : remote;
  }

  // Same version, same timestamp, different content: keep the local copy and
  // let the user decide. Writing either one silently would lose an edit.
  conflicts.push({
    id: local.task.id,
    label: local.task.title,
    fields: differingFields(local, remote),
  });
  return local;
}

function compareVersion(a: Task, b: Task): number {
  if (a.rowVersion !== b.rowVersion) return a.rowVersion - b.rowVersion;
  if (a.updatedAt === b.updatedAt) return 0;
  return a.updatedAt > b.updatedAt ? 1 : -1;
}

function sameEntry(a: StoredTask, b: StoredTask): boolean {
  return differingFields(a, b).length === 0;
}

function differingFields(a: StoredTask, b: StoredTask): string[] {
  const fields: string[] = [];
  if (a.task.title !== b.task.title) fields.push("title");
  if (a.task.notes !== b.task.notes) fields.push("notes");
  if (a.task.categoryId !== b.task.categoryId) fields.push("category");
  if (a.task.startAt !== b.task.startAt) fields.push("start");
  if (a.task.endAt !== b.task.endAt) fields.push("end");
  if (a.task.dueAt !== b.task.dueAt) fields.push("due");
  if (a.task.priority !== b.task.priority) fields.push("priority");
  if (a.task.allDay !== b.task.allDay) fields.push("allDay");
  if (a.task.externalUid !== b.task.externalUid) fields.push("externalId");
  if ((a.completion?.completedAt ?? null) !== (b.completion?.completedAt ?? null)) {
    fields.push("completion");
  }
  return fields;
}

/** Semantic identity of a hand-written line; random ids and file metadata excluded. */
function contentKey(entry: StoredTask): string {
  const task = entry.task;
  return JSON.stringify([
    task.title,
    task.notes,
    task.categoryId,
    task.startAt,
    task.endAt,
    task.dueAt,
    task.priority,
    task.allDay,
    entry.completion?.completedAt ?? null,
  ]);
}

function takeHandWritten(
  index: Map<string, StoredTask[]>,
  entry: StoredTask,
): boolean {
  const candidates = index.get(contentKey(entry));
  if (!candidates || candidates.length === 0) return false;
  candidates.pop();
  return true;
}
