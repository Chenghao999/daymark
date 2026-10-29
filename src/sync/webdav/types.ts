/**
 * Device-local WebDAV configuration. It deliberately does not live in
 * `_settings.md`: the password must never travel with the synced folder.
 */
export interface WebDavConfig {
  /** Server base URL, e.g. `https://dav.jianguoyun.com/dav`. */
  url: string;
  /** Folder that mirrors the local data folder; always starts and ends with `/`. */
  remotePath: string;
  username: string;
  password: string;
}

export interface RemoteEntry {
  /** Path relative to the remote root, using `/` separators. */
  path: string;
  isDirectory: boolean;
  size: number | null;
  etag: string | null;
  lastModified: string | null;
}

/** Content hash recorded for both sides at the last successful sync. */
export interface BaselineEntry {
  local: string;
  remote: string;
  /**
   * Last synced text, kept only for `_settings.md` and `_categories.md`.
   * Those files have no per-entry version, so this is the base of their
   * three-way merge. Day files carry versions per task and store no text.
   */
  baseText?: string;
}

export type Baseline = Record<string, BaselineEntry>;

export type SyncOperationKind = "upload" | "download";

export interface SyncOperation {
  kind: SyncOperationKind;
  path: string;
}

export interface SyncPlan {
  uploads: SyncOperation[];
  downloads: SyncOperation[];
  /** Paths changed on both sides; neither copy is overwritten. */
  conflicts: string[];
  unchanged: string[];
}

export interface SyncProgress {
  phase: "local" | "remote" | "apply";
  done: number;
  total: number;
  path?: string;
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  /** Both sides changed, but a task-level merge resolved every difference. */
  merged: number;
  unchanged: number;
  /** Conflict copies written next to the local original. */
  conflictCopies: string[];
  /** Paths whose two sides differ and need a manual merge. */
  conflicts: string[];
  errors: string[];
}
