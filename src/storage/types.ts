import type { Category, Completion, Task } from "../domain/types";

/** A task plus the completion record that belongs to it. */
export interface StoredTask {
  task: Task;
  completion: Completion | null;
  /** `YYYY-MM-DD` for a day file, `null` for the backlog file. */
  dateKey: string | null;
}

export interface StoreState {
  root: string;
  categories: Category[];
  tasks: Map<string, StoredTask>;
  /** Unmanaged lines preserved from each file, keyed by date key or BACKLOG_KEY. */
  extrasByDate: Map<string, string[]>;
}

export const BACKLOG_KEY = "backlog";
