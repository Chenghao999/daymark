/** A user's answer for one unresolved conflict item. */
export type MergeDecision = "local" | "remote" | "both";

/**
 * Choices keyed by task id, category id or settings key. `both` is only valid
 * for a task conflict; it adds a second task with a fresh id.
 */
export type MergeDecisions = Record<string, MergeDecision>;

/** One entry whose two copies both changed and cannot be ordered by version. */
export interface MergeConflict {
  /** Task id, category id, or settings key. */
  id: string;
  /** What the user sees: task title, category name, or settings key. */
  label: string;
  /** Differing fields; `["value"]` for a scalar settings key. */
  fields: string[];
  /** One-line summary of this side, for the chooser UI. */
  local: string;
  /** One-line summary of the other side. */
  remote: string;
}

export interface MergeOutcome {
  /** True when the merged text can replace both copies without losing an edit. */
  clean: boolean;
  /**
   * The merged file text. When `clean` is false this is the untouched local
   * text, so a caller can never write a partial merge by accident.
   */
  text: string;
  conflicts: MergeConflict[];
  /** Tasks, categories or settings keys in the merged text; 0 when not clean. */
  itemCount: number;
}
