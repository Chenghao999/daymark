import type { Category } from "../../domain/types";
import { deviceId } from "../../storage/device";
import { parseCategoriesMarkdown } from "../../storage/markdown";
import { CATEGORIES_FILE, SETTINGS_FILE, categoriesPath } from "../../storage/paths";
import {
  mergeCategoriesFile,
  mergeSettingsFile,
  mergeTaskFile,
  mergeableDateKey,
  type MergeConflict,
} from "../merge";
import { WebDavClient, WebDavError, ensureRemoteDirectory } from "./client";
import { REAL_SYNC_IO, baselineStore } from "./io";
import { localManifest, sha256 } from "./manifest";
import { planSync } from "./plan";
import type {
  Baseline,
  BaselineEntry,
  BaselineStore,
  ConflictKind,
  RemoteClient,
  SyncConflict,
  SyncIo,
  SyncProgress,
  SyncResult,
  WebDavConfig,
} from "./types";

export interface SyncOptions {
  onProgress?: (progress: SyncProgress) => void;
  /** Injectable clock, used to name conflict copies in tests. */
  now?: Date;
  device?: string;
  /** In-memory WebDAV transport for tests; otherwise built from `config`. */
  client?: RemoteClient;
  /** Local file access for tests; defaults to the Tauri commands. */
  io?: SyncIo;
  /** Baseline storage for tests; defaults to `localStorage`. */
  baseline?: BaselineStore;
}

/**
 * Manual, one-shot WebDAV sync.
 *
 * Order matters: read both sides completely, decide once, then write. A failed
 * upload or download is reported and leaves both copies intact; the baseline
 * for that path is kept unchanged so the next run retries it.
 */
export async function syncWebDav(
  config: WebDavConfig,
  root: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const progress = options.onProgress ?? (() => undefined);
  const io = options.io ?? REAL_SYNC_IO;
  const store = options.baseline ?? baselineStore(config);
  const local = await localManifest(root, io);
  progress({ phase: "local", done: local.hashes.size, total: local.hashes.size });

  const client = options.client ?? new WebDavClient(config);
  const remoteEntries = await listRemote(client);
  progress({ phase: "remote", done: 0, total: remoteEntries.length });

  const remoteTexts = new Map<string, string>();
  const remoteHashes = new Map<string, string>();
  for (const [index, entry] of remoteEntries.entries()) {
    try {
      const text = await client.getText(entry.path);
      remoteTexts.set(entry.path, text);
      remoteHashes.set(entry.path, await sha256(text));
    } catch (error) {
      // A file that cannot be read is not treated as absent: abort before
      // writing anything, so the plan cannot upload over an unreadable remote.
      return {
        uploaded: 0,
        downloaded: 0,
        merged: 0,
        unchanged: 0,
        conflicts: [],
        errors: [message(error)],
      };
    }
    progress({ phase: "remote", done: index + 1, total: remoteEntries.length, path: entry.path });
  }

  const baseline = store.load();
  const plan = planSync(local.hashes, remoteHashes, baseline);
  const nextBaseline: Baseline = { ...baseline };
  const errors: string[] = [];
  const conflictDetails: SyncConflict[] = [];
  let uploaded = 0;
  let downloaded = 0;
  let merged = 0;
  let categories: Category[] | null = null;

  const loadCategories = async (): Promise<Category[]> => {
    if (categories === null) {
      const text = await io.readTextFile(categoriesPath(root));
      categories = text ? parseCategoriesMarkdown(text) : [];
    }
    return categories;
  };

  // Settings and categories have no per-entry version, so the last synced text
  // is their three-way merge base. Day files carry versions per task and keep
  // no text here.
  const threeWay = new Set([SETTINGS_FILE, CATEGORIES_FILE]);
  const entryFor = (path: string, text: string, hash: string): BaselineEntry => ({
    local: hash,
    remote: hash,
    ...(threeWay.has(path) ? { baseText: text } : {}),
  });

  const applyMerge = async (path: string, text: string): Promise<void> => {
    await io.writeTextFile(`${root}/${path}`, text);
    // The local file now holds the merge. Count it even if the upload fails
    // below: the caller reloads the store, and the next run sees "local
    // changed" and uploads the merged text. Leaving the in-memory store stale
    // would let the next edit overwrite this merge.
    merged += 1;
    await ensureRemoteDirectory(client, path);
    await client.putText(path, text);
    const hash = await sha256(text);
    nextBaseline[path] = entryFor(path, text, hash);
  };

  // Remove baseline entries for files that no longer exist on either side.
  for (const path of Object.keys(nextBaseline)) {
    if (!local.hashes.has(path) && !remoteHashes.has(path)) delete nextBaseline[path];
  }

  for (const path of plan.unchanged) {
    const hash = local.hashes.get(path) as string;
    const text = local.texts.get(path) ?? "";
    nextBaseline[path] = entryFor(path, text, hash);
  }

  const total = plan.uploads.length + plan.downloads.length + plan.conflicts.length;
  let done = 0;

  for (const operation of plan.uploads) {
    const text = local.texts.get(operation.path);
    if (text === undefined) continue;
    try {
      await ensureRemoteDirectory(client, operation.path);
      await client.putText(operation.path, text);
      const hash = local.hashes.get(operation.path) as string;
      nextBaseline[operation.path] = entryFor(operation.path, text, hash);
      uploaded += 1;
    } catch (error) {
      errors.push(`${operation.path}: ${message(error)}`);
    }
    progress({ phase: "apply", done: ++done, total, path: operation.path });
  }

  for (const operation of plan.downloads) {
    const text = remoteTexts.get(operation.path);
    if (text === undefined) continue;
    try {
      await io.writeTextFile(`${root}/${operation.path}`, text);
      const hash = remoteHashes.get(operation.path) as string;
      nextBaseline[operation.path] = entryFor(operation.path, text, hash);
      downloaded += 1;
    } catch (error) {
      errors.push(`${operation.path}: ${message(error)}`);
    }
    progress({ phase: "apply", done: ++done, total, path: operation.path });
  }

  for (const path of plan.conflicts) {
    const localText = local.texts.get(path);
    const remoteText = remoteTexts.get(path);
    const dateKey = mergeableDateKey(path);
    const kind: ConflictKind =
      path === SETTINGS_FILE ? "settings" : path === CATEGORIES_FILE ? "categories" : "tasks";
    let items: MergeConflict[] = [];

    if (localText !== undefined && remoteText !== undefined) {
      // Both sides edited the same file. Day and backlog files merge per task;
      // settings and categories merge per key against the last synced text. A
      // clean merge replaces both copies; anything ambiguous keeps both files
      // and is reported for the user to decide (doc 06 §4).
      const outcome =
        dateKey !== undefined
          ? mergeTaskFile(localText, remoteText, {
              dateKey,
              categories: await loadCategories(),
              deviceId: options.device ?? deviceId(),
              updatedAt: (options.now ?? new Date()).toISOString(),
            })
          : threeWay.has(path)
            ? path === SETTINGS_FILE
              ? mergeSettingsFile(localText, remoteText, baseline[path]?.baseText ?? null)
              : mergeCategoriesFile(localText, remoteText, baseline[path]?.baseText ?? null)
            : null;

      if (outcome?.clean) {
        try {
          await applyMerge(path, outcome.text);
        } catch (error) {
          errors.push(`${path}: ${message(error)}`);
        }
        progress({ phase: "apply", done: ++done, total, path });
        continue;
      }
      items = outcome?.conflicts ?? [];
    }

    let copy: string | null = null;
    if (remoteText !== undefined) {
      try {
        const target = await conflictPath(root, path, options, io);
        await io.writeTextFile(target, remoteText);
        copy = target.slice(root.length + 1);
      } catch (error) {
        errors.push(`${path}: ${message(error)}`);
      }
    }
    conflictDetails.push({ path, copy, kind, items });
    // The baseline entry stays as it was, so the next run reports the same
    // conflict until the two copies are resolved.
    progress({ phase: "apply", done: ++done, total, path });
  }

  store.save(nextBaseline);

  return {
    uploaded,
    downloaded,
    merged,
    unchanged: plan.unchanged.length,
    conflicts: conflictDetails,
    errors,
  };
}

async function listRemote(client: RemoteClient) {
  try {
    return await client.listTree();
  } catch (error) {
    if (error instanceof WebDavError && error.status === 404) {
      // First sync: create the remote root, then retry once.
      await client.mkcol();
      return client.listTree();
    }
    throw error;
  }
}

async function conflictPath(
  root: string,
  path: string,
  options: SyncOptions,
  io: SyncIo,
): Promise<string> {
  const slash = path.lastIndexOf("/");
  const directory = slash >= 0 ? path.slice(0, slash) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const base = name.replace(/\.md$/i, "");
  const device = (options.device ?? deviceId()).slice(0, 8);
  const stamp = timestamp(options.now ?? new Date());

  const build = (suffix: string) =>
    directory ? `${root}/${directory}/${base}${suffix}` : `${root}/${base}${suffix}`;

  let candidate = build(` (conflict ${device} ${stamp}).md`);
  let counter = 2;
  while (await io.pathExists(candidate)) {
    candidate = build(` (conflict ${device} ${stamp}-${counter}).md`);
    counter += 1;
  }
  return candidate;
}

function timestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
