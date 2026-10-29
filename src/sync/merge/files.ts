import type { Category } from "../../domain/types";
import { SYNCED_KEYS, type SyncedSettings } from "../../settings/store";
import {
  parseCategoriesMarkdown,
  serializeCategoriesMarkdown,
} from "../../storage/markdown";
import {
  parseSettingsMarkdown,
  serializeSettingsMarkdown,
} from "../../storage/settingsFile";
import type { MergeConflict, MergeOutcome } from "./types";

/**
 * Three-way merge for the two small shared files. A day file carries a version
 * per task, but settings and categories do not, so the last synced text is the
 * base: a value changed on one side only takes that side's value, and only a
 * value changed differently on both sides is a conflict (doc 06 §4).
 *
 * `baseText` is null when no base was recorded yet (the first sync after an
 * upgrade, or a first sync of this folder). The merge is then conservative:
 * identical values are kept and any difference is a conflict.
 */

export function mergeSettingsFile(
  localText: string,
  remoteText: string,
  baseText: string | null,
): MergeOutcome {
  const local = parseSettingsMarkdown(localText);
  const remote = parseSettingsMarkdown(remoteText);
  const base = baseText === null ? null : parseSettingsMarkdown(baseText);

  const merged: SyncedSettings = { ...local };
  const conflicts: MergeConflict[] = [];

  const mergeKey = <K extends keyof SyncedSettings>(key: K): void => {
    merged[key] = pick(local[key], remote[key], base?.[key], key, key, conflicts);
  };
  for (const key of SYNCED_KEYS) mergeKey(key);

  if (conflicts.length > 0) {
    return { clean: false, text: localText, conflicts, itemCount: 0 };
  }
  return {
    clean: true,
    text: serializeSettingsMarkdown({ ...merged, dataDir: "", theme: "system" }),
    conflicts: [],
    itemCount: SYNCED_KEYS.length,
  };
}

const CATEGORY_FIELDS = [
  "nameEn",
  "nameZh",
  "color",
  "sortOrder",
  "archived",
] as const;

export function mergeCategoriesFile(
  localText: string,
  remoteText: string,
  baseText: string | null,
): MergeOutcome {
  const local = byId(parseCategoriesMarkdown(localText));
  const remote = byId(parseCategoriesMarkdown(remoteText));
  const base = baseText === null ? null : byId(parseCategoriesMarkdown(baseText));

  const ids = [...new Set([...local.keys(), ...remote.keys(), ...(base?.keys() ?? [])])];
  const merged: Category[] = [];
  const conflicts: MergeConflict[] = [];

  for (const id of ids.sort()) {
    const result = mergeCategory(id, local.get(id), remote.get(id), base?.get(id), conflicts);
    if (result) merged.push(result);
  }

  if (conflicts.length > 0) {
    return { clean: false, text: localText, conflicts, itemCount: 0 };
  }
  return {
    clean: true,
    text: serializeCategoriesMarkdown(merged),
    conflicts: [],
    itemCount: merged.length,
  };
}

/**
 * A category present on one side only is kept, unless the other side deleted an
 * unchanged category — a deletion wins over no edit and loses to an edit
 * (doc 06 §4). Fields are resolved one at a time against the base.
 */
function mergeCategory(
  id: string,
  local: Category | undefined,
  remote: Category | undefined,
  base: Category | undefined,
  conflicts: MergeConflict[],
): Category | null {
  if (local && !remote) {
    return base && sameCategory(local, base) ? null : local;
  }
  if (remote && !local) {
    return base && sameCategory(remote, base) ? null : remote;
  }
  if (!local || !remote) return null;

  const merged: Category = { ...local };
  const label = `${local.nameEn} / ${local.nameZh}`;
  merged.nameEn = pick(local.nameEn, remote.nameEn, base?.nameEn, id, label, conflicts);
  merged.nameZh = pick(local.nameZh, remote.nameZh, base?.nameZh, id, label, conflicts);
  merged.color = pick(local.color, remote.color, base?.color, id, label, conflicts);
  merged.sortOrder = pick(
    local.sortOrder,
    remote.sortOrder,
    base?.sortOrder,
    id,
    label,
    conflicts,
  );
  merged.archived = pick(local.archived, remote.archived, base?.archived, id, label, conflicts);
  return merged;
}

function sameCategory(a: Category, b: Category): boolean {
  return CATEGORY_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * The one rule every field and key uses. Without a base, only equal values can
 * be accepted; with one, a value equal to the base did not change on that side.
 */
function pick<T>(
  local: T,
  remote: T,
  base: T | undefined,
  id: string,
  label: string,
  conflicts: MergeConflict[],
): T {
  if (local === remote) return local;
  if (base !== undefined && local === base) return remote;
  if (base !== undefined && remote === base) return local;
  conflicts.push({ id, label, fields: ["value"] });
  return local;
}

function byId(categories: Category[]): Map<string, Category> {
  return new Map(categories.map((category) => [category.id, category]));
}
