# 13 · Repository Map and File Structure

> 中文摘要：本文件回答三个问题——每个文件属于哪一层、改动应该落在哪里、哪些
> 目录是生成物不能手改。数据层已从 SQLite 改为 Markdown 文件夹（`src/storage/`）。
> 新增或移动文件时必须在同一个提交里更新本文件；导出的类型、函数或 IPC 命令发生
> 变化时，同时更新 `14-interface-reference.md`。

## 1. Top level

```
daymark/
├── README.md                 project entry point, quick start, doc index
├── LICENSE                   MIT
├── package.json              npm scripts and frontend dependencies
├── package-lock.json         committed lockfile (reproducible installs)
├── index.html                Vite entry document, mounts #root
├── vite.config.ts            dev server on fixed port 1420, ignores src-tauri
├── tsconfig.json             strict TypeScript config for src/
├── tsconfig.node.json        TypeScript config for vite.config.ts
├── public/
│   └── daymark.svg           app mark served as-is by Vite
├── src/                      React + TypeScript application (all business logic)
├── src-tauri/                Tauri shell, Rust commands, capabilities, icons
├── tests/                    Vitest unit tests for the domain and storage layers
├── docs/                     product, engineering and operations documents
├── .github/
│   └── workflows/ci.yml      CI: typecheck, tests + coverage, build, cargo check
└── .vscode/
    └── extensions.json       recommended editor extensions only
```

Nothing else belongs at the top level. Build output (`dist/`, `src-tauri/target/`),
dependencies (`node_modules/`) and generated Tauri schemas
(`src-tauri/gen/schemas/`) are ignored by git.

## 2. Layer ownership

| Layer | Directory | Owns | Must never contain |
|---|---|---|---|
| Domain | `src/domain/` | types, task state machine, period math, report derivation, numbering | filesystem calls, DOM, Tauri APIs, localStorage |
| Storage | `src/storage/` | Markdown parse/serialize, paths, in-memory store, repository, migration | report rules, UI state |
| Sync | `src/sync/` | folder-signature polling and external-change signal | store writes, merge logic |
| Device settings | `src/settings/` | device-local preferences and the synced settings model | shared task data |
| Presentation | `src/components/`, `src/features/`, `src/App.tsx` | view state, interaction, layout | Markdown parsing, direct `invoke` calls |
| i18n | `src/i18n/` | UI resources and i18next setup | product logic |
| Desktop shell | `src-tauri/` | plugins, IPC commands, window and bundle config | product rules |

The dependency direction is one-way: `features` → `storage`/`domain`/`sync`/
`settings`. `domain` imports nothing from the other layers, and `storage` does
not import `features`. This is what keeps the domain testable without a browser
or a Rust build.

Each layer is used through the interfaces it exports, never through its internal
files: the UI calls `storage/repository.ts`, the repository calls the domain
rules, and only `storage/fs.ts` calls `invoke`. Doc 14 lists every signature;
doc 18 §4.1 lists who may call each module and how to exercise one layer alone
when debugging. Keeping the surface small is what makes a module replaceable
(for example, a future WebDAV store behind the same repository calls).

**中文要点：** 每层只通过导出的接口被调用，不允许跨层直接引用内部文件；完整签名见
文档 14，调用关系与单层调试方法见文档 18 §4.1。

## 3. File-by-file

### 3.1 Application root (`src/`)

| File | Responsibility |
|---|---|
| `main.tsx` | Creates the React root, imports `./i18n` and `./App.css`. No logic. |
| `App.tsx` | App shell: onboarding, `openStore` bootstrap, view switching, task actions, scanner lifecycle, reload banner, global error state. |
| `App.css` | Design tokens (light/dark), layout, calendar grids, report paper, modal. |
| `vite-env.d.ts` | Vite type reference only. |

### 3.2 Domain (`src/domain/`)

| File | Responsibility |
|---|---|
| `types.ts` | All shared TypeScript types: `Task`, `Category`, `Completion`, `ReportDocument`, unions. No runtime code. |
| `tasks.ts` | Pure task state machine: `hasSchedule`, `normalizeStatus`, `scheduleTask`, `unscheduleTask`, `completeTask`, `reopenTask`, `sortTasks`. |
| `periods.ts` | `reportPeriod(kind, anchor, options)` and `ReportPeriod` / `PeriodOptions`. Weekly honours `weekStartsOn`; monthly and yearly honour the assessment start day/month. |
| `reports.ts` | `generateReport` derives a `ReportDocument`; re-exports the period helpers and adds `reportTitle` (including the yearly title), `uncategorizedLabel`. |
| `numbering.ts` | `chineseNumber`, `alphaNumber`, `formatHeading` — section prefixes for reports. |

### 3.3 Storage (`src/storage/`)

| File | Responsibility |
|---|---|
| `types.ts` | `StoredTask {task, completion, dateKey}`, `StoreState {root, categories, tasks, extrasByDate}`, `BACKLOG_KEY`. |
| `paths.ts` | File names (`_settings.md`, `_categories.md`, `_backlog.md`, `daymark.db`) and `dateKeyOf`, `monthKey`, `monthDir`, `dayFilePath`, `backlogPath`, `categoriesPath`, `settingsPath`, `legacyDbPath`, `extrasKey`, `isMonthFolder`, `isDayFile`, `dateKeyOfFile`. |
| `fs.ts` | Typed `invoke` wrappers for the Rust file commands plus `DirEntry` and `TreeSignature`. |
| `markdown.ts` | `parseCategoriesMarkdown`, `serializeCategoriesMarkdown`, `parseMarkdown`, `serializeMarkdown`. The only place that knows the file grammar. |
| `client.ts` | `openStore(root)`, `closeStore()`, `getStoreState()`, `getStoreRoot()`. Loads every file into memory and seeds defaults on an empty folder. |
| `repository.ts` | All store mutations used by the UI: task CRUD, completion, category management. Writes the affected day file atomically. |
| `migrate.ts` | `migrateLegacyDatabase(root)` — one-time SQLite → Markdown conversion. |
| `settingsFile.ts` | `_settings.md` serializer/parser and `loadSyncedSettings` / `saveSyncedSettings`. |
| `device.ts` | `deviceId()` from `localStorage["daymark.deviceId"]`. |
| `defaults.ts` | The four default categories seeded into a new folder. |

### 3.4 Sync (`src/sync/`)

| File | Responsibility |
|---|---|
| `scanner.ts` | `startFolderScanner` polls `tree_signature(root)`; calls `onExternalChange` when the folder changed without Daymark writing it; `touch()` re-baselines after a local write. Detection only — no merge. |
| `webdav/types.ts` | `WebDavConfig`, `RemoteEntry`, `Baseline`, `SyncPlan`, `SyncProgress`, `SyncResult`. Types only. |
| `webdav/client.ts` | Pure URL/href/PROPFIND helpers plus `WebDavClient` (`test`, `list`, `listTree`, `getText`, `mkcol`, `putText`). The only module that knows WebDAV verbs; transport is the Rust `webdav_request` command. |
| `webdav/manifest.ts` | `sha256`, `localManifest(root, io?)` over `_settings.md`, `_categories.md`, `_backlog.md` and valid day files. `ManifestIo` lets tests inject a fake file system. |
| `webdav/plan.ts` | Pure `planSync(local, remote, baseline)` → uploads, downloads, conflicts, unchanged. No deletions and no silent overwrite. |
| `webdav/baseline.ts` | Device-local SHA-256 baseline (`daymark.webdav.baseline.v1`), keyed by URL + remote path. |
| `webdav/engine.ts` | `syncWebDav(config, root, options)`: read both sides, plan once, then write; conflict copies, progress callback, per-file errors. |

### 3.5 Device settings (`src/settings/`)

| File | Responsibility |
|---|---|
| `store.ts` | `SyncedSettings`, `AppSettings`, defaults, `loadSettings`, `saveSettings`, `sanitize`, `syncedPart`. `dataDir` is device-local; the rest is mirrored to `_settings.md`. |
| `webdav.ts` | Device-local `WebDavConfig` in `localStorage` (`daymark.webdav.v1`), defaults and `isWebDavConfigured`. The password never enters `_settings.md`. |

### 3.6 UI (`src/components/`, `src/features/`)

| File | Responsibility |
|---|---|
| `components/TaskEditor.tsx` | Modal form for creating/editing a task; validates the title; emits a `TaskDraft`. |
| `features/calendar/WeekView.tsx` | Week grid that honours `weekStartsOn`. Exports `taskDateKey` and `tasksForDay`, reused by the other views. |
| `features/calendar/DayView.tsx` | Single-day list grouped by status, plus the backlog. |
| `features/calendar/MonthView.tsx` | Month grid with per-day task counts; honours `weekStartsOn`; clicking a day opens the day view. |
| `features/reports/ReportsView.tsx` | Daily/Weekly/Monthly/Yearly tabs, assessment-period hint, live preview, numbering selector, DOCX export. |
| `features/reports/exportDocx.ts` | Builds a `docx` document from a `ReportDocument`, asks for a path, writes via `write_file_bytes`. |
| `features/settings/SettingsView.tsx` | Language, week start, assessment month start day, assessment year start month, report signature name, numbering, scan interval, data folder, WebDAV card (URL, remote folder, credentials, test/sync, status, conflict list), category add/archive, device ID display. |

### 3.7 Internationalisation (`src/i18n/`)

| File | Responsibility |
|---|---|
| `index.ts` | i18next initialisation; language read from settings; `fallbackLng: "en"`. |
| `locales/en.json` | English UI strings. |
| `locales/zh-CN.json` | Simplified Chinese UI strings. Must keep the exact same key set. |

### 3.8 Tests (`tests/`)

| File | Covers |
|---|---|
| `numbering.test.ts` | Chinese/Arabic/Alpha section numbering and heading formatting. |
| `reports.test.ts` | `reportPeriod` boundaries and report grouping, category order, completion attribution. |
| `periods.test.ts` | Week start, assessment month and assessment year boundaries. |
| `markdown.test.ts` | Category parsing/serialization, day-file round-trip, extras, hand-checked boxes. |
| `settingsFile.test.ts` | `_settings.md` JSON comment vs bullet list, fallback and clamping. |
| `webdavPlan.test.ts` | Upload/download/unchanged/conflict decisions, first sync, stale baseline, no deletions. |
| `webdavClient.test.ts` | Remote path normalisation, URL encoding, href resolution, PROPFIND parsing with and without namespaces. |
| `webdavManifest.test.ts` | File whitelist, content hashing, files that disappear mid-scan. |

Tests import only `src/domain/*` and `src/storage/markdown.ts` /
`src/storage/settingsFile.ts`; no Tauri mocks are needed for those modules. The
test files are **not** included by `tsconfig.json`; `npm run typecheck` checks
`src/` only. Vitest transpiles the tests itself.

### 3.9 Desktop shell (`src-tauri/`)

| File | Responsibility |
|---|---|
| `Cargo.toml` | Rust package, Tauri/plugin dependencies, release profile (LTO, strip, panic=abort). |
| `Cargo.lock` | Committed so desktop builds are reproducible. |
| `build.rs` | Standard `tauri_build::build()`. |
| `src/main.rs` | Calls `daymark_lib::run()`. |
| `src/lib.rs` | Plugin registration, the file IPC commands (`file_mtime_ms`, `read_text_file`, `write_text_file`, `write_file_bytes`, `create_dir_all`, `list_dir`, `path_exists`, `remove_file`, `rename_path`, `tree_signature`) and `webdav_request`. Keep this file small. |
| `src/webdav.rs` | Minimal WebDAV transport with `reqwest`: one `webdav_request(method, url, …)` command, 45 s timeout, optional Basic auth, HTTP errors returned to the caller. No sync logic. |
| `tauri.conf.json` | Product name, identifier, window size, dev URL, bundle targets and icons. |
| `capabilities/default.json` | The permission allow-list for the main window. `sql:*` remains only for the one-time migration. |
| `icons/` | Bundle icons referenced by `tauri.conf.json`. |
| `gen/schemas/` | Generated capability schemas. Ignored by git; never edit. |
| `target/` | Cargo build output. Ignored by git. |

### 3.10 Documentation (`docs/`)

| File | Topic |
|---|---|
| `README.md` | Document index and reading paths. |
| `01-prd.md` | Product requirements. |
| `02-fsd.md` | Functional specification. |
| `03-user-stories.md` | User stories and acceptance criteria. |
| `04-architecture.md` | Technical architecture. |
| `05-data-model.md` | Markdown folder format, fields, migration. |
| `06-sync-conflict.md` | Sync and conflict design (0.1 detection + P1 merge plan). |
| `07-caldav.md` | CalDAV design (not implemented). |
| `08-report-templates.md` | Report template and DOCX specification. |
| `09-i18n.md` | Internationalisation rules. |
| `10-build-distribution.md` | Build and distribution. |
| `11-test-plan.md` | Test plan. |
| `12-release-checklist.md` | Release checklist. |
| `13-repository-map.md` | This file: structure and ownership. |
| `14-interface-reference.md` | Types, functions, IPC commands and permission contract. |
| `15-user-guide.md` | End-user instructions. |
| `16-data-sync-operations.md` | Multi-device setup, conflict handling, backup/restore. |
| `17-troubleshooting.md` | Symptom → cause → action. |
| `18-development-guide.md` | Environment, workflow, change playbooks, conventions. |
| `19-roadmap.md` | Milestones, WebDAV first-version status (§3.8), AI assistant and CalDAV plan. |

## 4. Generated files — do not edit

| Path | Produced by | Notes |
|---|---|---|
| `node_modules/` | `npm install` | ignored |
| `dist/` | `npm run build` | ignored; Tauri bundles it |
| `src-tauri/target/` | `cargo` / `tauri build` | ignored |
| `src-tauri/gen/schemas/` | Tauri build | ignored; regenerated from capabilities |
| `coverage/` | `npm run test:coverage` | ignored; uploaded by CI as an artifact |
| `package-lock.json` | npm | generated but **committed** |
| `src-tauri/Cargo.lock` | cargo | generated but **committed** |

Never hand-edit a generated file. Change its source (`package.json`,
`Cargo.toml`, `capabilities/default.json`) and rebuild.

## 5. Where should a change go?

| I want to… | Put it in | Also update |
|---|---|---|
| Add a task field | `domain/types.ts` → `storage/markdown.ts` (metadata) → `storage/repository.ts` → `TaskEditor.tsx` | docs 05, 14, 15 |
| Change how task status is derived | `domain/tasks.ts`, and mirror it in `storage/markdown.ts` / `repository.ts` if persistence changes | doc 14, tests |
| Change the file grammar | `storage/markdown.ts` only | docs 05, 14, 16 |
| Add or change a data file | `storage/paths.ts` → `client.ts` → `repository.ts` | docs 05, 13, 16 |
| Add a report rule | `domain/reports.ts` + `tests/reports.test.ts` | docs 08, 14 |
| Change period boundaries | `domain/periods.ts` + `tests/periods.test.ts` | docs 08, 14, 15 |
| Add a numbering style | `domain/types.ts`, `domain/numbering.ts`, both locale files, settings UI | docs 08, 09, 14 |
| Add a screen | `features/<name>/`, then wire it in `App.tsx` (`View` union + nav) | docs 13, 14, both locale files |
| Add a native capability | `src-tauri/src/lib.rs`, `generate_handler!`, `capabilities/default.json`, `storage/fs.ts` wrapper | docs 14, 17 |
| Add a sync behaviour | `sync/scanner.ts` (detection) or the P1 merge module | docs 06, 16 |
| Add a device preference | `settings/store.ts`, `storage/settingsFile.ts`, `SettingsView.tsx` | docs 14, 15 |
| Add a user-visible string | both `en.json` and `zh-CN.json` | doc 09 |
| Change the migration | `storage/migrate.ts` + `storage/client.ts` | docs 05, 12, 16 |

## 6. Naming conventions

- Files: `PascalCase.tsx` for components, `camelCase.ts` for modules.
- Types and interfaces: `PascalCase`; functions and variables: `camelCase`.
- Markdown metadata keys and TypeScript fields are both `camelCase`; the file
  format is camelCase JSON by design, so no row mapping layer exists.
- Special data files start with `_` so they sort first and are never confused
  with a month folder or a day file.
- i18n keys: nested objects, camelCase leaf names, e.g. `reports.exportFailed`.
- Tests: `<module>.test.ts`.
- Rust: standard `snake_case`, commands are verbs + noun (`tree_signature`).

## 7. Documentation coupling rules

A change is not finished until the matching document is updated in the same
commit:

| Change | Required document update |
|---|---|
| File added, moved or deleted | this file (13) |
| Exported type, function, command or permission changed | 14 |
| Markdown file format, field or metadata key | 05 and 14 |
| Sync/conflict behaviour | 06 and 16 |
| User-visible workflow | 15 and 17 |
| Toolchain, build or packaging | 10 and 18 |
| i18n key or locale policy | 09 |

This rule exists because the code is small enough to read but large enough that
stale documentation is worse than none. When in doubt, update the document.
