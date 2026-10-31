# 12 · Release Checklist

> 中文摘要：每次发版前逐项核对，重点检查 Markdown 格式兼容、迁移幂等、多语言键
> 补齐、绿色版无绝对路径、macOS 未嵌入签名依赖、报告模板随包分发。

## Before tagging

- [ ] Version bumped in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
- [ ] CI green on `main` (`.github/workflows/ci.yml`; README badge shows it).
- [ ] `npm run verify` green locally (typecheck, tests, build).
- [ ] The Release workflow has built all four targets (macOS arm64/x64, Linux,
      Windows) at least once since the last dependency change.
- [ ] `npm run test:coverage` completes and the report looks sane.
- [ ] A fresh clone builds: `npm ci && npm run build && (cd src-tauri && cargo check)`.
- [ ] `git status --ignored --short` shows no source directory; every ignored
      path is generated output or user data.
- [ ] `cargo check` green in `src-tauri/` (use
      `/opt/homebrew/opt/rustup/bin/cargo` when cargo is not on `PATH`).
- [ ] `npm run build` produces `dist/` without warnings that hide errors.
- [ ] No `console.log` left in shipped code (warnings acceptable).
- [ ] No hard-coded user paths, device IDs or test data.

## Data safety

- [ ] A folder written by the previous version still opens without rewriting
      every file.
- [ ] Markdown changes are backward-compatible, or a documented migration
      rewrites the affected files.
- [ ] Migration runs twice without changing the result (idempotent).
- [ ] A folder with an unrelated or unreadable `daymark.db` fails with a clear
      message, not a silent partial migration.
- [ ] The legacy database is renamed (`daymark.db.migrated-*`), never deleted.
- [ ] Every write goes through the temp-file + rename path.

## Localisation

- [ ] `en.json` and `zh-CN.json` have identical key sets.
- [ ] No user-visible string is hard-coded in components.
- [ ] Language switch works without a restart.
- [ ] Dates use the locale, not hand-written month names.

## Builds

### macOS

- [ ] `.app` launches from `/Applications` after `xattr -cr`.
- [ ] No codesign identity embedded; docs explain right-click Open.
- [ ] Move the app after install; relaunch; data path still works.

### Windows

- [ ] Portable build runs from a path with spaces and Chinese characters.
- [ ] No registry writes for configuration.
- [ ] WebView2 requirement documented.
- [ ] Uninstall/delete leaves no data outside the chosen folder.

## Reports

- [ ] Daily, weekly, monthly and yearly export open in Word and LibreOffice.
- [ ] Category numbering matches the configured style.
- [ ] Week start and assessment month/year boundaries match the Settings values.
- [ ] Empty periods export gracefully or disable the button.
- [ ] Filename sanitisation handles `/ \ : * ? " < > |`.

## Distribution

- [ ] `SHA256SUMS` generated and published.
- [ ] Release notes list format changes, features and known limitations.
- [ ] Known limitation documented: the built-in WebDAV sync merges day/backlog
      tasks and per-key settings/categories, offers keep mine / keep theirs /
      keep both for what it cannot order, but files delivered by a desktop sync
      client are still file-level last-writer-wins and task deletions are not
      merged.
- [ ] License and third-party notices included.
