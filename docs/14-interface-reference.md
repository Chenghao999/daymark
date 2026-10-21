# 14 · Interface Reference

> 中文摘要：这是代码的“契约手册”。领域类型、仓储函数、IPC 命令、权限、localStorage
> 键和日期格式都以此为准。任何签名或语义变化都必须同步更新本文件；破坏性变化
> 必须在提交说明里写清迁移方式。

This document is the single source of truth for every boundary that another
module, the desktop shell, or a future platform build depends on. Internal
helper functions are not listed.

## 1. Stability levels

| Level | Meaning | Examples |
|---|---|---|
| **Stable** | Changing it requires a migration or a coordinated update of all callers. | database schema, IPC command names, `Task` fields |
| **Internal** | Free to change if all call sites and tests are updated. | layout components, CSS class names |
| **Reserved** | Present in the schema or settings but not used yet. Do not rely on it. | `report_runs`, `source`, `external_uid`, `userName` |

## 2. Domain types (`src/domain/types.ts`)

### Unions

| Type | Values | Meaning |
|---|---|---|
| `TaskStatus` | `"backlog"` \| `"scheduled"` \| `"done"` | Derived from dates, except `done` which is explicit. |
| `TaskSource` | `"local"` \| `"caldav"` | Reserved for CalDAV import. Everything created today is `local`. |
| `NumberingStyle` | `"chinese"` \| `"arabic"` \| `"alpha"` | Report section prefix. |
| `ReportKind` | `"daily"` \| `"weekly"` \| `"monthly"` | Report period. |
| `AppLanguage` | `"en"` \| `"zh-CN"` | UI language. |

### `Category`

| Field | Type | Contract |
|---|---|---|
| `id` | `string` | UUID v4, generated on creation. |
| `nameEn` | `string` | Non-empty. |
| `nameZh` | `string` | Non-empty. |
| `color` | `string` | `#rrggbb`. |
| `sortOrder` | `number` | Ascending report order; uncategorized is always last. |
| `archived` | `boolean` | Archived categories are hidden from pickers and settings. |

### `Task`

| Field | Type | Contract |
|---|---|---|
| `id` | `string` | UUID v4. |
| `title` | `string` | Required by the editor; SQL column is `NOT NULL`. |
| `notes` | `string` | `""` when absent. |
| `categoryId` | `string \| null` | `null` = uncategorized. |
| `status` | `TaskStatus` | See §12 state rules. |
| `startAt` | `string \| null` | Local wall-clock `YYYY-MM-DDTHH:mm`, or `YYYY-MM-DD` when `allDay`. |
| `endAt` | `string \| null` | Local wall-clock; `null` for all-day tasks. |
| `dueAt` | `string \| null` | Date-only `YYYY-MM-DD`, or a datetime string when set by code. |
| `priority` | `number` | `0` normal, `1` low, `2` high, `3` urgent. |
| `allDay` | `boolean` | Hides the end-time field and truncates the start to a date. |
| `createdAt` | `string` | UTC ISO 8601 with `Z`. |
| `updatedAt` | `string` | UTC ISO 8601 with `Z`. |
| `deviceId` | `string` | Identity of the writer, from localStorage. |
| `rowVersion` | `number` | Starts at 1, incremented by the repository on every write. |
| `deleted` | `boolean` | Soft-delete flag; deleted tasks are never listed. |
| `source` | `TaskSource` | Reserved. |
| `externalUid` | `string \| null` | Reserved for CalDAV. |

### `Completion`

| Field | Type | Contract |
|---|---|---|
| `id` | `string` | UUID v4. |
| `taskId` | `string` | References `tasks.id`. |
| `completedAt` | `string` | UTC ISO 8601. |
| `deviceId` | `string` | Device that recorded the completion. |

### Report types

`ReportItem { taskId, text, date, completed }`,
`ReportSection { categoryId, categoryName, heading, items }`,
`ReportDocument { kind, title, periodLabel, generatedAt, sections,
completedCount, scheduledCount }`.

## 3. Domain functions (`src/domain/`)

All domain functions are pure: same input → same output, no I/O, no clock other
than the explicitly documented defaults.

### `tasks.ts`

```ts
hasSchedule(task: Pick<Task, "startAt" | "dueAt">): boolean
normalizeStatus(task: Task): TaskStatus
scheduleTask(task: Task, startAt: string, endAt: string | null): Task
unscheduleTask(task: Task): Task
completeTask(task: Task, completedAt?: string): Task
reopenTask(task: Task): Task
sortTasks(tasks: Task[]): Task[]
```

| Function | Behaviour |
|---|---|
| `hasSchedule` | `true` when `startAt` or `dueAt` is set. |
| `normalizeStatus` | `done` stays `done`; otherwise `scheduled` with a date, `backlog` without. |
| `scheduleTask` | Sets start/end, status `scheduled`, bumps `rowVersion`, stamps `updatedAt`. |
| `unscheduleTask` | Clears start/end/due, status `backlog`, bumps version. |
| `completeTask` | Sets `done`; keeps dates so reports can attribute the task to a period. |
| `reopenTask` | Back to `scheduled`/`backlog` depending on dates. |
| `sortTasks` | Done last; then by start/due key; then priority descending. |

`sortTasks` is available to callers but the current UI relies on the SQL order
from `listTasks`; keep the two orders compatible when changing either.

### `reports.ts`

```ts
generateReport(input: ReportInput): ReportDocument
reportPeriod(kind: ReportKind, anchor: Date): ReportPeriod
reportTitle(kind: ReportKind, language: "en" | "zh-CN"): string
uncategorizedLabel(language: "en" | "zh-CN"): string
```

`ReportPeriod` is `{ start: Date; end: Date }`. `reportPeriod` is the canonical
period calculation: daily spans the whole local day, weekly runs Monday 00:00 to
Sunday 23:59:59.999, monthly covers the calendar month. `ReportInput.periodStart`
and `periodEnd` must already lie inside the period; `generateReport` expands them
to whole local days before filtering.

`ReportInput`:

```ts
{
  kind: ReportKind;
  language: "en" | "zh-CN";
  periodLabel: string;
  periodStart: Date;   // local date inside the period
  periodEnd: Date;     // local date inside the period, inclusive
  numbering: NumberingStyle;
  categories: Category[];
  tasks: Task[];
  completions: Completion[];
  generatedAt?: Date;  // defaults to now
}
```

Rules:

1. The period is expanded to whole local days (`00:00:00.000`–`23:59:59.999`).
2. A task counts as **completed** when it has at least one completion inside the
   period and `deleted = 0`. The first such completion supplies the item date,
   rendered as the **local** calendar date of that UTC timestamp.
3. A task counts as **planned** when it is not `done`, is not deleted, has no
   completion in the period, and `startAt ?? dueAt` falls inside the period.
4. A task appears at most once per report.
5. Sections follow `Category.sortOrder`; uncategorized is last.
6. Items inside a section sort by date string ascending.
7. `heading` is produced by `formatHeading(index, numbering)`.

### `numbering.ts`

```ts
chineseNumber(value: number): string   // 1..99 → 一..九十九, fallback digits
alphaNumber(value: number): string     // 1.. → A..Z, AA..AZ, BA..
formatHeading(index: number, style: NumberingStyle): string
```

`formatHeading` uses 0-based `index`:

| Style | Output for index 0 / 1 |
|---|---|
| `chinese` | `一、` / `二、` |
| `arabic` | `1. ` / `2. ` |
| `alpha` | `A. ` / `B. ` |

## 4. Database client (`src/db/client.ts`)

```ts
deviceId(): string
openDatabase(filePath: string): Promise<Database>
closeDatabase(): Promise<void>
getDb(): Database
getDbPath(): string | null
```

| Function | Contract |
|---|---|
| `deviceId` | Reads/creates `localStorage["daymark.deviceId"]`; returns `"unknown-device"` if storage is unavailable. |
| `openDatabase` | Closes any open database; loads `sqlite:<filePath>`; runs every `SCHEMA` statement; seeds the four default categories only when the table is empty. Throws on failure. |
| `closeDatabase` | Safe to call when already closed; swallows close errors. |
| `getDb` | Throws `Error("Database is not open")` if called before a successful open. |
| `getDbPath` | Path of the currently open file, or `null`. |

Only one database can be open per window. Opening a second path implicitly
closes the first.

## 5. Repository (`src/db/repository.ts`)

Every write calls `touchSyncMeta()`, which upserts `last_write_device` and
`last_write_at`. This is what makes the conflict banner meaningful.

```ts
listTasks(): Promise<Task[]>
listCategories(includeArchived?: boolean): Promise<Category[]>
createTask(input: NewTaskInput): Promise<Task>
updateTask(task: Task): Promise<void>
softDeleteTask(id: string): Promise<void>
completeTask(task: Task, completedAt?: string): Promise<void>
reopenTask(task: Task): Promise<void>
listCompletions(fromIso: string, toIso: string): Promise<Completion[]>
createCategory(nameEn: string, nameZh: string, color: string): Promise<void>
archiveCategory(id: string): Promise<void>
getSyncMeta(key: string): Promise<string | null>
```

| Function | SQL effect | Notes |
|---|---|---|
| `listTasks` | `SELECT ... WHERE deleted = 0` | Order: undated first, then start, then priority. |
| `listCategories` | `SELECT ... WHERE archived = 0` unless `includeArchived` | Ordered by sort order then English name. |
| `createTask` | `INSERT` | Generates UUID and timestamps; status derived from dates; `rowVersion = 1`. |
| `updateTask` | `UPDATE` by `id` | Increments `row_version`; caller supplies every editable field. |
| `softDeleteTask` | `UPDATE deleted = 1` | Completions are kept. |
| `completeTask` | `UPDATE status = 'done'` + `INSERT task_completions` | One completion row per call. |
| `reopenTask` | `UPDATE status` + `DELETE` completions for the task | **History is removed**; see §12. |
| `listCompletions` | `SELECT ... WHERE completed_at BETWEEN ? AND ?` | Both bounds are ISO strings, inclusive. |
| `createCategory` | `INSERT`, `sort_order = COUNT(*)` | New category appends. |
| `archiveCategory` | `UPDATE archived = 1` | Tasks keep their `category_id`. |
| `getSyncMeta` | `SELECT value` | Used for diagnostics; the scanner itself reads mtime. |

`NewTaskInput`: `{ title, notes?, categoryId?, startAt?, endAt?, dueAt?,
priority?, allDay? }`.

## 6. Settings (`src/settings/store.ts`)

```ts
interface AppSettings {
  language: AppLanguage;      // default "zh-CN"
  dataDir: string;            // absolute folder; "" until onboarding
  dbFileName: string;         // default "daymark.db"
  scanIntervalSec: number;    // default 60, UI offers 30/60/300
  numbering: NumberingStyle;  // default "chinese"
  userName: string;           // reserved, currently unused
}

loadSettings(): AppSettings
saveSettings(settings: AppSettings): void
databasePath(settings: AppSettings): string
```

- `loadSettings` merges stored JSON over defaults and falls back to defaults on
  malformed JSON or blocked storage.
- `saveSettings` never throws; a storage failure must not crash the app.
- `databasePath` trims trailing slashes from `dataDir` and appends
  `/<dbFileName>`.

## 7. Sync scanner (`src/sync/scanner.ts`)

```ts
interface FileScannerOptions {
  filePath: string;
  intervalMs: number;                            // minimum effective 1 s
  onExternalChange: (mtimeMs: number) => void;
}

interface FileScanner {
  stop(): void;
  touch(): Promise<void>;
}

startFileScanner(options: FileScannerOptions): FileScanner
```

Contract:

1. The first successful read establishes the baseline and does **not** fire.
2. Any later mtime different from the baseline fires `onExternalChange` once
   and updates the baseline.
3. Daymark calls `touch()` after its own writes; this re-baselines without
   firing.
4. A missing file or IPC error is ignored (treated as "not created yet"). It
   does not clear the baseline.
5. Ticks never overlap (`inFlight` guard).
6. `stop()` is idempotent and clears the interval.

The scanner detects change, not authorship. `last_write_device` is what tells
the UI the change came from another device.

## 8. Tauri IPC commands (`src-tauri/src/lib.rs`)

Both commands are registered in `generate_handler![file_mtime_ms,
write_file_bytes]`.

### `file_mtime_ms`

| Item | Value |
|---|---|
| Request | `{ path: string }` |
| Response | `number \| null` — milliseconds since Unix epoch |
| Errors | Never returns an error; a missing/unreadable file yields `null` |
| Called by | `src/sync/scanner.ts` |

### `write_file_bytes`

| Item | Value |
|---|---|
| Request | `{ path: string, contents: number[] }` (byte array) |
| Response | `null` on success |
| Errors | `string` from the OS (permission denied, path missing, rename failed) |
| Side effect | Writes `<path>.tmp`, then renames over `<path>`; removes the temp file if the rename fails |
| Called by | `src/features/reports/exportDocx.ts` |

The atomic rename is deliberate: a cloud-sync client must never upload a
half-written DOCX.

## 9. Capabilities and permissions

`src-tauri/capabilities/default.json` grants, for window `main`:

| Permission | Why it is required |
|---|---|
| `core:default` | Tauri core APIs used by the WebView. |
| `opener:default` | Registered opener plugin; reserved for opening files/folders. |
| `dialog:default` | Folder picker (`open`) and export path picker (`save`). |
| `sql:default` | `load`, `select`, `close` for the SQLite plugin. |
| `sql:allow-execute` | **Required for every write** (`execute`: CREATE/INSERT/UPDATE/DELETE). Without it task creation fails at runtime. |

Rules:

- Adding a plugin requires both a Rust dependency and a permission entry.
- Changing capabilities requires a rebuild before the generated schema reflects
  it.
- Never widen permissions to `"*"`; list the smallest set that works.

## 10. Dialogs and plugins used by the frontend

| API | Location | Purpose |
|---|---|---|
| `open({ directory: true, multiple: false })` | `App.tsx` | Choose the data folder. |
| `save({ defaultPath, filters })` | `exportDocx.ts` | Choose the DOCX output path; `null` means cancelled. |
| `invoke("file_mtime_ms")` | `scanner.ts` | mtime polling. |
| `invoke("write_file_bytes")` | `exportDocx.ts` | Atomic binary write. |
| `Database.load/select/execute/close` | `db/client.ts`, `db/repository.ts` | All SQLite access. |

## 11. Browser storage keys

| Key | Written by | Content | Synced? |
|---|---|---|---|
| `daymark.settings.v1` | `settings/store.ts` | JSON `AppSettings` | No — device-local |
| `daymark.deviceId` | `db/client.ts` | UUID string | No — device-local |

Clearing site data resets the device ID and the chosen folder. The database file
itself is unaffected.

## 12. Data format and state contracts

### Dates

| Kind | Format | Example |
|---|---|---|
| Task schedule | local wall-clock | `2026-10-21T09:00` |
| All-day start / due date | local date | `2026-10-21` |
| Audit timestamps | UTC ISO with `Z` | `2026-10-21T01:00:00.000Z` |
| Report period label | local date range | `2026-10-19 ~ 2026-10-25` |

Date-only values are interpreted as **local** dates when comparing periods.
When constructing a `Date` from a date-only task field, append `T00:00:00`
rather than relying on the JavaScript UTC interpretation.

### Task state

```
no startAt and no dueAt       → backlog
startAt or dueAt present      → scheduled
explicit completion           → done  (dates retained)
```

`done` is the only sticky state. Reopening returns to `scheduled` or `backlog`
based on dates. The UI and the repository must derive status the same way; if
one changes, change both and add a test.

### Completion history

- Completing inserts one row per completion.
- Reopening a task **deletes all completion rows for that task**. This is
  intentional in 0.1.0 so a reopened task leaves the report, but it also erases
  earlier completion dates. Treat it as a known limitation until P1 adds
  reversible history.

### Archived categories

`listCategories()` hides archived rows. A task that still points at an archived
category keeps the id, but report generation cannot resolve its name, so the
task is rendered under **Uncategorized**. Re-categorize tasks before archiving a
category if that matters.

## 13. Change checklist

Before merging a change that touches this document:

- [ ] All callers are updated (TypeScript will usually catch this).
- [ ] Tests cover the new behaviour or the changed invariant.
- [ ] A schema change is additive, or has a versioned migration and a backup.
- [ ] New IPC commands are registered and permitted.
- [ ] New UI strings exist in both locale files.
- [ ] This document and `13-repository-map.md` are updated in the same commit.
