# 04 · Technical Architecture

> 中文摘要：Tauri 2 + React + TypeScript 前端，Rust 侧只承担插件与文件操作；
> SQLite 通过 `tauri-plugin-sql` 打开用户指定路径；模块边界为领域逻辑、数据访问、
> 同步扫描、界面四层。Electron 作为降级方案保留。

## 1. Stack decision

| Option | Verdict | Reason |
|---|---|---|
| **Tauri 2** | chosen | 2–20 MB bundles, low memory, portable exe and unsigned `.app` fit the green-build requirement |
| Electron | fallback | no Rust, but 100 MB+ and heavier background footprint |
| Native (Swift/C#) | rejected | two codebases, no shared UI |

Rust is used where it is strictly better: the shell, plugin wiring, mtime
queries and atomic file writes. Business logic stays in TypeScript so it can be
unit-tested with Vitest without a Rust build.

## 2. Runtime model

```
┌──────────────────────── Tauri window (WebView) ───────────────────────┐
│ React UI                                                              │
│   features/calendar  features/reports  features/settings              │
│   components/TaskEditor                                               │
│        │                                                              │
│   domain/  ── pure functions: state machine, reports, numbering        │
│        │                                                              │
│   db/      ── schema + repository (SQL)                                │
│   sync/    ── scanner: invoke("file_mtime_ms") every N seconds         │
└───────────────┬───────────────────────────────────────────────────────┘
                │ tauri-plugin-sql (SQLite)      │ invoke commands
                ▼                                ▼
        user-chosen daymark.db          Rust: metadata / atomic rename
```

There is no background daemon and no network listener.

## 3. Module boundaries

| Module | Owns | Must not |
|---|---|---|
| `domain/` | task state machine, report derivation, numbering | touch SQLite, DOM or Tauri APIs |
| `db/` | schema statements, row mapping, writes | contain business rules |
| `sync/` | mtime polling, external-change signal | write to the database |
| `features/` | view state and user interaction | embed SQL |
| `src-tauri/` | plugins, file commands, window | contain product rules |

This is what makes F-25 (modular deployment) possible: reports can be replaced
without touching storage, and CalDAV can be added as a separate feature module.

## 4. Data flow

1. Launch → settings from `localStorage` (device-local) → `openDatabase(path)`.
2. Repository queries populate the task and category state in `App`.
3. User action → repository write → `refresh()` → scanner `touch()` re-baselines
   the mtime so Daymark's own write is not mistaken for an external change.
4. External mtime change → conflict banner → user reloads → close and reopen the
   database → refresh.

## 5. Why settings are not in the database

The database path is inherently device-specific: the same synced folder has a
different absolute path on each machine. Storing the path inside the database
would be circular. Language, scan interval and numbering are also per-device
preferences. They live in `localStorage`; only task data is shared.

## 6. Report generation

Report generation is a pure function from `(tasks, completions, categories,
period, numbering)` to a `ReportDocument`. DOCX export is a second, isolated
step (`features/reports/exportDocx.ts`) using the `docx` package and Word's
built-in styles, so a future template engine can replace it without touching
derivation.

## 7. Packaging

Tauri bundles one executable per platform plus the WebView assets. Language
files are bundled but loaded through i18next, so a future external-resource
mode only needs a different loader. Database and settings never ship with the
app.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Rust toolchain blocks contributors | Rust surface kept to ~40 lines; Electron fallback documented |
| SQLite on a network/sync folder | scanner + atomic rename; P1 delta exchange (doc 06) |
| `docx` output diverges from Word templates | built-in styles first; template engine later (doc 08) |
| WebView differences on Windows | portable build tested on a clean VM (doc 10) |
