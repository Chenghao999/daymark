# 10 · Build and Distribution

> 中文摘要：Windows 产出免安装版本，macOS 产出未签名 `.app`/`.dmg` 并说明
> `xattr -cr` 与“右键打开”。绿色版不写注册表，数据与配置都在用户选定路径。

## 1. Versioning

- SemVer: `MAJOR.MINOR.PATCH` in `package.json`, `src-tauri/Cargo.toml` and
  `tauri.conf.json` — keep all three equal.
- Pre-1.0: breaking data changes may ship in MINOR, but require a migration.
- The store has no schema version: `_categories.md` marks an initialised folder,
  and task metadata is read with fallbacks for missing keys. A change that
  removes or reinterprets a key is a breaking data change and needs a migration.
- An older build opening a newer folder must degrade, not corrupt it: unknown
  metadata keys are ignored and hand-written lines are preserved.

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

## 5. Data compatibility on upgrade

1. On open, check for `_categories.md`. If it is absent and `daymark.db` exists,
   run the one-time legacy migration (doc 05 §9).
2. There is no schema version or `PRAGMA user_version`. New fields are optional
   metadata; old files open with defaults.
3. Before a future destructive format change, copy the whole data folder to
   `backup-<version>-<timestamp>/` first, then rewrite, then verify by reopening.
4. On a parse error, report it and leave the file untouched — never overwrite a
   file that could not be read.
5. If the legacy rename fails, the Markdown data is still valid; the
   `daymark.db.migrated-*` file is left for manual cleanup.

## 6. Release artifacts

- `Daymark_<version>_<arch>.dmg` (macOS), `.zip` fallback.
- `daymark_<version>_x64-portable.zip` (Windows).
- `SHA256SUMS`.
- Release notes listing migrations, new features and known limitations.

## 7. Automated packaging · 自动打包

`.github/workflows/release.yml` builds the desktop installers:

- Trigger: pushing a tag that matches `v*`, or **Actions → Release → Run
  workflow**.
- Matrix: macOS arm64, macOS x64, Linux x64 (AppImage + deb), Windows x64
  (MSI + NSIS).
- Every run uploads the bundles as workflow artifacts. A tag push also creates
  a **draft GitHub Release** with the installers attached, so you can read the
  notes and publish it yourself.
- No signing keys are configured yet: macOS bundles and Windows installers are
  unsigned and trigger OS warnings (see §2, §3).

Cut a release from the repository root:

```bash
# bump package.json, src-tauri/Cargo.toml and src-tauri/tauri.conf.json together
npm run release            # verify, tag v<version>, push the tag
```

`npm run release` refuses to run when the two version fields disagree or the
tag already exists. Building locally does not need CI:

```bash
npm run app:build          # same as `npm run tauri build`
```

## 8. Trying it · 如何体验

Development window (hot reload):

```bash
npm ci
npm run app                # tauri dev; needs Node 22 + Rust stable
```

Prerequisites: macOS → Xcode Command Line Tools (`xcode-select --install`);
Windows → WebView2 Evergreen runtime; Linux → the packages listed in the
release workflow (`libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, …).

Installable build without CI:

```bash
npm run app:build
# macOS: src-tauri/target/release/bundle/dmg/*.dmg
# Windows: src-tauri/target/release/bundle/msi/*.msi, .../nsis/*.exe
```

Downloading a CI build: open the repository's **Actions → Release** run or the
draft release, download the artifact for your platform, and install it.
Unsigned macOS builds need right-click → Open (or `xattr -cr
/Applications/Daymark.app`); unsigned Windows installers show SmartScreen.
On first launch, choose a data folder — an empty folder is fine.
