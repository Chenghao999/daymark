# 10 · Build and Distribution

> 中文摘要：Windows 产出免安装版本，macOS 产出未签名 `.app`/`.dmg` 并说明
> `xattr -cr` 与“右键打开”。绿色版不写注册表，数据与配置都在用户选定路径。

## 1. Versioning

- SemVer: `MAJOR.MINOR.PATCH` in `package.json`, `src-tauri/Cargo.toml` and
  `tauri.conf.json` — keep all three equal.
- Pre-1.0: breaking data changes may ship in MINOR, but require a migration.
- The database records `schema_version`; a newer schema refuses to open in an
  older build.

## 2. macOS

```bash
npm run tauri build
# target: src-tauri/target/release/bundle/macos/Daymark.app
#         src-tauri/target/release/bundle/dmg/Daymark_<version>_<arch>.dmg
```

Unsigned distribution (F-24):

1. Zip the `.app` or ship the `.dmg`.
2. Tell users: right-click → Open, or
   `xattr -cr /Applications/Daymark.app`.
3. Document that Gatekeeper may still require System Settings → Privacy &
   Security → "Open Anyway".
4. Do not embed a hardened-runtime requirement or entitlements in 1.0.

Universal binary: build separately for `aarch64-apple-darwin` and
`x86_64-apple-darwin`, or use `--target universal-apple-darwin`.

## 3. Windows

Portable build (F-23):

```bash
npm run tauri build -- --target x86_64-pc-windows-msvc
```

- Prefer the raw `.exe` from `target/release/` or the MSI with a portable
  install path; do not write to `HKCU\Software` for configuration.
- WebView2 is required; document the Evergreen runtime link.
- Verify the app runs from a USB stick and stores nothing outside the chosen
  data folder and the OS app-data folder used by the WebView.

## 4. Green-build constraints

| Constraint | Check |
|---|---|
| No registry writes | portable build on a clean VM, diff registry before/after |
| No absolute paths baked in | move the app folder after install and relaunch |
| Data only in the chosen folder | delete app-data dir, relaunch, confirm onboarding |
| Templates and locales replaceable | swap a locale file, confirm the UI changes (P1) |

## 5. Database migration on upgrade

1. On open, read `PRAGMA user_version`.
2. If older than the build, copy `daymark.db` to `daymark.db.bak-<timestamp>`.
3. Apply migrations in order, each in a transaction.
4. Update `user_version`.
5. On failure, restore the backup and report a clear error.

## 6. Release artifacts

- `Daymark_<version>_<arch>.dmg` (macOS), `.zip` fallback.
- `daymark_<version>_x64-portable.zip` (Windows).
- `SHA256SUMS`.
- Release notes listing migrations, new features and known limitations.
