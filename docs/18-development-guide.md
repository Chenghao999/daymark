# 18 · Development Guide

> 中文摘要：开发环境、命令、代码约定和常见改动流程。目标是让任何人在拿到仓库
> 后 15 分钟内跑起来，并知道新增字段、视图、IPC 命令、迁移和文案时该改哪些
> 文件、补哪些文档和测试。

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
| `npm run tauri build` | Production bundle for the current platform. |
| `npm run tauri build -- --debug --no-bundle` | Fast sanity build without installers. |

Before every commit, run at least `npm run typecheck`, `npm test`, and
`cargo check` (from `src-tauri/`) when Rust changed.

**中文要点：** 提交前至少跑 `typecheck`、`test`；动过 Rust 再加 `cargo check`。

## 4. Code conventions

- TypeScript strict mode; `noUnusedLocals` and `noUnusedParameters` are on.
- ESM only (`"type": "module"`); no CommonJS `require`.
- React function components; state stays in `App.tsx` or the owning feature.
- No SQL outside `src/db/`.
- No business rules in components; put them in `src/domain/` and call them.
- All user-visible strings go through `useTranslation()`; add keys to **both**
  locale files.
- Dates: use `date-fns` and pass the `enUS`/`zhCN` locale; never hand-write
  month or weekday names.
- Rust stays minimal: plugin wiring and OS-level file operations. Put product
  logic in TypeScript.
- CSS lives in one file (`App.css`) with tokens on `:root`; reuse the existing
  classes rather than adding one-off styles.

**中文要点：** SQL 只在 `db/`；业务规则只在 `domain/`；UI 文案必须两种语言同步；
Rust 只做插件和系统文件操作。

## 5. Change playbooks

### 5.1 Add a task field

1. `src/db/schema.ts`: add the column (additive, with a default).
2. `src/domain/types.ts`: add the field to `Task`.
3. `src/db/repository.ts`: add it to `TASK_COLUMNS`, `TaskRow`, `toTask`,
   `createTask`, and `updateTask`.
4. `src/components/TaskEditor.tsx`: add the input to `TaskDraft` and the form.
5. `src/App.tsx`: copy the draft field into the edited task.
6. Add a test if the field affects derivation or state.
7. Update docs 05, 14, 15.

If the column is non-null, provide a default so existing databases remain valid.
If the change is destructive, add a versioned migration and a backup step first
(doc 05 §3).

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
3. If it uses a plugin capability, add the permission to
   `src-tauri/capabilities/default.json`.
4. Call it with `invoke("<name>", { ... })` from TypeScript; keep the argument
   names identical to the Rust parameter names.
5. Rebuild so `src-tauri/gen/schemas` regenerates.
6. Update docs 14, 17.

Prefer commands that do one OS-level thing. Anything expressible in TypeScript
should stay in TypeScript.

### 5.4 Add a report rule

1. Change `src/domain/reports.ts` only; keep it pure.
2. Add or update a case in `tests/reports.test.ts`.
3. If the rule needs new data, extend `ReportInput` and the repository query.
4. Update docs 08 and 14.

### 5.5 Add an i18n key

1. Add the key to `src/i18n/locales/en.json`.
2. Add the same key to `src/i18n/locales/zh-CN.json`.
3. Use `t("path.to.key")` in the component.
4. Interpolate with `{{name}}`, matching `t("key", { name })`.

A missing Chinese key silently falls back to English, which is why both files
must change together. Doc 09 defines the key policy.

### 5.6 Add a migration

1. Decide whether the change can be additive. Prefer additive.
2. For destructive changes, bump `PRAGMA user_version`, copy the database to a
   backup file, run the migration, then verify.
3. Keep `SCHEMA` idempotent for fresh databases.
4. Add a test or a documented manual verification.
5. Update docs 05, 12, 14.

Never mutate a user's database without a backup.

## 6. Testing

- Domain logic is tested with Vitest under `tests/`.
- Tests import `src/domain/*` directly; no Tauri or DOM mocks are required.
- The existing suite covers numbering and report derivation.
- When fixing a bug, add a test that fails before the fix and passes after.
- UI behaviour is currently verified manually; doc 11 lists the manual cases.

Run:

```bash
npm test
npm run typecheck
cd src-tauri && cargo check
```

**中文要点：** 修 bug 先补一个会失败的测试；领域测试不需要启动 Tauri。

## 7. Debugging

| Area | Technique |
|---|---|
| Frontend | `npm run tauri dev`; inspect the WebView console. React errors appear in the terminal and the console. |
| Rust | `cargo check` for fast feedback; `tauri dev` shows Rust build errors. |
| SQL | Open the database with `sqlite3 daymark.db` and inspect `.tables`, `.schema`, or rows. |
| Permissions | If a plugin call is denied, check `capabilities/default.json` and the generated schema. |
| Sync scanner | Set the scan interval to 30 s; watch the file mtime with `stat -f "%m %N" daymark.db` (macOS). |
| Report derivation | Call `generateReport` in a test with a minimal fixture. |

Daymark writes no log file. Errors are surfaced in the UI (banner or status
line) or the terminal in development.

## 8. Git workflow

- The default author for this repository is **Chenghao Li**
  (`git config user.name`); the email is the repository owner's.
- Commit in small, reviewable units. Suggested prefixes: `feat:`, `fix:`,
  `docs:`, `test:`, `build:`, `refactor:`.
- `package-lock.json` and `Cargo.lock` are committed.
- Never commit `daymark.db`, generated reports, tokens, or absolute local paths.
  `.gitignore` already covers databases, `dist/`, `node_modules/`, and Tauri
  target output.
- Do not rewrite published history on `main`.
- Before pushing: typecheck, tests, and a clean `git status`.

**中文要点：** 提交信息用 `feat/fix/docs/test/build/refactor:` 前缀；锁文件要提交；
数据库和生成报告绝不提交。

## 9. Release

The full checklist is `12-release-checklist.md`. Minimum sequence:

1. Bump the version in `package.json`, `src-tauri/Cargo.toml`, and
   `src-tauri/tauri.conf.json`.
2. Run `npm run typecheck`, `npm test`, `npm run build`, `cargo check`.
3. Build with `npm run tauri build`.
4. Launch the produced app, open an existing database, create/complete a task,
   export a DOCX, and switch language.
5. Verify a database created by the previous version still opens.
6. Write release notes, including the single-writer limitation.
7. Publish the bundle and `SHA256SUMS`.

**中文要点：** 三个版本号一起改；用旧版本数据库做一次升级验证；发布说明必须写
清“单写者”限制。

## 10. Documentation is part of the change

Update these in the same commit:

| Change | Document |
|---|---|
| File added/moved/deleted | 13 |
| Interface, command, permission, format | 14 |
| Schema or migration | 05, 14 |
| Sync behaviour | 06, 16 |
| User workflow | 15, 17 |
| Build/toolchain | 10, 18 |
| Locale keys/policy | 09 |

A pull request that changes behaviour without the matching document update is
incomplete, even if the code is correct.

**中文要点：** 文档更新是改动的一部分，和代码在同一个提交里完成。
