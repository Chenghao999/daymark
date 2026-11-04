import type { MergeConflict } from "../merge/types";

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
  /**
   * Automatic sync interval in minutes while the app is open; `0` means the
   * user presses "Sync now". Device-local, like the rest of this config.
   */
  autoSyncMinutes: number;
  /**
   * Run one sync when the data folder opens, before the interval's first tick.
   * Useful for short sessions; conflicts still wait for the user either way.
   */
  syncOnLaunch: boolean;
}

export interface RemoteEntry {
  /** Path relative to the remote root, using `/` separators. */
  path: string;
  isDirectory: boolean;
  size: number | null;
  etag: string | null;
  lastModified: string | null;
}

/** Optional conditional-write guard for one upload. */
export interface PutOptions {
  /** Overwrite only while the remote ETag still matches (`If-Match`). */
  ifMatch?: string | null;
  /** Create only, failing if the file appeared meanwhile (`If-None-Match: *`). */
  ifNoneMatch?: boolean;
}

/** A single request to the Rust `webdav_request` command. */
export interface WebDavRequest {
  method: string;
  url: string;
  username?: string | null;
  password?: string | null;
  depth?: string | null;
  headers?: Record<string, string> | null;
  body?: string | null;
}

export interface WebDavHttpResponse {
  status: number;
  body: string;
  etag: string | null;
  lastModified: string | null;
}

/** Transport seam: `WebDavClient` normally goes through Tauri. */
export type WebDavTransport = (request: WebDavRequest) => Promise<WebDavHttpResponse>;

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

/**
 * The WebDAV operations the sync engine needs. `WebDavClient` is the real
 * implementation; tests provide an in-memory one.
 */
export interface RemoteClient {
  listTree(): Promise<RemoteEntry[]>;
  getText(path: string): Promise<string>;
  putText(path: string, contents: string, options?: PutOptions): Promise<void>;
  mkcol(path?: string): Promise<void>;
  /** Text and ETag from one GET, so a later write can test that exact copy. */
  getTextWithEtag?(path: string): Promise<{ text: string; etag: string | null }>;
  /** Current ETag of a file, used before overwriting during conflict resolution. */
  etag?(path: string): Promise<string | null>;
}

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

/** Local file access the sync needs; tests replace it with a memory folder. */
export interface SyncIo {
  listDir(path: string): Promise<{ name: string; isDirectory: boolean }[]>;
  readTextFile(path: string): Promise<string | null>;
  writeTextFile(path: string, text: string): Promise<void>;
  pathExists(path: string): Promise<boolean>;
}

/** Device-local record of the last successful sync. */
export interface BaselineStore {
  load(): Baseline;
  save(baseline: Baseline): void;
}

export type ConflictKind = "tasks" | "settings" | "categories";

/** A path whose two copies could not be merged without a user's decision. */
export interface SyncConflict {
  /** Canonical relative path; its local copy is kept. */
  path: string;
  /** Relative path of the copy holding the remote text, or null if unwritten. */
  copy: string | null;
  kind: ConflictKind;
  /** Items the merge could not order; empty when the file could not be parsed. */
  items: MergeConflict[];
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  /** Both sides changed, but a merge resolved every difference. */
  merged: number;
  unchanged: number;
  /** Paths whose two sides differ and need a decision. */
  conflicts: SyncConflict[];
  errors: string[];
}
