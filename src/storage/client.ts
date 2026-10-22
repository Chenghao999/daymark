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

  const backlog = await loadFile(root, null, categories, extrasByDate);
  for (const stored of backlog) addTask(tasks, stored);

  const rootEntries = await listDir(root).catch(() => []);
  for (const entry of rootEntries) {
    if (!entry.isDirectory || !isMonthFolder(entry.name)) continue;
    const monthPath = `${root}/${entry.name}`;
    const files = await listDir(monthPath).catch(() => []);
    for (const file of files) {
      if (file.isDirectory || !isDayFile(file.name)) continue;
      const dateKey = dateKeyOfFile(file.name);
      const storedTasks = await loadFile(root, dateKey, categories, extrasByDate);
      for (const stored of storedTasks) addTask(tasks, stored);
    }
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
  extrasByDate: Map<string, string[]>,
): Promise<StoredTask[]> {
  const path = dateKey ? dayFilePath(root, dateKey) : backlogPath(root);
  const text = await readTextFile(path);
  if (text === null) {
    extrasByDate.set(extrasKey(dateKey), []);
    return [];
  }
  const parsed = parseMarkdown(text, dateKey, categories);
  extrasByDate.set(extrasKey(dateKey), parsed.extras);
  return parsed.tasks;
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
