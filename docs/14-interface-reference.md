# 14 · Interface Reference

> 中文摘要：这是代码的“契约手册”。领域类型、存储模块、IPC 命令、权限、
> localStorage 键和文件格式都以此为准。任何签名或语义变化都必须同步更新本文件；
> 破坏性变化必须在提交说明里写清迁移方式。

This document is the single source of truth for every boundary that another
module, the desktop shell, or a future platform build depends on. Internal
helper functions are not listed.

Every module is consumed as an interface: callers import the exported functions
and types below, never the module's private helpers, and never assumptions about
its internal state. That is what lets a module be stubbed in a test, exercised
alone while debugging, or replaced behind the same signature. The caller map and
the debugging rule are in doc 18 §4.1.

> 中文摘要补充：每个模块都以“接口调用”的方式被使用——调用方只依赖导出的函数签名和
> 类型，不依赖内部实现或文件布局。因此单层可以独立测试、单独调试，也可以在保持签名
> 不变的前提下替换实现。调用关系见文档 18 §4.1。

## 1. Stability levels

| Level | Meaning | Examples |
|---|---|---|
| **Stable** | Changing it requires a migration or a coordinated update of all callers. | Markdown file format, IPC command names, `Task` fields |
| **Internal** | Free to change if all call sites and tests are updated. | layout components, CSS class names |
| **Reserved** | Present in the format or settings but not used yet. Do not rely on it. | `source`, `externalUid`, `userName` |

## 2. Domain types (`src/domain/types.ts`)

### Unions

| Type | Values | Meaning |
|---|---|---|
| `TaskStatus` | `"backlog"` \| `"scheduled"` \| `"done"` | Derived from dates, except `done` which is explicit. |
| `TaskSource` | `"local"` \| `"caldav"` | Reserved for CalDAV import. Everything created today is `local`. |
| `NumberingStyle` | `"chinese"` \| `"arabic"` \| `"alpha"` | Report section prefix. |
| `ReportKind` | `"daily"` \| `"weekly"` \| `"monthly"` \| `"yearly"` | Report period. |
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
| `title` | `string` | Required by the editor. |
| `notes` | `string` | `""` when absent. |
| `categoryId` | `string \| null` | `null` = uncategorized. |
| `status` | `TaskStatus` | See §17 state rules. |
| `startAt` | `string \| null` | Local wall-clock `YYYY-MM-DDTHH:mm`, or `YYYY-MM-DD` when `allDay`. |
| `endAt` | `string \| null` | Local wall-clock; `null` for open-ended tasks. |
| `dueAt` | `string \| null` | Date-only `YYYY-MM-DD`, or a datetime string when set by code. |
| `priority` | `number` | `0` normal, `1` low, `2` high, `3` urgent. |
| `allDay` | `boolean` | Hides the end-time field and truncates the start to a date. |
| `createdAt` | `string` | UTC ISO 8601 with `Z`. |
| `updatedAt` | `string` | UTC ISO 8601 with `Z`. |
| `deviceId` | `string` | Identity of the writer, from localStorage. |
| `rowVersion` | `number` | Starts at 1, incremented by the repository on every write. |
| `deleted` | `boolean` | Always `false` in the store; kept for type compatibility with the migration. |
| `source` | `TaskSource` | Reserved. |
| `externalUid` | `string \| null` | Reserved for CalDAV. |

### `Completion`

| Field | Type | Contract |
|---|---|---|
| `id` | `string` | UUID v4. |
| `taskId` | `string` | References the task id. |
| `completedAt` | `string` | UTC ISO 8601. |
| `deviceId` | `string` | Device that recorded the completion. |

### Report types

`ReportItem { taskId: string | null, text, date, completed }`,
`ReportSection { categoryId, categoryName, heading, items }`,
`ReportDocument { kind, title, periodLabel, generatedAt, sections,
completedCount, scheduledCount }`.

## 3. Domain functions (`src/domain/`)

All domain functions are pure: same input → same output, no I/O, no clock other
than the explicitly documented defaults.

### `tasks.ts`

```ts
interface NewTaskInput {
  title: string; notes?: string; categoryId?: string | null;
  startAt?: string | null; endAt?: string | null; dueAt?: string | null;
  priority?: number; allDay?: boolean;
}
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

### `periods.ts`

```ts
interface ReportPeriod { start: Date; end: Date }

interface PeriodOptions {
  weekStartsOn?: 0 | 1;              // default 1 (Monday)
  assessmentMonthStartDay?: number;  // default 1, clamped to 1-28
  assessmentYearStartMonth?: number; // default 1, clamped to 1-12
}

reportPeriod(kind: ReportKind, anchor: Date, options?: PeriodOptions): ReportPeriod
```

`reportPeriod` is the canonical period calculation and is used by the calendar,
the report view and the exporter:

| Kind | Window |
|---|---|
| `daily` | The whole local day of `anchor`. |
| `weekly` | Seven local days starting on the configured first day of the week. |
| `monthly` | From `assessmentMonthStartDay` of the containing assessment month through the day before the next one; `26` means the 26th through the 25th. |
| `yearly` | Twelve assessment months starting at `assessmentYearStartMonth`, using the same start day. |

Every window is expressed inclusive (`00:00:00.000` to `23:59:59.999`).

### `reports.ts`

```ts
generateReport(input: ReportInput): ReportDocument
reportPeriod(kind, anchor, options?): ReportPeriod   // re-exported from periods.ts
reportTitle(kind: ReportKind, language: "en" | "zh-CN"): string
uncategorizedLabel(language: "en" | "zh-CN"): string
export type { PeriodOptions, ReportPeriod }
```

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
2. A task counts as **completed** when it has a completion inside the period.
   That completion supplies the item date, rendered as the **local** calendar
   date of the UTC timestamp.
3. A task counts as **planned** when it is not `done`, has no completion in the
   period, and `startAt ?? dueAt` falls inside the period.
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

## 4. Storage types and paths (`src/storage/types.ts`, `paths.ts`)

```ts
interface StoredTask {
  task: Task;
  completion: Completion | null;
  dateKey: string | null;   // "YYYY-MM-DD", null for the backlog
}

interface StoreState {
  root: string;
  categories: Category[];
  tasks: Map<string, StoredTask>;
  extrasByDate: Map<string, string[]>;  // keyed by date key or BACKLOG_KEY
}

const BACKLOG_KEY = "backlog";
```

```ts
const SETTINGS_FILE  = "_settings.md";
const CATEGORIES_FILE = "_categories.md";
const BACKLOG_FILE   = "_backlog.md";
const LEGACY_DB_FILE = "daymark.db";

dateKeyOf(task: Pick<Task, "startAt" | "dueAt">): string | null
monthKey(dateKey: string): string          // "YYYY-MM"
monthDir(root: string, dateKey: string): string
dayFilePath(root: string, dateKey: string): string
backlogPath(root: string): string
categoriesPath(root: string): string
settingsPath(root: string): string
legacyDbPath(root: string): string
extrasKey(dateKey: string | null): string
isMonthFolder(name: string): boolean       // /^\d{4}-\d{2}$/
isDayFile(name: string): boolean           // /^\d{4}-\d{2}-\d{2}\.md$/
dateKeyOfFile(name: string): string        // first 10 characters
```

`dateKeyOf` is the filing rule: start date, else due date, else `null`
(backlog).

## 5. File-system wrappers (`src/storage/fs.ts`)

Every function is a thin typed `invoke` wrapper; no caching.

```ts
interface DirEntry { name: string; isDirectory: boolean }
interface TreeSignature {
  fileCount: number;
  latestMtimeMs: number | null;
  fingerprint: string;
}

readTextFile(path: string): Promise<string | null>   // null when missing
writeTextFile(path: string, contents: string): Promise<void>
createDirAll(path: string): Promise<void>
listDir(path: string): Promise<DirEntry[]>           // sorted by name
pathExists(path: string): Promise<boolean>
removeFile(path: string): Promise<void>              // missing file is a no-op
renamePath(from: string, to: string): Promise<void>
treeSignature(root: string): Promise<TreeSignature>
```

## 6. Store client (`src/storage/client.ts`)

```ts
openStore(rawRoot: string): Promise<void>
closeStore(): void
getStoreState(): StoreState
getStoreRoot(): string | null
deviceId(): string            // re-exported from device.ts
```

| Function | Contract |
|---|---|
| `openStore` | Closes any open store; normalises the root (trailing slashes trimmed); creates the directory. If `_categories.md` is missing and `daymark.db` exists, runs the migration; otherwise seeds the four default categories. Then loads `_backlog.md` and every `YYYY-MM/*.md` day file up to depth 2 into memory. Throws on an unreadable root. |
| `closeStore` | Drops the in-memory state. Safe to call when already closed. |
| `getStoreState` | Throws `Error("Store is not open")` before a successful open. |
| `getStoreRoot` | Current root, or `null`. |

Only one store can be open per window. When the same task id appears in several
files, the entry with the later `updatedAt` wins.

## 7. Markdown codec (`src/storage/markdown.ts`)

```ts
interface ParsedMarkdown {
  tasks: StoredTask[];
  extras: string[];        // unrecognised non-empty lines
  updatedAt: string | null;
  deviceId: string | null;
}

parseCategoriesMarkdown(text: string): Category[]
serializeCategoriesMarkdown(categories: Category[]): string
parseMarkdown(text: string, dateKey: string | null, categories: Category[]): ParsedMarkdown
serializeMarkdown(
  dateKey: string | null,
  entries: StoredTask[],
  categories: Category[],
  extras: string[],
  meta: { updatedAt: string; deviceId: string },
): string
```

Behaviour:

- `parseCategoriesMarkdown` reads `- English / 中文 <!-- daymark {...} -->`
  lines. A missing id gets a new UUID; an invalid colour falls back to
  `#6b7cff`; a missing `sortOrder` uses the line index.
- `parseMarkdown` handles the file header comment, `## section`, `- [ ]` /
  `- [x]`, `HH:mm–HH:mm` prefixes, `  > note` lines and
  `<!-- daymark task {...} -->` comments. A hand-checked box without metadata
  receives `completedAt` = local noon of that date.
- `serializeMarkdown` groups entries by category (uncategorized last), sorts
  them, writes the file header, then every section, then the extras.
- A file title line (`# ...`) is regenerated and never treated as extras.

## 8. Repository (`src/storage/repository.ts`)

All mutations update the in-memory state and rewrite only the affected file(s).
Every write re-serialises the whole day file through `serializeMarkdown`, so
extras and hand-written ordering survive.

```ts
listTasks(): Promise<Task[]>
listCategories(includeArchived = false): Promise<Category[]>
createTask(input: NewTaskInput): Promise<Task>
updateTask(task: Task): Promise<void>
softDeleteTask(id: string): Promise<void>      // actually a hard delete
completeTask(task: Task, completedAt?: string): Promise<void>
reopenTask(task: Task): Promise<void>
listCompletions(fromIso: string, toIso: string): Promise<Completion[]>
createCategory(nameEn: string, nameZh: string, color: string): Promise<void>
archiveCategory(id: string): Promise<void>
```

| Function | File effect | Notes |
|---|---|---|
| `listTasks` | none | Sorted by `sortTasks`. |
| `listCategories` | none | Archived hidden unless `includeArchived`; sorted by `sortOrder`. |
| `createTask` | writes the file for `dateKeyOf(task)` | Generates UUID and timestamps; status derived from dates; `rowVersion = 1`. |
| `updateTask` | writes the new file and, if the date changed, the old one | Increments `rowVersion`; preserves the existing completion. |
| `softDeleteTask` | rewrites the task's file | **Hard delete** of the task and its completion, plus one `<!-- daymark deleted … -->` marker in that file's extras so a merge does not re-add it. Hand-written lines get no marker. The name is kept for call-site compatibility. |
| `completeTask` | rewrites the task's file | Sets `status = done`; writes `completedAt` + `completionId` into the metadata. |
| `reopenTask` | rewrites the task's file | Clears `completedAt` and `completionId`; status returns to scheduled/backlog. |
| `listCompletions` | none | Filters the in-memory completions by ISO range, inclusive. |
| `createCategory` | rewrites `_categories.md` | `sortOrder = current count`. |
| `archiveCategory` | rewrites `_categories.md` | `archived = true`; tasks keep their `categoryId`. |

`NewTaskInput` is defined once in `domain/tasks.ts` and re-exported here, so the
REPL, the editor and the repository share one shape. Task transitions
(`completeTask`, `reopenTask`, status normalisation) are delegated to
`domain/tasks.ts`; the repository only persists their result.

File lifecycle: a day file with no tasks and no extras is deleted on save; a
file holding a deletion marker counts as non-empty and stays. `_backlog.md` is
always written and never deleted.

### Deletion markers (`src/storage/tombstone.ts`)

```ts
interface Tombstone { id: string; deletedAt: string; deviceId: string }

tombstoneLine(tombstone: Tombstone): string
parseTombstone(line: string): Tombstone | null
tombstonesFromExtras(extras: string[]): Tombstone[]
tombstoneMap(tombstones: Tombstone[]): Map<string, Tombstone>
isTombstoned(updatedAt: string, tombstones: Map<string, Tombstone>, id: string): boolean
withoutTombstoned(tasks: StoredTask[], tombstones: Map<string, Tombstone>): StoredTask[]
```

- The marker is a comment line that `parseMarkdown` puts in `extras`, so it is
  preserved and serialized with the rest of the file.
- `tombstoneMap` keeps the later `deletedAt` per id.
- `isTombstoned` returns `true` when `updatedAt <= deletedAt`; an edit made
  after the deletion therefore survives a merge.
- `openStore` builds one map from every file before indexing tasks, so a marker
  in one file also hides a task line left in another.

## 9. Settings (`src/settings/store.ts`, `src/storage/settingsFile.ts`)

```ts
interface SyncedSettings {
  language: AppLanguage;              // default "en"
  weekStartsOn: 0 | 1;                // default 1 (Monday)
  assessmentMonthStartDay: number;    // default 1, clamped 1-28
  assessmentYearStartMonth: number;   // default 1, clamped 1-12
  numbering: NumberingStyle;          // default "chinese"
  scanIntervalSec: number;            // default 60, clamped 10-3600
  userName: string;                   // report signature; stored, not printed yet
}

interface AppSettings extends SyncedSettings {
  dataDir: string;                    // device-local, never written to the file
}

loadSettings(): AppSettings
saveSettings(settings: AppSettings): void
sanitize(settings: AppSettings): AppSettings
syncedPart(settings: AppSettings): SyncedSettings
```

```ts
serializeSettingsMarkdown(settings: AppSettings): string
parseSettingsMarkdown(text: string): SyncedSettings
loadSyncedSettings(root: string): Promise<SyncedSettings | null>
saveSyncedSettings(root: string, settings: AppSettings): Promise<void>
```

- `loadSettings` merges stored JSON over defaults and falls back to defaults on
  malformed JSON or blocked storage.
- `saveSettings` never throws; a storage failure must not crash the app.
- `parseSettingsMarkdown` prefers the `<!-- daymark settings {...} -->` JSON
  comment and fills any missing key from the `- key: value` bullets, then
  clamps the numeric values.
- `loadSyncedSettings` returns `null` when `_settings.md` is absent, which is
  what tells the app to create it.

## 10. Device identity (`src/storage/device.ts`)

```ts
deviceId(): string
```

Reads/creates `localStorage["daymark.deviceId"]`; returns `"unknown-device"`
when storage is unavailable.

## 11. Legacy migration (`src/storage/migrate.ts`)

```ts
migrateLegacyDatabase(root: string): Promise<boolean>
```

Reads `categories`, `tasks` (excluding soft-deleted rows) and
`task_completions` from `daymark.db` through `@tauri-apps/plugin-sql`, writes
one Markdown day file per date key, then `_backlog.md`, then `_categories.md`
as the commit marker, and finally renames the database to
`daymark.db.migrated-YYYYMMDD-HHmmss`. Returns `true` when it ran. A failed
rename is swallowed because the Markdown data is already written.

## 12. Sync scanner (`src/sync/scanner.ts`)

```ts
interface FolderScannerOptions {
  rootPath: string;
  intervalMs: number;                 // minimum effective 1 s
  onExternalChange: () => void;
}

interface FolderScanner {
  stop(): void;
  touch(): Promise<void>;
}

startFolderScanner(options: FolderScannerOptions): FolderScanner
```

Contract:

1. The first successful `tree_signature` read establishes the baseline and does
   **not** fire.
2. Any later difference in `fingerprint` fires `onExternalChange` once and
   updates the baseline. `fingerprint` hashes every Markdown file's path, size
   and mtime, so a replaced file with an unchanged mtime is still detected.
   `fileCount` and `latestMtimeMs` remain in the response for diagnostics.
3. Daymark calls `touch()` after its own writes; this re-baselines without
   firing.
4. An IPC error is ignored and does not clear the baseline.
5. Ticks never overlap (`inFlight` guard).
6. `stop()` is idempotent and clears the interval.

The scanner detects change, not authorship.

### WebDAV sync (`src/sync/webdav/`, `src/settings/webdav.ts`)

```ts
interface WebDavConfig {
  url: string;                        // server base, no trailing slash required
  remotePath: string;                 // normalised to "/…/"; default "/daymark/"
  username: string;
  password: string;                   // device-local only, never in _settings.md
}

normalizeRemotePath(path: string): string
remoteRootUrl(config: WebDavConfig): string
remoteFileUrl(config: WebDavConfig, path: string, directory?: boolean): string
relativeHref(href: string, rootUrl: string): string | null
parsePropfind(xml: string): { href, isDirectory, size, etag, lastModified }[]

class WebDavClient {
  constructor(config: WebDavConfig);
  test(): Promise<void>;
  list(path?: string): Promise<RemoteEntry[]>;
  listTree(): Promise<RemoteEntry[]>;
  getText(path: string): Promise<string>;
  mkcol(path?: string): Promise<void>;
  putText(path: string, text: string): Promise<void>;
}

sha256(text: string): Promise<string>
localManifest(root: string, io?: ManifestIo): Promise<{ hashes: Map<string,string>; texts: Map<string,string> }>
planSync(local: Map<string,string>, remote: Map<string,string>, baseline: Baseline): SyncPlan
syncWebDav(config: WebDavConfig, root: string, options?: SyncOptions): Promise<SyncResult>
resolveConflict(config: WebDavConfig, root: string, conflict: SyncConflict, decisions: MergeDecisions, options?: ResolveOptions): Promise<ResolveResult>

interface SyncResult {
  uploaded: number;
  downloaded: number;
  merged: number;                     // both sides changed, merge was clean
  unchanged: number;
  conflicts: SyncConflict[];          // paths still needing a decision
  errors: string[];
}

interface SyncConflict {
  path: string;                       // canonical path; its local copy is kept
  copy: string | null;                // relative path holding the remote text
  kind: "tasks" | "settings" | "categories";
  items: MergeConflict[];             // unordered items with their differing fields
}

interface ResolveOptions { now?: Date; device?: string }
interface ResolveResult { resolved: boolean; remaining: MergeConflict[]; written: boolean; error?: string }

// src/sync/merge/
mergeableDateKey(path: string): string | null | undefined
mergeTaskFile(localText: string, remoteText: string, options: MergeOptions): MergeOutcome
mergeSettingsFile(localText: string, remoteText: string, baseText: string | null, decisions?: MergeDecisions): MergeOutcome
mergeCategoriesFile(localText: string, remoteText: string, baseText: string | null, decisions?: MergeDecisions): MergeOutcome

interface MergeOptions { dateKey: string | null; categories: Category[]; deviceId: string; updatedAt: string; decisions?: MergeDecisions }
interface MergeDecisions { [id: string]: "local" | "remote" | "both" }
interface MergeOutcome { clean: boolean; text: string; conflicts: MergeConflict[]; itemCount: number }
interface MergeConflict { id: string; label: string; fields: string[]; local: string; remote: string }

loadWebDavSettings(): WebDavConfig
saveWebDavSettings(config: WebDavConfig): void
isWebDavConfigured(config: WebDavConfig): boolean
```

Contract:

1. `localManifest` includes only `_settings.md`, `_categories.md`,
   `_backlog.md` and `YYYY-MM/YYYY-MM-DD.md`. Conflict copies and hand-written
   extras are not uploaded.
2. `planSync` is pure and never deletes: unchanged hashes are skipped; a change
   on one side wins; changes on both sides become conflicts, as does a first
   sync where both sides already have the same path with different content.
3. `syncWebDav` reads both sides completely before writing anything. A remote
   read failure aborts the run with no writes.
4. On conflict, `syncWebDav` first tries a merge. A day or backlog file goes
   through `mergeTaskFile`; `_settings.md` and `_categories.md` go through
   `mergeSettingsFile` / `mergeCategoriesFile` with the baseline's `baseText` as
   the base. A clean merge rewrites the local file, uploads the same text,
   advances the baseline and counts it in `SyncResult.merged`. If the merge
   reports a conflict, the local file keeps its path and the remote text is
   written as `<name> (conflict <device8> <yyyyMMdd-HHmmss>).md`; the baseline
   entry is not advanced, so the next run reports the same conflict until it is
   resolved. The `SyncConflict` returned for the path names the copy and lists
   each item that no rule could order, each with a one-line summary of both
   sides. Every merge function is pure and returns
   `clean: false` with the local text untouched, so a caller can never write a
   partial merge. `mergeTaskFile` also applies the deletion markers found in
   either copy's extras: a task survives only when its `updatedAt` is later than
   the marker's `deletedAt`, one marker per id is kept, and a marker overruled
   by a newer edit is dropped.
5. `resolveConflict` re-reads the current local file and the conflict copy and
   re-runs the matching merge with the user's `decisions` (the choice is per
   item; `"both"` is honoured for tasks only). Only a clean result writes: the
   local file is replaced, the same text is uploaded, and the baseline advances,
   keeping `baseText` for settings and categories. The conflict copy is never
   deleted. `written` says whether the local file changed even when the upload
   failed, which is the caller's cue to reload the store.
6. `putText` writes `<path>.daymark-tmp` then `MOVE`s it over the target, and
   falls back to a direct `PUT` when the server answers 405/501.
7. `syncWebDav` does not touch React state; the caller reloads the store and
   calls `scanner.touch()` (or `reloadFromDisk()` when files were downloaded or
   a conflict was resolved).

### AI assistant (`src/ai/`, `src/settings/ai.ts`)

```ts
type AiProtocol = "anthropic" | "openai";

interface AiConfig {
  enabled: boolean;                   // opt-in; default false
  protocol: AiProtocol;               // /v1/messages or /v1/chat/completions
  apiKey: string;                     // device-local only
  model: string;                      // any non-empty name
  baseUrl: string;                    // "" = official endpoint
}

type AiFeature = "polish" | "review";

interface AiRequest {
  feature: AiFeature;
  language: "en" | "zh-CN";
  report: ReportDocument;
  userName: string;
}

interface AiPrompt { system: string; user: string }
interface AiUsage { inputTokens: number; outputTokens: number }
interface AiResult { text: string; model: string; usage?: AiUsage | null }
type AiJsonSchema = Record<string, unknown>;

interface AiProvider {
  readonly id: string;
  complete(prompt: AiPrompt): Promise<AiResult>;
  completeJson(prompt: AiPrompt, schema: AiJsonSchema): Promise<AiResult>;
}

reportOutline(report: ReportDocument): string
aiContextSummary(report: ReportDocument): { sectionCount; itemCount; characters }
buildPrompt(request: AiRequest): AiPrompt
createAiProvider(config: AiConfig): AiProvider
aiOutputPath(root: string, kind: ReportKind, date: Date): string
saveAiOutput(root: string, kind: ReportKind, text: string, date?: Date): Promise<string>
estimateTokens(text: string): number
estimatePrompt(prompt: AiPrompt): { characters: number; inputTokens: number }

// Natural-language task entry (M5)
interface TaskSuggestion {
  title: string; notes: string; categoryId: string | null;
  startAt: string | null; endAt: string | null; dueAt: string | null;
  priority: 0 | 1 | 2 | 3; allDay: boolean;
}
buildTaskPrompt(input: { text; now; language; categories }): AiPrompt
parseTaskResponse(text: string, knownCategoryIds: Iterable<string>): TaskSuggestion[]
TASK_SUGGESTION_SCHEMA: AiJsonSchema

AI_MODELS: readonly string[]
DEFAULT_AI: AiConfig
loadAiSettings(): AiConfig
saveAiSettings(config: AiConfig): void
isAiConfigured(config: AiConfig): boolean
normalizeProtocol(value: unknown): AiProtocol
normalizeModel(value: unknown): string
normalizeBaseUrl(value: unknown): string
```

Contract:

1. Sent context is exactly `reportOutline(report)` plus the header fields;
   task notes, task ids, the data-folder path and the API key are never sent.
2. `buildPrompt` is pure, so the panel can show the exact user text as a
   preview before the request.
3. Providers implement `AiProvider` only. `createAiProvider` is the single
   branch point: `protocol: "anthropic"` → `AnthropicProvider` (`/v1/messages`,
   optional `baseURL`), `protocol: "openai"` → `OpenAiProvider`
   (`{baseUrl}/chat/completions`). Adding another vendor means adding a provider
   file and a branch there. The UI never imports a provider directly.
4. The Anthropic provider uses `claude-opus-5-5` by default, adaptive thinking
   and streaming (`messages.stream(...).finalMessage()`); the SDK is a dynamic
   import, so it is not in the startup bundle. `baseUrl` is passed through as
   the SDK's `baseURL`, so an Anthropic-compatible relay works unchanged;
   `maxRetries` is 2.
   The OpenAI-compatible provider uses `fetch`, requests `json_schema` first and
   retries once with `json_object` on a 4xx, because many relays reject the
   former field.
5. Nothing is written until the user presses **Save**. Output goes to
   `_ai/YYYY-MM-DD-<kind>-HHmmss.md`; the timestamp keeps every answer.
6. `_ai/` is **not** part of the WebDAV manifest, so AI notes are not uploaded
   by the sync button.
7. The API key lives in `localStorage` on this device, never in
   `_settings.md`. `isAiConfigured` is true only when the assistant is enabled
   and a non-empty key exists.
8. `completeJson` is used only for structured answers; the schema is sent with
   the request (`output_config.format`), so no "reply with JSON only" prompt
   text is needed.
9. `parseTaskResponse` is the trust boundary for natural-language entry: it
   rejects impossible dates, out-of-range times, unknown category ids and
   reversed ranges, caps the list at 10, and returns suggestions only. The
   editor fills its own state; `createTask` is still called by the user's Save.
10. `estimatePrompt` is a deliberately rough pre-send estimate (Latin ≈ 4
    characters/token, CJK ≈ 1.5); the panel labels it as an estimate. After a
    request, `result.usage` carries the provider's exact token counts and the
    panel shows them. No price is shown, because model pricing changes.

## 13. Tauri IPC commands (`src-tauri/src/lib.rs`)

All eleven commands are registered in one `generate_handler!` list. Rust structs
are serialised with `#[serde(rename_all = "camelCase")]`, so the TypeScript side
sees `isDirectory`, `fileCount`, `latestMtimeMs`, `fingerprint`. Each has a typed wrapper in
`src/storage/fs.ts` (§5).

| Command | Request | Response | Notes |
|---|---|---|---|
| `tree_signature` | `{ root: string }` | `{ fileCount: number, latestMtimeMs: number \| null, fingerprint: string }` | `.md` only, depth ≤ 2, dotfiles skipped; a missing folder yields `{0, null, ""}`. `fingerprint` hashes path + size + mtime. Called by `sync/scanner.ts`. |
| `read_text_file` | `{ path: string }` | `string \| null` | `null` when the file does not exist; other I/O failures return `string`. Called by `storage/client.ts`, `storage/settingsFile.ts`. |
| `write_text_file` | `{ path: string, contents: string }` | `null` | Creates parent directories, writes `<path>.tmp`, renames over `<path>`. Called by the store and repository. |
| `write_file_bytes` | `{ path: string, contents: number[] }` | `null` | Same atomic path; used by `exportDocx.ts`. |
| `create_dir_all` | `{ path: string }` | `null` | Creates the data folder on open. |
| `list_dir` | `{ path: string }` | `{ name: string, isDirectory: boolean }[]` | Sorted by name. |
| `path_exists` | `{ path: string }` | `boolean` | Used to test for `_categories.md` and `daymark.db`. |
| `remove_file` | `{ path: string }` | `null` | A missing file is also success; used when a day file becomes empty. |
| `rename_path` | `{ from: string, to: string }` | `null` | Used to retire the legacy database. |
| `file_mtime_ms` | `{ path: string }` | `number \| null` | Kept for compatibility; never errors. New code uses `tree_signature`. |
| `webdav_request` | `{ method: string, url: string, username?: string, password?: string, body?: string, depth?: string, headers?: Record<string,string> }` | `{ status: number, body: string, etag: string \| null, lastModified: string \| null }` | Raw WebDAV transport in `src-tauri/src/webdav.rs`; 45 s timeout, Basic auth only when a username is given. Non-2xx statuses are returned as data, not errors. Called by `sync/webdav/client.ts`. |

Error convention: `Result<T, String>` — a rejection carries the OS message. A
missing file is not an error for `read_text_file`, `remove_file` or
`file_mtime_ms`, because "not created yet" is a normal state for a fresh folder.

## 14. Capabilities and permissions

`src-tauri/capabilities/default.json` grants, for window `main`:

| Permission | Why it is required |
|---|---|
| `core:default` | Tauri core APIs used by the WebView. |
| `opener:default` | Registered opener plugin; reserved for opening files/folders. |
| `dialog:default` | Folder picker (`open`) and export path picker (`save`). |
| `sql:default` | `load`, `select`, `close` for the legacy migration only. |
| `sql:allow-execute` | Still required by the SQL plugin's migration path; no runtime SQL uses it. |

Rules:

- No new permissions were added for the Markdown store: every file operation
  goes through the app's own `#[tauri::command]` functions, which are not
  capability-gated.
- Adding a plugin requires both a Rust dependency and a permission entry.
- Changing capabilities requires a rebuild before the generated schema reflects
  it.
- Never widen permissions to `"*"`; list the smallest set that works.

## 15. Dialogs and plugins used by the frontend

| API | Location | Purpose |
|---|---|---|
| `open({ directory: true, multiple: false })` | `App.tsx` | Choose the data folder. |
| `save({ defaultPath, filters })` | `exportDocx.ts` | Choose the DOCX output path; `null` means cancelled. |
| `invoke("tree_signature")` | `sync/scanner.ts` | Folder change polling. |
| `invoke("read_text_file" / "write_text_file")` | `storage/fs.ts` | Text reads and atomic writes. |
| `invoke("list_dir" / "path_exists" / "create_dir_all" / "remove_file" / "rename_path")` | `storage/fs.ts` | Store loading and cleanup. |
| `invoke("webdav_request")` | `sync/webdav/client.ts` | WebDAV `PROPFIND`/`GET`/`PUT`/`MOVE`/`MKCOL` transport. |
| `Database.load/select/close` | `storage/migrate.ts` | One-time legacy migration only. |

## 16. Browser storage keys

| Key | Written by | Content | Synced? |
|---|---|---|---|
| `daymark.settings.v1` | `settings/store.ts` | JSON `AppSettings` including `dataDir` | No — device-local |
| `daymark.deviceId` | `storage/device.ts` | UUID string | No — device-local |
| `daymark.webdav.v1` | `settings/webdav.ts` | JSON `WebDavConfig`, including the password | No — device-local, never in `_settings.md` |
| `daymark.webdav.baseline.v1` | `sync/webdav/baseline.ts` | JSON `Baseline` keyed by URL + remote path; entries may carry `baseText` for `_settings.md` / `_categories.md` | No — per-device merge state |
| `daymark.ai.v1` | `settings/ai.ts` | JSON `AiConfig`, including the API key | No — device-local, never in `_settings.md` |

Clearing site data resets the device ID and the chosen folder. The data folder
itself is unaffected.

## 17. Data format and state contracts

### Dates

| Kind | Format | Example |
|---|---|---|
| Task schedule | local wall-clock | `2026-10-22T09:00` |
| All-day start / due date | local date | `2026-10-22` |
| Audit timestamps | UTC ISO with `Z` | `2026-10-22T01:00:00.000Z` |
| Report period label | local date range | `2026-10-19 ~ 2026-10-25` |
| Day file name | local date | `2026-10-22.md` |

Date-only values are interpreted as **local** dates when comparing periods.
When constructing a `Date` from a date-only task field, append `T00:00:00`
rather than relying on the JavaScript UTC interpretation.

### Task state

```
no startAt and no dueAt       → backlog   (lives in _backlog.md)
startAt or dueAt present      → scheduled
completedAt present           → done      (dates retained)
```

`done` is the only sticky state. Reopening returns to `scheduled` or `backlog`
based on dates. The parser and the repository must derive status the same way;
if one changes, change both and add a test.

### Completion history

- Completing writes `completedAt` and `completionId` into the task metadata.
- Reopening clears both fields. This is intentional in 0.1.0 so a reopened task
  leaves the report, but it also erases the earlier completion date. Treat it
  as a known limitation until P1 adds reversible history.

### Archived categories

`listCategories()` hides archived entries. A task that still points at an
archived category keeps the id, but report generation cannot resolve its name,
so the task is rendered under **Uncategorized**. Re-categorize tasks before
archiving a category if that matters.

## 18. Change checklist

Before merging a change that touches this document:

- [ ] All callers are updated (TypeScript will usually catch this).
- [ ] Tests cover the new behaviour or the changed invariant.
- [ ] A file-format change is backward-compatible, or a migration rewrites the
      affected files safely.
- [ ] New IPC commands are registered in `generate_handler!` and wrapped in
      `storage/fs.ts`.
- [ ] New UI strings exist in both locale files.
- [ ] This document and `13-repository-map.md` are updated in the same commit.
