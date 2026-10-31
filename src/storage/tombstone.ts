import type { StoredTask } from "./types";

/**
 * A task deletion that travels with the Markdown (doc 05, doc 06 §4).
 *
 * Without a record of the deletion, a merge sees a task that exists on one side
 * and re-adds it. The marker lives in the extras of the task's day file (or
 * `_backlog.md`), so it is written back with the rest of the file and merges by
 * union like any other hand-written line.
 */
export interface Tombstone {
  id: string;
  /** ISO timestamp of the deletion; compared with a task's `updatedAt`. */
  deletedAt: string;
  deviceId: string;
}

const TOMBSTONE_RE = /^\s*<!--\s*daymark deleted\s+(\{.*\})\s*-->\s*$/;

export function tombstoneLine(tombstone: Tombstone): string {
  return `<!-- daymark deleted ${JSON.stringify(tombstone)} -->`;
}

export function isTombstoneLine(line: string): boolean {
  return TOMBSTONE_RE.test(line);
}

export function parseTombstone(line: string): Tombstone | null {
  const match = TOMBSTONE_RE.exec(line);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[1]) as Record<string, unknown>;
    if (typeof raw.id !== "string" || typeof raw.deletedAt !== "string") return null;
    return {
      id: raw.id,
      deletedAt: raw.deletedAt,
      deviceId: typeof raw.deviceId === "string" ? raw.deviceId : "unknown-device",
    };
  } catch {
    return null;
  }
}

/** Every well-formed marker in a file's extras, in file order. */
export function tombstonesFromExtras(extras: string[]): Tombstone[] {
  const found: Tombstone[] = [];
  for (const line of extras) {
    const tombstone = parseTombstone(line);
    if (tombstone) found.push(tombstone);
  }
  return found;
}

/**
 * One entry per task id. Two devices that both deleted the same task keep the
 * later deletion, so a stale copy cannot outlive a second, later deletion.
 */
export function tombstoneMap(tombstones: Tombstone[]): Map<string, Tombstone> {
  const map = new Map<string, Tombstone>();
  for (const tombstone of tombstones) {
    const existing = map.get(tombstone.id);
    if (!existing || tombstone.deletedAt > existing.deletedAt) {
      map.set(tombstone.id, tombstone);
    }
  }
  return map;
}

/**
 * An edit made after the deletion wins, because the deletion only knew about
 * the version it removed; otherwise the task stays deleted. A tie counts as
 * deleted: the two records refer to the same state.
 */
export function isTombstoned(
  updatedAt: string,
  tombstones: Map<string, Tombstone>,
  id: string,
): boolean {
  const tombstone = tombstones.get(id);
  return tombstone !== undefined && updatedAt <= tombstone.deletedAt;
}

export function withoutTombstoned(
  tasks: StoredTask[],
  tombstones: Map<string, Tombstone>,
): StoredTask[] {
  if (tombstones.size === 0) return tasks;
  return tasks.filter((stored) => !isTombstoned(stored.task.updatedAt, tombstones, stored.task.id));
}
