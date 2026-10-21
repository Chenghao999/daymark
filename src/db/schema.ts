export const SCHEMA_VERSION = 1;

/**
 * Applied idempotently on every open, so a database file created by an older
 * build keeps working after an upgrade. Destructive migrations must be
 * versioned through `PRAGMA user_version` before they are added here.
 */
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_zh TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6b7cff',
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    category_id TEXT,
    status TEXT NOT NULL DEFAULT 'backlog',
    start_at TEXT,
    end_at TEXT,
    due_at TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    all_day INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    device_id TEXT NOT NULL,
    row_version INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'local',
    external_uid TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_start ON tasks(start_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category_id)`,
  `CREATE TABLE IF NOT EXISTS task_completions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    device_id TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_completions_task ON task_completions(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_completions_date ON task_completions(completed_at)`,
  `CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS report_runs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    output_path TEXT
  )`,
];

interface SeedCategory {
  nameEn: string;
  nameZh: string;
  color: string;
}

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { nameEn: "Project work", nameZh: "项目开发", color: "#5b8def" },
  { nameEn: "Meetings", nameZh: "会议沟通", color: "#e0a03a" },
  { nameEn: "Administration", nameZh: "行政事务", color: "#7f8c9a" },
  { nameEn: "Learning", nameZh: "学习成长", color: "#4bb37a" },
];
