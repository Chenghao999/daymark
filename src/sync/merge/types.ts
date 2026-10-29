/** One task whose two copies both changed and cannot be ordered by version. */
export interface MergeConflict {
  taskId: string;
  title: string;
  /** Task fields that differ between the local and remote copies. */
  fields: string[];
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
  /** Number of tasks in the merged text; 0 when `clean` is false. */
  taskCount: number;
}
