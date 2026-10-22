import { listDir, readTextFile } from "../../storage/fs";
import {
  BACKLOG_FILE,
  CATEGORIES_FILE,
  SETTINGS_FILE,
  isDayFile,
  isMonthFolder,
} from "../../storage/paths";

/** Root files the app treats as data. Conflict copies are deliberately absent. */
const ROOT_FILES = new Set([SETTINGS_FILE, CATEGORIES_FILE, BACKLOG_FILE]);

export interface ManifestIo {
  listDir(path: string): Promise<{ name: string; isDirectory: boolean }[]>;
  readTextFile(path: string): Promise<string | null>;
}

export interface LocalManifest {
  /** Relative path → SHA-256 of the exact text that will be uploaded. */
  hashes: Map<string, string>;
  /** Relative path → text, reused by the upload step. */
  texts: Map<string, string>;
}

const REAL_IO: ManifestIo = { listDir, readTextFile };

/** Hex SHA-256 over the UTF-8 bytes of `text`. */
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Reads the files Daymark treats as data: `_*.md` at the root and
 * `YYYY-MM-DD.md` inside `YYYY-MM/`. Hand-written extras are part of the hash,
 * so any edit triggers a sync.
 */
export async function localManifest(
  root: string,
  io: ManifestIo = REAL_IO,
): Promise<LocalManifest> {
  const hashes = new Map<string, string>();
  const texts = new Map<string, string>();

  const rootEntries = await io.listDir(root).catch(() => []);
  for (const entry of rootEntries) {
    if (entry.isDirectory || !isRootFile(entry.name)) continue;
    await add(root, entry.name, io, hashes, texts);
  }

  for (const entry of rootEntries) {
    if (!entry.isDirectory || !isMonthFolder(entry.name)) continue;
    const monthDir = `${root}/${entry.name}`;
    const files = await io.listDir(monthDir).catch(() => []);
    for (const file of files) {
      if (file.isDirectory || !isDayFile(file.name)) continue;
      await add(monthDir, file.name, io, hashes, texts, entry.name);
    }
  }

  return { hashes, texts };
}

async function add(
  directory: string,
  name: string,
  io: ManifestIo,
  hashes: Map<string, string>,
  texts: Map<string, string>,
  prefix?: string,
): Promise<void> {
  const text = await io.readTextFile(`${directory}/${name}`);
  if (text === null) return;
  const relative = prefix ? `${prefix}/${name}` : name;
  texts.set(relative, text);
  hashes.set(relative, await sha256(text));
}

function isRootFile(name: string): boolean {
  return ROOT_FILES.has(name);
}
