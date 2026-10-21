# 12 · Release Checklist

> 中文摘要：每次发版前逐项核对，重点检查迁移幂等、多语言键补齐、绿色版无绝对
> 路径、macOS 未嵌入签名依赖、报告模板随包分发。

## Before tagging

- [ ] Version bumped in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
- [ ] `npm test` green.
- [ ] `npm run typecheck` green.
- [ ] A fresh clone builds: `npm ci && npm run build && (cd src-tauri && cargo check)`.
- [ ] `git status --ignored --short` shows no source directory; every ignored
      path is generated output or user data.
- [ ] `cargo check` green in `src-tauri/`.
- [ ] `npm run build` produces `dist/` without warnings that hide errors.
- [ ] No `console.log` left in shipped code (warnings acceptable).
- [ ] No hard-coded user paths, device IDs or test data.

## Data safety

- [ ] Every schema change is additive or has a versioned migration.
- [ ] Migration runs twice without changing the result (idempotent).
- [ ] A pre-migration backup is written and restorable.
- [ ] A database with `user_version` newer than the build is refused with a
      clear message, not silently modified.

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

- [ ] Daily, weekly and monthly export open in Word and LibreOffice.
- [ ] Category numbering matches the configured style.
- [ ] Empty periods export gracefully or disable the button.
- [ ] Filename sanitisation handles `/ \ : * ? " < > |`.

## Distribution

- [ ] `SHA256SUMS` generated and published.
- [ ] Release notes list migrations, features and known limitations.
- [ ] Known limitation documented: P1 automatic merge is not shipped; two
      offline writers are preserved only at the file level.
- [ ] License and third-party notices included.
