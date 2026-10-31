import type { Category } from "../../domain/types";
import { deviceId } from "../../storage/device";
import { parseCategoriesMarkdown } from "../../storage/markdown";
import { categoriesPath } from "../../storage/paths";
import {
  mergeCategoriesFile,
  mergeSettingsFile,
  mergeTaskFile,
  mergeableDateKey,
  type MergeConflict,
  type MergeDecisions,
  type MergeOutcome,
} from "../merge";
import { WebDavClient, ensureRemoteDirectory } from "./client";
import { REAL_SYNC_IO, baselineStore } from "./io";
import { sha256 } from "./manifest";
import type {
  BaselineStore,
  RemoteClient,
  SyncConflict,
  SyncIo,
  WebDavConfig,
} from "./types";

export interface ResolveOptions {
  /** Injectable clock, used for the merged file header and new task metadata. */
  now?: Date;
  device?: string;
  /** In-memory WebDAV transport for tests; otherwise built from `config`. */
  client?: RemoteClient;
  /** Local file access for tests; defaults to the Tauri commands. */
  io?: SyncIo;
  /** Baseline storage for tests; defaults to `localStorage`. */
  baseline?: BaselineStore;
}

export interface ResolveResult {
  /** Every difference is settled: both copies were rewritten. */
  resolved: boolean;
  /** Items still waiting for an answer; empty once `resolved` is true. */
  remaining: MergeConflict[];
  /**
   * The local file was rewritten, even if the upload then failed. The caller
   * must reload the store so an in-memory copy cannot overwrite the merge.
   */
  written: boolean;
  /** A problem that stopped the write, e.g. the upload failed. */
  error?: string;
}

/**
 * Applies the user's answers for one conflicted file (doc 06 §4).
 *
 * The merge is recomputed from the current local file and the remote copy kept
 * by the sync, so a local edit made after the sync is part of the merge rather
 * than silently overwritten. Only a fully settled merge writes: the local file
 * is replaced and uploaded, and the baseline advances so the next sync sees the
 * path as unchanged. The conflict copy is left on disk.
 */
export async function resolveConflict(
  config: WebDavConfig,
  root: string,
  conflict: SyncConflict,
  decisions: MergeDecisions,
  options: ResolveOptions = {},
): Promise<ResolveResult> {
  const io = options.io ?? REAL_SYNC_IO;
  const store = options.baseline ?? baselineStore(config);
  const localText = await io.readTextFile(`${root}/${conflict.path}`);
  if (localText === null) {
    return {
      resolved: false,
      remaining: conflict.items,
      written: false,
      error: `missing ${conflict.path}`,
    };
  }

  const client = options.client ?? new WebDavClient(config);
  const remoteText =
    conflict.copy !== null
      ? await io.readTextFile(`${root}/${conflict.copy}`)
      : await client.getText(conflict.path);
  if (remoteText === null) {
    return {
      resolved: false,
      remaining: conflict.items,
      written: false,
      error: `missing ${conflict.copy}`,
    };
  }

  const baseline = store.load();
  const baseText = baseline[conflict.path]?.baseText ?? null;
  const now = options.now ?? new Date();

  let outcome: MergeOutcome;
  if (conflict.kind === "settings") {
    outcome = mergeSettingsFile(localText, remoteText, baseText, decisions);
  } else if (conflict.kind === "categories") {
    outcome = mergeCategoriesFile(localText, remoteText, baseText, decisions);
  } else {
    const dateKey = mergeableDateKey(conflict.path);
    if (dateKey === undefined) {
      return {
        resolved: false,
        remaining: conflict.items,
        written: false,
        error: `not a task file: ${conflict.path}`,
      };
    }
    outcome = mergeTaskFile(localText, remoteText, {
      dateKey,
      categories: await loadCategories(root, io),
      deviceId: options.device ?? deviceId(),
      updatedAt: now.toISOString(),
      decisions,
    });
  }

  if (!outcome.clean) {
    return { resolved: false, remaining: outcome.conflicts, written: false };
  }

  const text = outcome.text;
  let written = false;
  try {
    // Local first, like the sync itself: if the upload fails, the merged text is
    // on disk and the next sync sees "local changed" and uploads it. The
    // baseline stays where it was, so that retry still compares against the
    // same base.
    await io.writeTextFile(`${root}/${conflict.path}`, text);
    written = true;
    await ensureRemoteDirectory(client, conflict.path);
    await client.putText(conflict.path, text);
  } catch (error) {
    // The answers stay open so the user can try again.
    return { resolved: false, remaining: conflict.items, written, error: message(error) };
  }

  const hash = await sha256(text);
  store.save({
    ...baseline,
    [conflict.path]: {
      local: hash,
      remote: hash,
      ...(conflict.kind === "tasks" ? {} : { baseText: text }),
    },
  });

  return { resolved: true, remaining: [], written: true };
}

async function loadCategories(root: string, io: SyncIo): Promise<Category[]> {
  const text = await io.readTextFile(categoriesPath(root));
  return text ? parseCategoriesMarkdown(text) : [];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
