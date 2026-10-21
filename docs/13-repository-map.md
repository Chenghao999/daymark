# 13 · Repository Map and File Structure

> 中文摘要：本文件回答三个问题——每个文件属于哪一层、改动应该落在哪里、哪些
> 目录是生成物不能手改。新增或移动文件时必须在同一个提交里更新本文件；导出的
> 类型、函数或 IPC 命令发生变化时，同时更新 `14-interface-reference.md`。

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
├── tests/                    Vitest unit tests for the domain layer
├── docs/                     product, engineering and operations documents
└── .vscode/
    └── extensions.json       recommended editor extensions only
```

Nothing else belongs at the top level. Build output (`dist/`, `src-tauri/target/`),
dependencies (`node_modules/`) and generated Tauri schemas
(`src-tauri/gen/schemas/`) are ignored by git.

## 2. Layer ownership

| Layer | Directory | Owns | Must never contain |
|---|---|---|---|
| Domain | `src/domain/` | types, task state machine, report derivation, numbering | SQL, DOM, Tauri APIs, localStorage |
| Persistence | `src/db/` | schema statements, row mapping, SQL reads/writes | business decisions, UI state |
| Sync | `src/sync/` | mtime polling and external-change signal | database writes, merge logic |
| Device settings | `src/settings/` | device-local preferences in localStorage | shared task data |
| Presentation | `src/components/`, `src/features/`, `src/App.tsx` | view state, interaction, layout | SQL strings, direct `Database` access |
| i18n | `src/i18n/` | UI resources and i18next setup | product logic |
| Desktop shell | `src-tauri/` | plugins, IPC commands, window and bundle config | product rules |

The dependency direction is one-way: `features` → `db`/`domain`/`sync`/`settings`.
`domain` imports nothing from the other layers. This is what keeps the domain
testable without a browser or a Rust build.

## 3. File-by-file

### 3.1 Application root (`src/`)

| File | Responsibility |
|---|---|
| `main.tsx` | Creates the React root, imports `./i18n` and `./App.css`. No logic. |
| `App.tsx` | App shell: onboarding, database bootstrap, view switching, task actions, scanner lifecycle, conflict banner, global error state. |
| `App.css` | Design tokens (light/dark), layout, calendar grids, report paper, modal. |
| `vite-env.d.ts` | Vite type reference only. |

### 3.2 Domain (`src/domain/`)

| File | Responsibility |
|---|---|
| `types.ts` | All shared TypeScript types: `Task`, `Category`, `Completion`, `ReportDocument`, unions. No runtime code. |
| `tasks.ts` | Pure task state machine: `hasSchedule`, `normalizeStatus`, `scheduleTask`, `unscheduleTask`, `completeTask`, `reopenTask`, `sortTasks`. |
| `reports.ts` | `generateReport` derives a `ReportDocument` from tasks, completions, categories, period and numbering style. Also `reportTitle`, `uncategorizedLabel`. |
| `numbering.ts` | `chineseNumber`, `alphaNumber`, `formatHeading` — section prefixes for reports. |

### 3.3 Persistence (`src/db/`)

| File | Responsibility |
|---|---|
| `schema.ts` | `SCHEMA` (idempotent DDL), `SCHEMA_VERSION`, `DEFAULT_CATEGORIES`. |
| `client.ts` | Opens/closes the SQLite file, applies the schema, seeds default categories, generates and stores the device ID. Holds the single `Database` instance. |
| `repository.ts` | All SQL used by the UI: task CRUD, completion rows, category management, sync metadata. Converts snake_case rows to camelCase objects. |

### 3.4 Sync (`src/sync/`)

| File | Responsibility |
|---|---|
| `scanner.ts` | `startFileScanner` polls `file_mtime_ms`; calls `onExternalChange` when the file changed without Daymark writing it; `touch()` re-baselines after a local write. Detection only — no merge. |

### 3.5 Device settings (`src/settings/`)

| File | Responsibility |
|---|---|
| `store.ts` | `AppSettings`, defaults, `loadSettings`, `saveSettings`, `databasePath`. Backed by `localStorage`, never by the database. |

### 3.6 UI (`src/components/`, `src/features/`)

| File | Responsibility |
|---|---|
| `components/TaskEditor.tsx` | Modal form for creating/editing a task; validates the title; emits a `TaskDraft`. |
| `features/calendar/WeekView.tsx` | Monday-first week grid. Exports `taskDateKey` and `tasksForDay`, reused by the other views. |
| `features/calendar/DayView.tsx` | Single-day list grouped by status. |
| `features/calendar/MonthView.tsx` | Month grid with per-day task counts; clicking a day opens the day view. |
| `features/reports/ReportsView.tsx` | Period selection, live preview, numbering selector, DOCX export. |
| `features/reports/exportDocx.ts` | Builds a `docx` document from a `ReportDocument`, asks for a path, writes via `write_file_bytes`. |
| `features/settings/SettingsView.tsx` | Language, numbering, scan interval, data folder, category add/archive, device ID display. |

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
| `reports.test.ts` | Report grouping, category order, completion attribution, uncategorized bucket. |

Tests import only `src/domain/*`. The test files are **not** included by
`tsconfig.json`; `npm run typecheck` checks `src/` only. Vitest transpiles the
tests itself.

### 3.9 Desktop shell (`src-tauri/`)

| File | Responsibility |
|---|---|
| `Cargo.toml` | Rust package, Tauri/plugin dependencies, release profile (LTO, strip, panic=abort). |
| `Cargo.lock` | Committed so desktop builds are reproducible. |
| `build.rs` | Standard `tauri_build::build()`. |
| `src/main.rs` | Calls `daymark_lib::run()`. |
| `src/lib.rs` | Plugin registration and the two IPC commands (`file_mtime_ms`, `write_file_bytes`). Keep this file small. |
| `tauri.conf.json` | Product name, identifier, window size, dev URL, bundle targets and icons. |
| `capabilities/default.json` | The permission allow-list for the main window. Runtime writes fail without `sql:allow-execute`. |
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
| `05-data-model.md` | Tables, fields, indexes, migrations. |
| `06-sync-conflict.md` | Sync and conflict design (1.0 detection + P1 delta plan). |
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

## 4. Generated files — do not edit

| Path | Produced by | Notes |
|---|---|---|
| `node_modules/` | `npm install` | ignored |
| `dist/` | `npm run build` | ignored; Tauri bundles it |
| `src-tauri/target/` | `cargo` / `tauri build` | ignored |
| `src-tauri/gen/schemas/` | Tauri build | ignored; regenerated from capabilities |
| `package-lock.json` | npm | generated but **committed** |
| `src-tauri/Cargo.lock` | cargo | generated but **committed** |

Never hand-edit a generated file. Change its source (`package.json`,
`Cargo.toml`, `capabilities/default.json`) and rebuild.

## 5. Where should a change go?

| I want to… | Put it in | Also update |
|---|---|---|
| Add a task field | `schema.ts` → `types.ts` → `repository.ts` → `TaskEditor.tsx` | docs 05, 14, 15 |
| Change how task status is derived | `domain/tasks.ts` and mirror it in `repository.ts` if persistence changes | doc 14, tests |
| Add a report rule | `domain/reports.ts` + `tests/reports.test.ts` | docs 08, 14 |
| Add a numbering style | `domain/types.ts`, `domain/numbering.ts`, both locale files, settings UI | docs 08, 09, 14 |
| Add a screen | `features/<name>/`, then wire it in `App.tsx` (`View` union + nav) | docs 13, 14, both locale files |
| Add a native capability | `src-tauri/src/lib.rs`, `generate_handler!`, `capabilities/default.json` | docs 14, 17 |
| Add a sync behaviour | `sync/scanner.ts` (detection) or the P1 exchange module | docs 06, 16 |
| Add a device preference | `settings/store.ts` + `SettingsView.tsx` | docs 14, 15 |
| Add a user-visible string | both `en.json` and `zh-CN.json` | doc 09 |
| Add a database migration | `schema.ts` with `PRAGMA user_version` + backup | docs 05, 12 |

## 6. Naming conventions

- Files: `PascalCase.tsx` for components, `camelCase.ts` for modules.
- Types and interfaces: `PascalCase`; functions and variables: `camelCase`.
- Database tables and columns: `snake_case`; the repository is the only place
  that converts them to camelCase.
- i18n keys: nested objects, camelCase leaf names, e.g. `reports.exportFailed`.
- Tests: `<module>.test.ts`.
- Rust: standard `snake_case`, commands are verbs + noun (`file_mtime_ms`).

## 7. Documentation coupling rules

A change is not finished until the matching document is updated in the same
commit:

| Change | Required document update |
|---|---|
| File added, moved or deleted | this file (13) |
| Exported type, function, command or permission changed | 14 |
| Table, column, index or migration | 05 and 14 |
| Sync/conflict behaviour | 06 and 16 |
| User-visible workflow | 15 and 17 |
| Toolchain, build or packaging | 10 and 18 |
| i18n key or locale policy | 09 |

This rule exists because the code is small enough to read but large enough that
stale documentation is worse than none. When in doubt, update the document.
