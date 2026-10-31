import type { Category, Task } from "../../domain/types";
import { parseMarkdown, serializeMarkdown } from "../../storage/markdown";
import {
  isTombstoned,
  parseTombstone,
  tombstoneLine,
  tombstoneMap,
  tombstonesFromExtras,
} from "../../storage/tombstone";
import type { StoredTask } from "../../storage/types";
import type { MergeConflict, MergeDecisions, MergeOutcome } from "./types";

export interface MergeOptions {
  /** `YYYY-MM-DD`, or null for the backlog file. */
  dateKey: string | null;
  categories: Category[];
  deviceId: string;
  /** Timestamp written into the merged file header. */
  updatedAt: string;
  /** User answers for conflicts that no version rule could order. */
  decisions?: MergeDecisions;
}

/**
 * Merge two copies of one day or backlog file at the task level (doc 06 §4).
 *
 * Task identity is the `id` in the metadata comment, so a task edited on one
 * device and a different task edited on the other are simply combined. When
 * both copies of the same task differ, the higher `rowVersion` wins, then the
 * later `updatedAt`; a completion beats a reopen. A tie that no rule can order
 * is reported as a conflict, and the caller keeps both copies untouched rather
 * than writing a half-merged file. Deletion markers in the extras resolve a
 * task that exists on one side only: deletion wins unless the other side's edit
 * is newer than the deletion.
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
      const result = resolvePair(existing, entry, conflicts, options);
      merged.set(entry.task.id, result.kept);
      if (result.extra) merged.set(result.extra.task.id, result.extra);
      continue;
    }
    if (entry.handWritten && takeHandWritten(handWritten, entry)) continue;
    merged.set(entry.task.id, entry);
  }

  if (conflicts.length > 0) {
    return { clean: false, text: localText, conflicts, itemCount: 0 };
  }

  // A task deleted on either side carries a marker in that file's extras. The
  // task stays deleted unless the other side edited it after the deletion, in
  // which case the edit wins and the marker is dropped (doc 06 §4). Markers
  // are deduplicated by id and kept out of the plain extras union, so a merge
  // never stacks two markers for the same task.
  const tombstones = tombstoneMap([
    ...tombstonesFromExtras(local.extras),
    ...tombstonesFromExtras(remote.extras),
  ]);
  const kept = [...merged.values()].filter(
    (entry) => !isTombstoned(entry.task.updatedAt, tombstones, entry.task.id),
  );

  const keptIds = new Set(kept.map((entry) => entry.task.id));
  const extras = [
    ...new Set(
      [...local.extras, ...remote.extras].filter((line) => parseTombstone(line) === null),
    ),
  ];
  const survivors = [...tombstones.values()]
    .filter((tombstone) => !keptIds.has(tombstone.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const tombstone of survivors) extras.push(tombstoneLine(tombstone));

  const text = serializeMarkdown(
    options.dateKey,
    kept,
    options.categories,
    extras,
    { updatedAt: options.updatedAt, deviceId: options.deviceId },
  );
  return { clean: true, text, conflicts: [], itemCount: kept.length };
}

interface PairResult {
  kept: StoredTask;
  /** Present when the user chose "keep both": the remote copy with a new id. */
  extra?: StoredTask;
}

function resolvePair(
  local: StoredTask,
  remote: StoredTask,
  conflicts: MergeConflict[],
  options: MergeOptions,
): PairResult {
  if (sameEntry(local, remote)) return { kept: local };

  // Completion wins over a reopen until the user resolves it (doc 06 §4).
  if (local.completion && !remote.completion) return { kept: local };
  if (remote.completion && !local.completion) return { kept: remote };

  const version = compareVersion(local.task, remote.task);
  if (version > 0) return { kept: local };
  if (version < 0) return { kept: remote };

  if (local.completion && remote.completion) {
    const completed =
      local.completion.completedAt === remote.completion.completedAt
        ? 0
        : local.completion.completedAt > remote.completion.completedAt
          ? 1
          : -1;
    if (completed !== 0) return { kept: completed > 0 ? local : remote };
  }

  // Same version, same timestamp, different content: no rule can order the two
  // edits. An explicit user choice settles it; otherwise keep the local copy
  // and report the conflict so nothing is written silently.
  const decision = options.decisions?.[local.task.id];
  if (decision === "remote") return { kept: remote };
  if (decision === "both") {
    return { kept: local, extra: duplicateEntry(remote, options) };
  }
  if (decision === "local") return { kept: local };

  const fields = differingFields(local, remote);
  conflicts.push({
    id: local.task.id,
    label: local.task.title,
    fields,
    local: previewEntry(local, fields),
    remote: previewEntry(remote, fields),
  });
  return { kept: local };
}

/** The remote copy as a new task, so "keep both" never shares an id. */
function duplicateEntry(entry: StoredTask, options: MergeOptions): StoredTask {
  const id = crypto.randomUUID();
  const task: Task = {
    ...entry.task,
    id,
    createdAt: options.updatedAt,
    updatedAt: options.updatedAt,
    deviceId: options.deviceId,
    rowVersion: 1,
    source: "local",
    externalUid: null,
  };
  const completion = entry.completion
    ? { ...entry.completion, id: crypto.randomUUID(), taskId: id }
    : null;
  return { task, completion, dateKey: options.dateKey };
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

/**
 * A short description of one side for the chooser. When the title is part of
 * the difference it is the whole summary; otherwise the differing fields are
 * listed with their values.
 */
function previewEntry(entry: StoredTask, fields: string[]): string {
  if (fields.includes("title")) return clip(entry.task.title);
  return clip(fields.map((field) => `${field}: ${fieldValue(entry, field)}`).join(" · "));
}

function fieldValue(entry: StoredTask, field: string): string {
  const task = entry.task;
  switch (field) {
    case "notes":
      return clip(task.notes) || "—";
    case "category":
      return task.categoryId ?? "—";
    case "start":
      return task.startAt ?? "—";
    case "end":
      return task.endAt ?? "—";
    case "due":
      return task.dueAt ?? "—";
    case "priority":
      return String(task.priority);
    case "allDay":
      return task.allDay ? "all-day" : "timed";
    case "externalId":
      return task.externalUid ?? "—";
    case "completion":
      return entry.completion?.completedAt ?? "—";
    default:
      return "—";
  }
}

function clip(text: string): string {
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
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
