import { listDir, pathExists, readTextFile, writeTextFile } from "../../storage/fs";
import { loadBaseline, saveBaseline } from "./baseline";
import type { BaselineStore, SyncIo, WebDavConfig } from "./types";

/** Tauri-backed implementations; tests replace them through `SyncOptions`. */
export const REAL_SYNC_IO: SyncIo = { listDir, readTextFile, writeTextFile, pathExists };

export function baselineStore(
  config: Pick<WebDavConfig, "url" | "remotePath">,
): BaselineStore {
  return {
    load: () => loadBaseline(config),
    save: (baseline) => saveBaseline(config, baseline),
  };
}
