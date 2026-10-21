import Database from "@tauri-apps/plugin-sql";
import { DEFAULT_CATEGORIES, SCHEMA } from "./schema";

let database: Database | null = null;
let currentPath: string | null = null;

export function deviceId(): string {
  const key = "daymark.deviceId";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return "unknown-device";
  }
}

export async function openDatabase(filePath: string): Promise<Database> {
  await closeDatabase();
  const db = await Database.load(`sqlite:${filePath}`);
  for (const statement of SCHEMA) {
    await db.execute(statement);
  }
  database = db;
  currentPath = filePath;
  await seedCategories(db);
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (database) {
    await database.close().catch(() => undefined);
    database = null;
    currentPath = null;
  }
}

export function getDb(): Database {
  if (!database) throw new Error("Database is not open");
  return database;
}

export function getDbPath(): string | null {
  return currentPath;
}

async function seedCategories(db: Database): Promise<void> {
  const rows = await db.select<Array<{ n: number }>>("SELECT COUNT(*) AS n FROM categories");
  if ((rows[0]?.n ?? 0) > 0) return;
  for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
    await db.execute(
      "INSERT INTO categories (id, name_en, name_zh, color, sort_order, archived) VALUES ($1, $2, $3, $4, $5, 0)",
      [crypto.randomUUID(), category.nameEn, category.nameZh, category.color, index],
    );
  }
  await db.execute(
    "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_write_device', $1)",
    [deviceId()],
  );
}
