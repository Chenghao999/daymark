# 05 · Data Model and Storage

> 中文摘要：数据以一个 Markdown 文件夹为唯一数据源，不再是 SQLite 数据库。
> 本文定义目录结构、四个文件的完整格式、字段表、解析规则与一次性迁移策略。
> 跨设备记录的主键仍使用 UUID，避免两端碰撞。

## 1. Conventions

- The store is a folder. Everything shared lives inside it; only the folder path
  is device-local.
- All primary keys are UUID v4 strings generated on the device that creates the
  record. Never use positional or auto-increment IDs.
- Timestamps are ISO 8601 strings. Task schedule fields are local wall-clock
  (`YYYY-MM-DDTHH:mm`); audit fields (`createdAt`, `updatedAt`, `completedAt`)
  are UTC (`...Z`).
- Booleans are JSON `true`/`false` inside metadata comments.
- Deletion is a hard delete: the task line and its comment are removed.
  Categories are archived, never deleted.
- Every write is atomic: write `<path>.tmp`, then rename over `<path>`.

## 2. Folder layout

```
<chosen folder>/
├── _settings.md              synced preferences
├── _categories.md            category list (commit marker for migration)
├── _backlog.md               tasks with no startAt and no dueAt
├── 2026-10/
│   ├── 2026-10-21.md
│   └── 2026-10-22.md
└── 2026-11/
    └── 2026-11-03.md
```

- Only `.md` files are scanned, maximum depth 2, dotfiles skipped.
- One file per day; the file name is the date key (`YYYY-MM-DD.md`).
- No sidecar files, no indexes, no journal. The whole store is loaded into
  memory on open.

## 3. `_settings.md`

```markdown
# Daymark settings / Daymark 设置

- language: zh-CN
- weekStartsOn: 1
- assessmentMonthStartDay: 1
- assessmentYearStartMonth: 1
- numbering: chinese
- scanIntervalSec: 60
- userName:

<!-- daymark settings {"language":"zh-CN","weekStartsOn":1,"assessmentMonthStartDay":1,"assessmentYearStartMonth":1,"numbering":"chinese","scanIntervalSec":60,"userName":""} -->
```

| Key | Type | Range / values | Meaning |
|---|---|---|---|
| `language` | string | `zh-CN` \| `en` | UI language, applied immediately. |
| `weekStartsOn` | number | `0` Sunday, `1` Monday | First column of the week view and weekly reports. |
| `assessmentMonthStartDay` | number | 1–28 (clamped) | First day of an assessment month; `26` means the 26th through the 25th. |
| `assessmentYearStartMonth` | number | 1–12 | First month of an assessment year, using the same start day. |
| `numbering` | string | `chinese` \| `arabic` \| `alpha` | Report section prefix. |
| `scanIntervalSec` | number | 10–3600 (UI offers 30/60/300) | Folder signature poll interval. |
| `userName` | string | free text | Report signature name; stored now, not printed yet; reserved for the future AI assistant. |

The parser prefers the JSON comment and falls back to the bullet list when the
JSON is missing or malformed. `dataDir` is device-local and is never written
into this file. The file is rewritten whenever a synced setting changes.

## 4. `_categories.md`

```markdown
# Categories · 分类

<!-- Daymark reads the JSON metadata on each line. Names, colours and order may be edited by hand. -->

- Project work / 项目开发 <!-- daymark {"id":"6f1c...","color":"#5b8def","sortOrder":0,"archived":false} -->
- Meetings / 会议沟通 <!-- daymark {"id":"a2d4...","color":"#e0a03a","sortOrder":1,"archived":false} -->
```

| Field | Type | Notes |
|---|---|---|
| label before `/` | string | English name; also the section heading prefix. |
| label after `/` | string | Chinese name. A line without `/` uses the same text for both. |
| `id` | string | UUID; missing ids are generated on read. |
| `color` | string | `#rrggbb`; invalid values fall back to `#6b7cff`. |
| `sortOrder` | number | Ascending report order. |
| `archived` | boolean | Archived categories are hidden from pickers. |

Default categories seeded on a fresh folder: Project work / 项目开发,
Meetings / 会议沟通, Administration / 行政事务, Learning / 学习成长.

## 5. Day file

```markdown
# 2026-10-22

<!-- daymark file {"updatedAt":"2026-10-22T01:10:00.000Z","deviceId":"..."} -->

## Project work · 项目开发

- [ ] 09:00–10:00 写周报
  > 汇总本周进展
  <!-- daymark task {"id":"...","categoryId":"...","priority":2,"startAt":"2026-10-22T09:00","endAt":"2026-10-22T10:00","dueAt":null,"allDay":false,"createdAt":"...","updatedAt":"...","deviceId":"...","rowVersion":1,"source":"local","externalUid":null,"completedAt":null,"completionId":null} -->

- [x] 14:00 评审
  <!-- daymark task {"id":"...","categoryId":"...","priority":0,"startAt":"2026-10-22T14:00","endAt":null,"dueAt":null,"allDay":false,"createdAt":"...","updatedAt":"...","deviceId":"...","rowVersion":2,"source":"local","externalUid":null,"completedAt":"2026-10-22T06:05:00.000Z","completionId":"..."} -->
```

### Line grammar

| Line | Meaning |
|---|---|
| `# YYYY-MM-DD` | File title, regenerated on save; ignored when parsing. |
| `<!-- daymark file {...} -->` | File metadata: `updatedAt`, `deviceId`. Fallback for tasks without their own metadata. |
| `## <heading>` | Category section; resolved to a `categoryId` by matching `English · 中文`, English or Chinese name. |
| `- [ ] text` | Open task. |
| `- [x] text` | Completed task. A hand-checked box with no metadata gets local noon of that day as `completedAt`. |
| `HH:mm–HH:mm text` / `HH:mm text` | Leading time range on a task line; becomes `startAt`/`endAt` on that date. |
| `  > text` | Notes line; consecutive lines are joined with `\n`. |
| `  <!-- daymark task {...} -->` | Task metadata for the preceding task line. |

### Task metadata

| Field | Type | Notes |
|---|---|---|
| `id` | string | UUID v4; generated when absent. |
| `categoryId` | string \| null | `null` = uncategorized; falls back to the section heading. |
| `priority` | number | `0` normal, `1` low, `2` high, `3` urgent. |
| `startAt` | string \| null | `YYYY-MM-DDTHH:mm`, or `YYYY-MM-DD` for all-day. |
| `endAt` | string \| null | Local wall-clock; `null` when open-ended. |
| `dueAt` | string \| null | Date or datetime. |
| `allDay` | boolean | Infers `true` when `startAt` is exactly ten characters. |
| `createdAt` | string | UTC ISO 8601. |
| `updatedAt` | string | UTC ISO 8601; the winner when the same id appears twice. |
| `deviceId` | string | Identity of the writer. |
| `rowVersion` | number | Starts at 1, incremented on every write. |
| `source` | string | `local`; `caldav` reserved for the future CalDAV import. |
| `externalUid` | string \| null | Reserved for CalDAV. |
| `completedAt` | string \| null | UTC ISO; presence means done. |
| `completionId` | string \| null | UUID of the completion record. |

## 6. `_backlog.md`

```markdown
# Backlog · 待办

<!-- daymark file {"updatedAt":"2026-10-22T01:10:00.000Z","deviceId":"..."} -->

## Uncategorized · 未分类

- [ ] 整理季度资料
  <!-- daymark task {"id":"...","categoryId":null,"priority":0,"startAt":null,"endAt":null,"dueAt":null,"allDay":false,"createdAt":"...","updatedAt":"...","deviceId":"...","rowVersion":1,"source":"local","externalUid":null,"completedAt":null,"completionId":null} -->
```

`_backlog.md` holds every task with no `startAt` and no `dueAt`. It always
exists, even when empty.

## 7. Filing, extras and lifecycle

- **Filing rule:** `dateKey = startAt date`, else `dueAt date`, else backlog.
  Moving a task between days rewrites both files.
- **Extras:** unrecognised non-empty lines are preserved per file and re-emitted
  at the end of that file on save. Blank lines are dropped.
- **Removal:** a day file with no tasks and no extras is deleted on save.
  `_backlog.md` is never deleted.
- **Duplicates:** if the same task id appears in two files, the copy with the
  later `updatedAt` wins; the other is left in place until that file is written.
- **Ordering:** tasks are grouped by category (`sortOrder`, uncategorized last)
  and inside a group by `startAt ?? dueAt`, then priority descending, then
  `createdAt`.

## 8. Migration

One-time, automatic, and only when `_categories.md` is absent while
`daymark.db` exists in the chosen folder:

1. Read `categories`, `tasks` (excluding soft-deleted rows) and
   `task_completions` through `@tauri-apps/plugin-sql`.
2. Write one day file per date key.
3. Write `_backlog.md`.
4. Write `_categories.md` last — its presence is the commit marker, so an
   interrupted migration simply runs again.
5. Rename the database to `daymark.db.migrated-YYYYMMDD-HHmmss`. It is renamed,
   never deleted.

SQLite is retained only for this migration; there is no runtime database.

## 9. Integrity rules

- `status` is derived from dates plus the presence of `completedAt`; the file
  never stores a contradictory status.
- `categoryId` pointing at an archived category still loads, but reports cannot
  resolve its name and render the task under **Uncategorized**.
- A task always belongs to exactly one file; the file is the single source of
  truth for its date key.
