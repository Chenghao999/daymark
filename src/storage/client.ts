import type { Category } from "../domain/types";
import { createDirAll, listDir, pathExists, readTextFile, writeTextFile } from "./fs";
import { DEFAULT_CATEGORIES } from "./defaults";
import { migrateLegacyDatabase } from "./migrate";
import {
  isDayFile,
  isMonthFolder,
  dateKeyOfFile,
  dayFilePath,
  legacyDbPath,
  backlogPath,
  categoriesPath,
  extrasKey,
} from "./paths";
import { parseCategoriesMarkdown, parseMarkdown, serializeCategoriesMarkdown } from "./markdown";
import { tombstoneMap, tombstonesFromExtras, withoutTombstoned } from "./tombstone";
import type { StoreState, StoredTask } from "./types";

let current: StoreState | null = null;

/** Alias kept for callers that import `deviceId` from the client. */
export { deviceId } from "./device";

export async function openStore(rawRoot: string): Promise<void> {
  closeStore();
  const root = normalizeRoot(rawRoot);
  await createDirAll(root);

  if (!(await pathExists(categoriesPath(root)))) {
    if (await pathExists(legacyDbPath(root))) {
      await migrateLegacyDatabase(root);
    } else {
      await seedCategories(root);
    }
  }

  const categoriesText = (await readTextFile(categoriesPath(root))) ?? "";
  const categories = parseCategoriesMarkdown(categoriesText);

  const tasks = new Map<string, StoredTask>();
  const extrasByDate = new Map<string, string[]>();

  // Load first, index second: a tombstone in one file must be able to suppress
  // the same task's line in another file (a task deleted on one device and
  // moved by another).
  const files: LoadedFile[] = [await loadFile(root, null, categories)];
  const rootEntries = await listDir(root).catch(() => []);
  for (const entry of rootEntries) {
    if (!entry.isDirectory || !isMonthFolder(entry.name)) continue;
    const monthPath = `${root}/${entry.name}`;
    const filesInMonth = await listDir(monthPath).catch(() => []);
    for (const file of filesInMonth) {
      if (file.isDirectory || !isDayFile(file.name)) continue;
      files.push(await loadFile(root, dateKeyOfFile(file.name), categories));
    }
  }

  const tombstones = tombstoneMap(
    files.flatMap((file) => tombstonesFromExtras(file.extras)),
  );
  for (const file of files) {
    extrasByDate.set(extrasKey(file.dateKey), file.extras);
    for (const stored of withoutTombstoned(file.tasks, tombstones)) addTask(tasks, stored);
  }

  current = { root, categories, tasks, extrasByDate };
}

export function closeStore(): void {
  current = null;
}

export function getStoreState(): StoreState {
  if (!current) throw new Error("Store is not open");
  return current;
}

export function getStoreRoot(): string | null {
  return current?.root ?? null;
}

async function loadFile(
  root: string,
  dateKey: string | null,
  categories: Category[],
): Promise<LoadedFile> {
  const path = dateKey ? dayFilePath(root, dateKey) : backlogPath(root);
  const text = await readTextFile(path);
  if (text === null) return { dateKey, tasks: [], extras: [] };
  const parsed = parseMarkdown(text, dateKey, categories);
  return { dateKey, tasks: parsed.tasks, extras: parsed.extras };
}

interface LoadedFile {
  dateKey: string | null;
  tasks: StoredTask[];
  extras: string[];
}

function addTask(tasks: Map<string, StoredTask>, stored: StoredTask): void {
  const existing = tasks.get(stored.task.id);
  if (
    !existing ||
    stored.task.updatedAt > existing.task.updatedAt ||
    // On a tie, a dated file is more specific than the backlog copy that
    // may be left behind by an interrupted move.
    (stored.task.updatedAt === existing.task.updatedAt &&
      stored.dateKey !== null &&
      existing.dateKey === null)
  ) {
    tasks.set(stored.task.id, stored);
  }
}

async function seedCategories(root: string): Promise<void> {
  const categories: Category[] = DEFAULT_CATEGORIES.map((category, index) => ({
    id: crypto.randomUUID(),
    nameEn: category.nameEn,
    nameZh: category.nameZh,
    color: category.color,
    sortOrder: index,
    archived: false,
  }));
  await writeTextFile(categoriesPath(root), serializeCategoriesMarkdown(categories));
}

function normalizeRoot(root: string): string {
  const trimmed = root.replace(/\/+$/, "");
  return trimmed || "/";
}
