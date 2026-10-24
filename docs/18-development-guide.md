# 18 · Development Guide

> 中文摘要：开发环境、命令、代码约定和常见改动流程。目标是让任何人在拿到仓库
> 后 15 分钟内跑起来，并知道新增字段、视图、IPC 命令、文件格式变化和文案时该改
> 哪些文件、补哪些文档和测试。数据层是 `src/storage/`（Markdown 文件夹）。

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20+ | `node --version` |
| npm | bundled with Node | `package-lock.json` is committed; use `npm ci` for a clean install |
| Rust | stable | Install through rustup |
| Xcode command line tools | current | macOS only; `xcode-select --install` |
| WebView2 | current | Windows only |
| MSVC build tools | current | Windows only, “Desktop development with C++” |

### Installing Rust with Homebrew on macOS

The project only needs a working `cargo` and `rustc`. The recommended local
setup is Homebrew's rustup, which avoids Homebrew's large `rust` formula and its
LLVM dependency:

```bash
brew install rustup
# The formula is keg-only. Put its bin directory first:
echo 'export PATH="/opt/homebrew/opt/rustup/bin:$PATH"' >> ~/.zshrc
exec zsh
rustup toolchain install stable
rustup default stable
```

Verify:

```bash
which -a rustup cargo rustc
rustup show
cargo --version
```

If an older rustup exists in `~/.cargo/bin`, the PATH order decides which one
runs. Keep one manager authoritative; do not delete `~/.rustup` casually, because
that directory holds the toolchain cache.

**中文要点：** 用 `brew install rustup`，把 `/opt/homebrew/opt/rustup/bin` 放到
`PATH` 最前，再安装 stable 工具链。不要同时让两套 rustup 抢 PATH。

## 2. Install and run

```bash
git clone <repository-url> daymark
cd daymark
npm ci                # or npm install
npm run tauri dev     # desktop window with hot reload
```

A first `tauri dev` compiles the Rust dependencies and can take several minutes.
Later runs reuse `src-tauri/target/`.

**中文要点：** 首次 `npm run tauri dev` 会编译 Rust 依赖，需要几分钟；之后有缓存。

## 3. Scripts

| Command | Effect |
|---|---|
| `npm run dev` | Vite dev server only (no desktop shell). |
| `npm run tauri dev` | Full desktop app; starts Vite on port 1420. |
| `npm run build` | `tsc` then `vite build` into `dist/`. |
| `npm run typecheck` | `tsc --noEmit` over `src/`. Tests are not included. |
| `npm test` | Vitest run once. |
| `npm run test:watch` | Vitest watch mode. |
| `npm run test:coverage` | Vitest with V8 coverage; writes `coverage/` (git-ignored). |
| `npm run verify` | `typecheck` + `test` + `build` in one command. |
| `npm run tauri build` | Production bundle for the current platform. |
| `npm run tauri build -- --debug --no-bundle` | Fast sanity build without installers. |

Before every commit, run at least `npm run typecheck`, `npm test`, and a Rust
check when `src-tauri/` changed. `npm run verify` bundles the first three
(frontend) checks. If `cargo` is not on `PATH`, use the absolute path:

```bash
/opt/homebrew/opt/rustup/bin/cargo check --manifest-path src-tauri/Cargo.toml
```

**中文要点：** 提交前至少跑 `typecheck`、`test`；动过 Rust 再加 `cargo check`，
cargo 不在 PATH 时用 `/opt/homebrew/opt/rustup/bin/cargo`。

### 3.1 Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

| Job | Runner | Steps |
|---|---|---|
| `frontend` | `ubuntu-latest` | `npm ci` → typecheck → `npm run test:coverage` → `npm run build`; uploads `coverage/` as an artifact |
| `rust` | `macos-latest` | `cargo check --locked --manifest-path src-tauri/Cargo.toml` with a cached `src-tauri/target` |

Runs for the same branch are cancelled when a newer commit arrives. The README
badge points at this workflow. Treat a red run as a merge blocker: reproduce
locally with `npm run verify` and the cargo command above, then push the fix.

**中文要点：** CI 在每次推送 `main` 和每个 PR 上运行前端检查与 Rust 检查；同一分支
的新提交会取消旧运行。红色状态不得合并，先在本地用 `npm run verify` 和 cargo 命令
复现。

## 4. Code conventions

- TypeScript strict mode; `noUnusedLocals` and `noUnusedParameters` are on.
- ESM only (`"type": "module"`); no CommonJS `require`.
- React function components; state stays in `App.tsx` or the owning feature.
- Markdown parsing and serialization live only in `src/storage/markdown.ts`.
  No other module builds file text.
- Filesystem access goes through `src/storage/fs.ts`; components never call
  `invoke` directly.
- SQL exists only in `src/storage/migrate.ts`, and only for the one-time legacy
  conversion. Do not add runtime SQL.
- No business rules in components; put them in `src/domain/` and call them.
- All user-visible strings go through `useTranslation()`; add keys to **both**
  locale files.
- Dates: use `date-fns` and pass the `enUS`/`zhCN` locale; never hand-write
  month or weekday names.
- Rust stays minimal: plugin wiring and OS-level file operations. Put product
  logic in TypeScript.
- CSS lives in one file (`App.css`) with tokens on `:root`; reuse the existing
  classes rather than adding one-off styles.

**中文要点：** 文件格式只在 `markdown.ts`；文件访问只走 `storage/fs.ts`；SQL 只
存在于迁移模块；业务规则只在 `domain/`；UI 文案必须两种语言同步。

### 4.1 Every module is called through its interface

A module is a boundary, not a folder to reach into. Callers import the
functions and types a module exports; they never import its private helpers,
and they never assume how it stores state. The full signature list is in
doc 14; the table below is the map of who may call what.

| Module | Public interface | Allowed callers | Isolated test / debug |
|---|---|---|---|
| `domain/types.ts` | `Task`, `Category`, `Completion`, report types | every layer | type-only |
| `domain/tasks.ts` | `NewTaskInput`, `hasSchedule`, `normalizeStatus`, `scheduleTask`, `unscheduleTask`, `completeTask`, `reopenTask`, `sortTasks` | `storage/repository.ts`, tests | pure functions, no setup |
| `domain/periods.ts` | `reportPeriod`, `PeriodOptions`, `ReportPeriod` | reports, features | fixed `anchor` + options |
| `domain/reports.ts` | `generateReport`, `reportTitle`, `uncategorizedLabel` | features, tests | in-memory fixtures |
| `storage/repository.ts` | `listTasks`, `listCategories`, `createTask`, `updateTask`, `softDeleteTask`, `completeTask`, `reopenTask`, `listCompletions`, `createCategory`, `archiveCategory` | `App.tsx`, `ReportsView` | open a temp folder, call the function |
| `storage/client.ts` | `openStore`, `closeStore`, `getStoreState`, `getStoreRoot`, `deviceId` | `App.tsx`, `storage/repository.ts` | point at a fixture folder |
| `storage/markdown.ts` | `parseMarkdown`, `serializeMarkdown`, `parseCategoriesMarkdown`, `serializeCategoriesMarkdown` | client, repository, migration | one string in, one string out |
| `storage/fs.ts` | file primitives plus `treeSignature` | the storage modules and the scanner | the only module that calls `invoke` |
| `storage/settingsFile.ts` | `loadSyncedSettings`, `saveSyncedSettings` (plus the codec) | `App.tsx` | read or write `_settings.md` by hand |
| `storage/migrate.ts` | `migrateLegacyDatabase` | `client.ts` only | copy a legacy folder, run once |
| `sync/scanner.ts` | `startFolderScanner(options) → { stop, touch }` | `App.tsx` | inject a recording `onExternalChange` |
| `sync/webdav/engine.ts` | `syncWebDav(config, root, options) → SyncResult` | `App.tsx` | fake `WebDavClient`/`ManifestIo`, or unit-test `planSync` alone |
| `sync/webdav/plan.ts` | `planSync(local, remote, baseline) → SyncPlan` | `engine.ts`, tests | pure maps in, plan out |
| `sync/webdav/client.ts` | `WebDavClient` and the URL/PROPFIND helpers | `engine.ts`, `App.tsx` (test button), tests | unit-test helpers; network goes through `webdav_request` |
| `sync/webdav/manifest.ts` | `localManifest(root, io?)`, `sha256` | `engine.ts`, tests | inject `ManifestIo` |
| `settings/webdav.ts` | `loadWebDavSettings`, `saveWebDavSettings`, `isWebDavConfigured` | `App.tsx` | stub `localStorage` |
| `ai/index.ts` | `createAiProvider`, `buildPrompt`, `buildTaskPrompt`, `parseTaskResponse`, `reportOutline`, `aiContextSummary`, `saveAiOutput`, types | `AiPanel.tsx`, `TaskEditor.tsx` | fake provider object; test the pure helpers alone |
| `ai/prompts.ts` | `buildPrompt(request) → {system,user}` | `ai/index.ts`, tests | fixed `ReportDocument` in, strings out |
| `ai/context.ts` | `reportOutline`, `aiContextSummary` | prompts, tests | pure |
| `ai/tasks.ts` | `buildTaskPrompt`, `TASK_SUGGESTION_SCHEMA`, `parseTaskResponse` | `TaskEditor.tsx`, tests | pure: fixed `Date` + JSON string in, suggestions out |
| `ai/providers/anthropic.ts` | `AnthropicProvider` (`complete`, `completeJson`) | `ai/index.ts` only | network; not unit-tested |
| `ai/output.ts` | `aiOutputPath`, `saveAiOutput` | `AiPanel.tsx` | `aiOutputPath` is pure; write via a temp folder |
| `ai/usage.ts` | `estimateTokens`, `estimatePrompt` | `AiPanel.tsx`, tests | pure strings in, token counts out |
| `settings/ai.ts` | `loadAiSettings`, `saveAiSettings`, `isAiConfigured`, `AI_MODELS` | `App.tsx`, `ReportsView` | stub `localStorage` |
| `settings/store.ts` | `AppSettings`, `SyncedSettings`, `loadSettings`, `saveSettings`, `sanitize`, `syncedPart` | `App.tsx`, `i18n`, `SettingsView`, `storage/settingsFile.ts` | stub `localStorage` |

Rules that keep this useful:

1. Dependencies point one way: `features` → `storage` / `domain` / `sync` /
   `settings`. `domain` imports no other layer; `storage` imports no feature.
2. A UI component never imports `storage/fs.ts`, `storage/markdown.ts` or
   `storage/client.ts`. It calls the repository, or receives data as props.
3. The repository never imports React or touches the DOM; it only changes the
   in-memory store and writes files.
4. When a public signature changes, update doc 14 and every caller in the same
   commit. That is the contract.
5. To debug a layer, call its interface directly instead of driving the whole
   app: `parseMarkdown` with a copied day file, `generateReport` with a fixture,
   `startFolderScanner` with a callback that logs. If a layer cannot be called
   this way, it has leaked a dependency and the boundary should be fixed.

**中文要点：** 每个模块只通过导出的函数和类型被调用，调用方不碰内部文件、不假设
内部存储方式。模块之间单向依赖；UI 只调 repository；改公开签名必须同一次提交
更新文档 14 和所有调用方。调试时直接调用该模块的接口（给一个固定输入看输出），
而不是启动整个应用——如果做不到，说明该模块的依赖泄漏了，应先修边界。

## 5. Change playbooks

### 5.1 Add a task field

1. `src/domain/types.ts`: add the field to `Task`.
2. `src/storage/markdown.ts`: add it to `TaskMeta`, `toStoredTask` and
   `serializeEntry` so it round-trips.
3. `src/storage/repository.ts`: set a default in `createTask` and preserve it in
   `updateTask`.
4. `src/components/TaskEditor.tsx`: add the input to `TaskDraft` and the form.
5. `src/App.tsx`: copy the draft field into the edited task.
6. Add a round-trip case in `tests/markdown.test.ts`.
7. Update docs 05, 14, 15.

Provide a fallback for old files (a missing metadata key must not break
parsing). A destructive format change needs a migration and a documented
verification step (doc 05 §8).

### 5.2 Add a view

1. Create `src/features/<name>/<Name>View.tsx`.
2. Add the name to the `View` union in `App.tsx`.
3. Add the sidebar entry (the nav maps over the union).
4. Render the component in the content section.
5. Add `nav.<name>` to both locale files.
6. Style in `App.css`.
7. Update docs 13, 14, 15.

### 5.3 Add a native command

1. Write the `#[tauri::command]` in `src-tauri/src/lib.rs`.
2. Register it in `tauri::generate_handler![...]`.
3. Add a typed wrapper in `src/storage/fs.ts`.
4. If it uses a plugin capability, add the permission to
   `src-tauri/capabilities/default.json`.
5. Rebuild so `src-tauri/gen/schemas` regenerates.
6. Update docs 14, 17.

Prefer commands that do one OS-level thing. Anything expressible in TypeScript
should stay in TypeScript.

### 5.4 Add a report rule or period

1. Change `src/domain/reports.ts` or `src/domain/periods.ts`; keep them pure.
2. Add or update a case in `tests/reports.test.ts` / `tests/periods.test.ts`.
3. If the rule needs new data, extend `ReportInput` and the repository query.
4. Update docs 08 and 14.

### 5.5 Add an i18n key

1. Add the key to `src/i18n/locales/en.json`.
2. Add the same key to `src/i18n/locales/zh-CN.json`.
3. Use `t("path.to.key")` in the component.
4. Interpolate with `{{name}}`, matching `t("key", { name })`.

A missing Chinese key silently falls back to English, which is why both files
must change together. Doc 09 defines the key policy.

### 5.6 Change the file format

1. Prefer an additive metadata key with a safe fallback.
2. Change `src/storage/markdown.ts` only; never spread the grammar.
3. Add a round-trip test to `tests/markdown.test.ts` (and
   `tests/settingsFile.test.ts` for settings).
4. Verify: open an existing folder, save a task, reopen, compare `git diff` of
   the Markdown files.
5. If existing files must be rewritten, write a migration in
   `src/storage/migrate.ts`, run it once, and keep the old data recoverable.
6. Update docs 05, 12, 14.

Never rewrite a user's files without a recoverable copy.

## 6. Testing

- Domain and format logic is tested with Vitest under `tests/`.
- `tests/domain` cases import `src/domain/*` directly; format cases import
  `src/storage/markdown.ts` and `src/storage/settingsFile.ts`. Neither needs a
  Tauri or DOM mock.
- The suite covers numbering, report derivation, period boundaries, Markdown
  round-trip and settings parsing.
- When fixing a bug, add a test that fails before the fix and passes after.
- UI behaviour is currently verified manually; doc 11 lists the manual cases.

Run:

```bash
npm test
npm run typecheck
/opt/homebrew/opt/rustup/bin/cargo check --manifest-path src-tauri/Cargo.toml
```

**中文要点：** 修 bug 先补一个会失败的测试；领域和格式测试都不需要启动 Tauri；
cargo 不在 PATH 时用绝对路径。

## 7. Debugging

Every module can be exercised through its exported interface without starting
the app (see §4.1). Prefer that when the bug is inside one layer.

| Area | Technique |
|---|---|
| Single module | Import its interface in a temporary Vitest case and feed it a fixture: `parseMarkdown` a copied file, `generateReport` a handful of tasks, `reportPeriod` a fixed date. |
| Frontend | `npm run tauri dev`; inspect the WebView console. React errors appear in the terminal and the console. |
| Rust | `cargo check` for fast feedback; `tauri dev` shows Rust build errors. |
| Data store | Open the day file in any editor; a task is one line plus one comment. `git diff` the folder to see exactly what a save changed. |
| Legacy data | `sqlite3 daymark.db.migrated-* ".tables"` only when investigating a migration. |
| Permissions | If a plugin call is denied, check `capabilities/default.json` and the generated schema. |
| Sync scanner | Set the scan interval to 30 s; watch the folder with `ls -lT` (macOS) and confirm the banner fires once. |
| Report derivation | Call `generateReport` in a test with a minimal fixture. |

Daymark writes no log file. Errors are surfaced in the UI (banner or status
line) or the terminal in development.

**中文要点：** 调试数据问题最直接的办法是打开当天的 `.md` 文件，或对整个文件夹
做一次 `git diff`；没有任何日志文件。

## 8. Git workflow

- The default author for this repository is **Chenghao Li**
  (`git config user.name`); the email is the repository owner's.
- Commit in small, reviewable units. Suggested prefixes: `feat:`, `fix:`,
  `docs:`, `test:`, `build:`, `refactor:`.
- `package-lock.json` and `Cargo.lock` are committed.
- Never commit a real data folder, generated reports, tokens, or absolute local
  paths. `.gitignore` covers databases, `dist/`, `node_modules/`, and Tauri
  target output; add your personal data folder if you keep it inside the repo.
- `daymark.db.migrated-*` is user data and must never be committed.
- Do not rewrite published history on `main`.
- Before pushing: typecheck, tests, and a clean `git status`.

**中文要点：** 提交信息用 `feat/fix/docs/test/build/refactor:` 前缀；锁文件要提交；
真实数据文件夹和迁移备份绝不提交。

## 9. Release

The full checklist is `12-release-checklist.md`. Minimum sequence:

1. Bump the version in `package.json`, `src-tauri/Cargo.toml`, and
   `src-tauri/tauri.conf.json`.
2. Run `npm run typecheck`, `npm test`, `npm run build`, and the Rust check.
3. Build with `npm run tauri build`.
4. Launch the produced app, choose a folder, create/complete a task, check the
   day file, export a DOCX, and switch language.
5. Verify a folder written by the previous version still opens, and run a
   migration from a legacy `daymark.db` once.
6. Write release notes, including the one-editor-per-day limitation.
7. Publish the bundle and `SHA256SUMS`.

**中文要点：** 三个版本号一起改；用旧版本的数据文件夹做一次升级验证，并跑一次
旧库迁移；发布说明必须写清“同一天只由一台设备编辑”的限制。

## 10. Documentation is part of the change

Update these in the same commit:

| Change | Document |
|---|---|
| File added/moved/deleted | 13 |
| Interface, command, permission, format | 14 |
| File format, metadata key, migration | 05, 14 |
| Sync behaviour | 06, 16 |
| User workflow | 15, 17 |
| Build/toolchain | 10, 18 |
| Locale keys/policy | 09 |

A pull request that changes behaviour without the matching document update is
incomplete, even if the code is correct.

**中文要点：** 文档更新是改动的一部分，和代码在同一个提交里完成。
