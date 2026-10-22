# 04 · Technical Architecture

> 中文摘要：Tauri 2 + React + TypeScript 前端，Rust 侧只承担插件与文件操作；
> 数据以 Markdown 文件夹存放，由 `src/storage/` 解析与序列化；模块边界为领域
> 逻辑、存储访问、同步扫描、界面四层。Electron 作为降级方案保留。

## 1. Stack decision

| Option | Verdict | Reason |
|---|---|---|
| **Tauri 2** | chosen | 2–20 MB bundles, low memory, portable exe and unsigned `.app` fit the green-build requirement |
| Electron | fallback | no Rust, but 100 MB+ and heavier background footprint |
| Native (Swift/C#) | rejected | two codebases, no shared UI |

Rust is used where it is strictly better: the shell, plugin wiring, directory
listing and atomic file writes. Business logic and the Markdown format stay in
TypeScript so they can be unit-tested with Vitest without a Rust build. SQLite
survives only as a one-time migration source (`@tauri-apps/plugin-sql`).

## 2. Runtime model

```
┌──────────────────────── Tauri window (WebView) ───────────────────────┐
│ React UI                                                              │
│   features/calendar  features/reports  features/settings              │
│   components/TaskEditor                                               │
│        │                                                              │
│   domain/  ── pure functions: state machine, periods, reports         │
│        │                                                              │
│   storage/ ── Markdown parse/serialize + in-memory store + repository  │
│   sync/    ── scanner: invoke("tree_signature") every N seconds        │
└───────────────┬───────────────────────────────────────────────────────┘
                │ invoke commands (read/write/rename/list)
                ▼
      user-chosen folder of .md files        Rust: metadata / atomic rename
```

There is no background daemon and no network listener.

## 3. Module boundaries

| Module | Owns | Must not |
|---|---|---|
| `domain/` | task state machine, period math, report derivation, numbering | touch the filesystem, DOM or Tauri APIs |
| `storage/` | Markdown format, in-memory store, repository, migration | contain report or numbering rules |
| `sync/` | folder-signature polling and external-change signal | write to the store |
| `features/` | view state and user interaction | parse Markdown or call `invoke` directly |
| `settings/` | device-local preferences and the synced settings model | hold task data |
| `src-tauri/` | plugins, file commands, window | contain product rules |

This is what makes F-25 (modular deployment) possible: reports can be replaced
without touching storage, and a future WebDAV or AI module can be added as a
separate feature module.

## 4. Data flow

1. Launch → settings from `localStorage` (device-local) → `openStore(root)`.
2. `openStore` reads `_categories.md`, then `_backlog.md`, then every
   `YYYY-MM/*.md` day file up to depth 2, building `StoreState` in memory.
3. Views read from the repository, which filters and sorts the in-memory tasks.
4. User action → repository writes the affected day file (or `_backlog.md`)
   atomically → scanner `touch()` re-baselines the folder signature so Daymark's
   own write is not mistaken for an external change.
5. External change → signature differs → reload banner → user reloads →
   `openStore` runs again.

## 5. Where settings live

Settings are deliberately split:

- **Synced** (`_settings.md` in the data folder): language, week start,
  assessment month start day, assessment year start month, numbering, scan
  interval, report signature name. These describe the plan, so a report
  generated on either machine matches.
- **Device-local** (`localStorage`): the `dataDir` path only. The same synced
  folder has a different absolute path on each machine, so the path can never
  live inside the folder — that would be circular and would fight the sync
  client.

`_settings.md` carries a human-readable bullet list and a machine-readable
`<!-- daymark settings {...} -->` comment. The parser prefers the JSON and falls
back to the bullets, so either can be hand-edited.

## 6. Report generation

Report generation is a pure function from `(tasks, completions, categories,
period, numbering)` to a `ReportDocument`. `reportPeriod` is part of `domain/`
and takes `weekStartsOn`, `assessmentMonthStartDay` and
`assessmentYearStartMonth`, so calendar and report boundaries cannot drift.
DOCX export is a second, isolated step (`features/reports/exportDocx.ts`) using
the `docx` package and Word's built-in styles.

## 7. Packaging

Tauri bundles one executable per platform plus the WebView assets. Language
files are bundled but loaded through i18next, so a future external-resource
mode only needs a different loader. No data folder ships with the app; the user
creates it on first run.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Rust toolchain blocks contributors | Rust surface kept to file primitives (~190 lines); Electron fallback documented |
| Many small files on a sync folder | one file per day, atomic rename, folder signature polling; merge is P1 (doc 06) |
| Two writers replace different day files | per-day files mean most concurrent edits do not collide at all |
| Sync client captures a mid-write file | temp file + rename; never write in place |
| `docx` output diverges from Word templates | built-in styles first; template engine later (doc 08) |
| WebView differences on Windows | portable build tested on a clean VM (doc 10) |
