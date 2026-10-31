import { BACKLOG_FILE, isDayFile } from "../../storage/paths";

export type {
  MergeConflict,
  MergeDecision,
  MergeDecisions,
  MergeOutcome,
} from "./types";
export { mergeTaskFile, type MergeOptions } from "./tasks";
export { mergeCategoriesFile, mergeSettingsFile } from "./files";

/**
 * The date key of a file whose tasks can be merged, `null` for the backlog,
 * or `undefined` when the path is not a task file (`_settings.md`,
 * `_categories.md`).
 */
export function mergeableDateKey(path: string): string | null | undefined {
  if (path === BACKLOG_FILE) return null;
  const slash = path.lastIndexOf("/");
  if (slash < 0) return undefined;
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  if (!/^\d{4}-\d{2}$/.test(folder) || !isDayFile(name)) return undefined;
  const dateKey = name.slice(0, 10);
  return folder === dateKey.slice(0, 7) ? dateKey : undefined;
}
