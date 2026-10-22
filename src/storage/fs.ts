import { invoke } from "@tauri-apps/api/core";

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface TreeSignature {
  fileCount: number;
  latestMtimeMs: number | null;
  /** Hash of every Markdown file's path, size and mtime. */
  fingerprint: string;
}

export function readTextFile(path: string): Promise<string | null> {
  return invoke<string | null>("read_text_file", { path });
}

export function writeTextFile(path: string, contents: string): Promise<void> {
  return invoke("write_text_file", { path, contents });
}

export function createDirAll(path: string): Promise<void> {
  return invoke("create_dir_all", { path });
}

export function listDir(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("list_dir", { path });
}

export function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

export function removeFile(path: string): Promise<void> {
  return invoke("remove_file", { path });
}

export function renamePath(from: string, to: string): Promise<void> {
  return invoke("rename_path", { from, to });
}

export function treeSignature(root: string): Promise<TreeSignature> {
  return invoke<TreeSignature>("tree_signature", { root });
}
