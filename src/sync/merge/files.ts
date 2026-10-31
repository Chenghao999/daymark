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
import type { MergeConflict, MergeDecision, MergeDecisions, MergeOutcome } from "./types";

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
  decisions?: MergeDecisions,
): MergeOutcome {
  const local = parseSettingsMarkdown(localText);
  const remote = parseSettingsMarkdown(remoteText);
  const base = baseText === null ? null : parseSettingsMarkdown(baseText);

  const merged: SyncedSettings = { ...local };
  const conflicts: MergeConflict[] = [];

  const mergeKey = <K extends keyof SyncedSettings>(key: K): void => {
    const result = pick(local[key], remote[key], base?.[key], decisions?.[key]);
    merged[key] = result.value;
    if (result.conflicted) {
      conflicts.push({
        id: key,
        label: key,
        fields: ["value"],
        local: describe(local[key]),
        remote: describe(remote[key]),
      });
    }
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
  decisions?: MergeDecisions,
): MergeOutcome {
  const local = byId(parseCategoriesMarkdown(localText));
  const remote = byId(parseCategoriesMarkdown(remoteText));
  const base = baseText === null ? null : byId(parseCategoriesMarkdown(baseText));

  const ids = [...new Set([...local.keys(), ...remote.keys(), ...(base?.keys() ?? [])])];
  const merged: Category[] = [];
  const conflicts: MergeConflict[] = [];

  for (const id of ids.sort()) {
    const result = mergeCategory(
      id,
      local.get(id),
      remote.get(id),
      base?.get(id),
      conflicts,
      decisions,
    );
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
  decisions?: MergeDecisions,
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
  const conflicted: string[] = [];
  const take = <K extends keyof Category>(field: K): void => {
    const result = pick(local[field], remote[field], base?.[field], decisions?.[id]);
    merged[field] = result.value;
    if (result.conflicted) conflicted.push(field);
  };
  for (const field of CATEGORY_FIELDS) take(field);

  // One category is one choice, however many of its fields differ.
  if (conflicted.length > 0) {
    conflicts.push({
      id,
      label,
      fields: conflicted,
      local: describeCategory(local),
      remote: describeCategory(remote),
    });
  }
  return merged;
}

function sameCategory(a: Category, b: Category): boolean {
  return CATEGORY_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * The one rule every field and key uses. Without a base, only equal values can
 * be accepted; with one, a value equal to the base did not change on that side.
 * A user's answer settles what is left; otherwise the caller records a
 * conflict and the local value is kept.
 */
function pick<T>(
  local: T,
  remote: T,
  base: T | undefined,
  decision: MergeDecision | undefined,
): { value: T; conflicted: boolean } {
  if (local === remote) return { value: local, conflicted: false };
  if (base !== undefined && local === base) return { value: remote, conflicted: false };
  if (base !== undefined && remote === base) return { value: local, conflicted: false };
  if (decision === "remote") return { value: remote, conflicted: false };
  if (decision === "local") return { value: local, conflicted: false };
  return { value: local, conflicted: true };
}

/** One side of a scalar setting, trimmed for display in the chooser. */
function describe(value: unknown): string {
  return clip(String(value));
}

function describeCategory(category: Category): string {
  return clip(`${category.nameEn} / ${category.nameZh} · ${category.color}`);
}

function clip(text: string): string {
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

function byId(categories: Category[]): Map<string, Category> {
  return new Map(categories.map((category) => [category.id, category]));
}
