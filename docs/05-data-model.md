# 05 · Data Model and Storage

> 中文摘要：定义 SQLite 表结构、字段、索引、UUID 规则和迁移策略。跨设备记录的
> 主键必须使用 UUID，避免自增 ID 在两端碰撞。

## 1. Conventions

- All primary keys are UUID v4 strings generated on the device that creates the
  row. Never use auto-increment IDs for shared data.
- Timestamps are ISO 8601 strings. Task schedule fields are local wall-clock
  (`YYYY-MM-DDTHH:mm`); audit fields (`created_at`, `updated_at`,
  `completed_at`) are UTC (`...Z`).
- Booleans are `INTEGER` 0/1.
- Deletion is soft (`deleted = 1`) for tasks; categories are `archived`.

## 2. Tables

### categories

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| name_en | TEXT | never empty |
| name_zh | TEXT | never empty |
| color | TEXT | `#rrggbb` |
| sort_order | INTEGER | report ordering |
| archived | INTEGER | 0/1 |

### tasks

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| title | TEXT | required |
| notes | TEXT | default `''` |
| category_id | TEXT | nullable → uncategorized |
| status | TEXT | `backlog` / `scheduled` / `done` |
| start_at | TEXT | local wall-clock or null |
| end_at | TEXT | local wall-clock or null |
| due_at | TEXT | date or null |
| priority | INTEGER | 0 normal, 1 low, 2 high, 3 urgent |
| all_day | INTEGER | 0/1 |
| created_at | TEXT | UTC ISO |
| updated_at | TEXT | UTC ISO |
| device_id | TEXT | writer identity |
| row_version | INTEGER | increments on every local write |
| deleted | INTEGER | soft delete flag |
| source | TEXT | `local` or `caldav` |
| external_uid | TEXT | CalDAV UID when imported |

Indexes: `start_at`, `category_id`.

### task_completions

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| task_id | TEXT | references tasks.id |
| completed_at | TEXT | UTC ISO |
| device_id | TEXT | who completed it |

Indexes: `task_id`, `completed_at`.

A task may in principle have several completion rows (one per completion
cycle); reports count the task once per period, using the earliest completion
inside that period.

### sync_meta

Key/value pairs: `last_write_device`, `last_write_at`, and later `schema_version`.

### report_runs

Optional audit trail of generated reports: `id`, `kind`, `period_start`,
`period_end`, `generated_at`, `output_path`.

## 3. Migrations

- `SCHEMA` is applied idempotently (`CREATE TABLE IF NOT EXISTS`) on every open.
- Additive changes are safe to append.
- Destructive changes must bump `PRAGMA user_version` and run a versioned
  migration before the app reads data. A backup copy of the database is written
  next to the original before any destructive migration.
- Downgrades are not supported; the app refuses to open a database whose user
  version is newer than the build.

## 4. Integrity rules

- `status` is derived from dates except when `done`; the UI never produces an
  impossible combination, and the domain normalizer fixes one if it appears.
- `category_id` pointing at an archived category still resolves for display.
- Deleting a task does not delete its completions; reports filter by the task's
  `deleted` flag.
