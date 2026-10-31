# 17 · Troubleshooting

> 中文摘要：按“症状 → 原因 → 处理”组织。先做第 1 节的三项检查；数据问题优先
> 退出应用、确认同步状态、恢复文件夹备份。文档最后附问题报告模板，提交 issue
> 时请附上版本、系统、复现步骤和相关错误文本。

## 1. First three checks

Before changing anything, establish:

```bash
# 1. Which build and toolchain?
node --version
npm --version
rustc --version
cargo --version          # /opt/homebrew/opt/rustup/bin/cargo if not on PATH
rustup show

# 2. Where is the data folder, and which files exist?
ls -la "/path/to/chosen/folder"
find "/path/to/chosen/folder" -name '*.md' | head -20

# 3. Does a representative day file parse by eye?
sed -n '1,20p' "/path/to/chosen/folder/2026-10/2026-10-22.md"
```

Expected scaffolding: `_settings.md`, `_categories.md`, `_backlog.md`, and one
`YYYY-MM/YYYY-MM-DD.md` per day with tasks. A legacy `daymark.db.migrated-*` is
a backup, not a live file.

Also note the device ID shown in Settings. It identifies the writer in file
comments and is useful in every sync report.

**中文要点：** 先确认版本、数据文件夹是否存在、是否有四个基础文件和日期文件，
并记下设置页的设备 ID。

## 2. Startup and onboarding

| Symptom | Likely cause | Action |
|---|---|---|
| Welcome screen appears every launch | `dataDir` is empty or settings are not persisting | Choose the folder again. If it repeats, browser storage is blocked; check the WebView's site-data settings. |
| Folder picker does not open | Dialog permission missing or the plugin failed to initialise | Confirm `dialog:default` is in `src-tauri/capabilities/default.json`; rebuild. |
| App shows an error under the welcome card | The folder could not be created or listed | Read the error text; check the path exists and is writable; try another folder. |
| Window is blank but the process runs | Frontend failed to load | Run `npm run tauri dev` and check the terminal and WebView console. |
| App refuses to open on macOS | Unsigned build quarantined by Gatekeeper | Right-click → Open, or `xattr -cr Daymark.app`. |

**中文要点：** 每次启动都回到欢迎页，说明本机设置没保存住；先重新选文件夹，再
检查 WebView 的站点数据权限。

## 3. Storage errors

| Error / symptom | Cause | Action |
|---|---|---|
| `Store is not open` | Code read the repository before `openStore` succeeded | Re-select the folder; check the startup error banner. This is a bug if it happens after a successful onboarding. |
| `Store is not open` at launch | The chosen folder or mount is unavailable | Reconnect the drive; choose the folder again. |
| Writes fail but reads work | The folder is read-only, or a file is held by another program | Check permissions; close editors holding the file; try a local folder. |
| A file is not listed | Its name does not match `YYYY-MM-DD.md` inside a `YYYY-MM` folder, or it is a dotfile | Rename it to the canonical form; only `.md` files at depth ≤ 2 are scanned. |
| A hand-edited task disappears | The line lost its `- [ ]` prefix or its metadata comment became invalid JSON | Re-add the `- [ ]` form; keep the `<!-- daymark task {...} -->` comment on the following line. |
| A hand-added paragraph vanished | It was inside a section and looked like a task continuation | Put free text at the end of the file; Daymark preserves unrecognised lines as extras. |
| Tasks show as **Uncategorized** | Their `categoryId` points at an archived or deleted category | Reassign them, or restore the category in `_categories.md`. |
| Editing `_settings.md` has no effect | The JSON comment overrides the bullet list | Change the value in both places, or delete the JSON comment and reload. |
| `daymark.db` still exists | Migration did not run or the rename failed | Confirm `_categories.md` is absent; a failed rename leaves the file for manual cleanup. |

**中文要点：** `Store is not open` 多半是文件夹不可用；手改后任务消失通常是丢了
`- [ ]` 前缀或 JSON 注释损坏；`_settings.md` 里 JSON 注释优先于项目符号列表。

## 4. Sync and multiple devices

| Symptom | Cause | Action |
|---|---|---|
| Reload banner appears repeatedly | Sync client keeps touching files, another window is open, or an editor saved | Close other windows; let sync settle; reload once. |
| Tasks created on device B never appear on A | Sync not finished, or the devices point at different folders | Compare folder paths and the sync client's status. |
| Tasks disappeared after **Change folder** | The new folder was different (or empty) | Switch back to the old folder; the original files are unchanged. |
| Two copies of a day file (`2026-10-22 (1).md`, “conflict copy”) | The sync client preserved both versions | Compare the two files, keep the newer content under the canonical name, archive the other outside the synced folder. |
| The same day shows different tasks on two devices | Both edited that day offline; one file replaced the other | Choose the version to keep, copy in the missing task lines, then reload. |
| A whole day disappeared | The day file was deleted on another device | Restore it from backup or the sync client's version history. |
| `daymark.db.migrated-*` appears on every device | The legacy file was left in the synced folder after migration | Move it out of the synced folder; keep one copy as a backup. |
| `*.tmp` files appear briefly | Atomic writes in progress | Harmless; they are renamed immediately. |
| Last edits from one device are gone | Two devices edited the same day (last-writer-wins) | Restore from backup or the sync client's version history; follow doc 16 §4 afterwards. |

The full safe procedure is `16-data-sync-operations.md`.

**中文要点：** 多设备问题的根因几乎都是“同一天两台同时编辑”或“同步没完成”。
先停手，确认文件状态，再决定是否恢复备份。

## 5. Reports and export

| Symptom | Cause | Action |
|---|---|---|
| Report is empty | No completions and no scheduled tasks in the period | Check the period and the task dates; a monthly report may start on the 26th. |
| A completed task is missing | The completion is outside the period, or the task was reopened (which clears `completedAt`) | Complete it again inside the period, or widen the period. |
| A task appears as planned although it is done | It was completed outside the period | Expected for daily/weekly boundaries; check the completion date in the file. |
| The period looks wrong | Week start or assessment month/year differs from what you expect | Check Settings → Week starts on / Assessment month / Assessment year, or `_settings.md`. |
| A task is under “Uncategorized” | Its category was archived, or it never had one | Reassign the task to an active category. |
| Export button is disabled | The report has no sections | Add or schedule work in the period, or choose another period. |
| Export fails | Target folder not writable, path invalid, or IPC error | Choose a writable folder; read the error message in the status line. |
| Nothing happens after choosing a path | The save dialog returned `null` (cancel) | Not an error; run export again. |
| DOCX opens with unexpected styling | The export deliberately uses Word's built-in styles | Restyle in Word, or wait for the template engine (doc 08). |
| Chinese text looks wrong in the file name | Characters were sanitised (`\ / : * ? " < > |` → `-`) | Expected. |

**中文要点：** 报告边界由“周起始日/考核月起始日”决定；重新打开任务会清除完成
时间，所以它不再出现在历史报告里。

## 6. Language and labels

| Symptom | Cause | Action |
|---|---|---|
| Some labels stay in English | A key is missing from `zh-CN.json`; i18next falls back to `en` | Add the key to both locale files. |
| Language does not change | Settings were not persisted, or the i18n instance was not re-initialised | Change it in Settings; restart the app if needed. |
| Language resets on a new device | The setting lives in `_settings.md` and that file did not sync | Confirm `_settings.md` exists in the folder on both devices. |
| Dates use the wrong locale | `date-fns` locale not passed to `format` | Check the view's `locale` variable. |

**中文要点：** 出现英文兜底说明中文键缺失；两个语言文件的键集合必须完全一致。
语言本身保存在 `_settings.md`，会随文件夹同步。

## 7. Build and development

| Error | Cause | Action |
|---|---|---|
| `cargo: command not found` | Rust not installed, or the Homebrew rustup path is not on `PATH` | `brew install rustup`, then add `/opt/homebrew/opt/rustup/bin` before other entries in `~/.zshrc`; open a new shell. Run `/opt/homebrew/opt/rustup/bin/cargo check` directly if needed. |
| `rustup` is keg-only / wrong cargo | A second rustup exists in `~/.cargo/bin` | Put the Homebrew path first; verify with `which -a cargo`. Do not delete toolchains unless you intend to re-download them. |
| `error: linker not found` / missing SDK | Xcode command line tools absent | `xcode-select --install`. |
| `tauri: command not found` | Dependencies not installed | `npm install`. |
| Vite port 1420 in use | Another dev server is running | Stop it; `strictPort` is intentional. |
| `npm run build` fails on TypeScript | Strict mode error, unused symbol, or a type mismatch | Fix the reported file; `npm run typecheck` shows the same errors. |
| Tests fail after a domain change | The invariant changed or a fixture is stale | Update the test only if the new behaviour is intentional; document it in doc 14. |
| Tests fail after a format change | A Markdown fixture no longer matches the serializer | Update `tests/markdown.test.ts` / `settingsFile.test.ts` together with `storage/markdown.ts`. |
| `identifier`/bundle error | `tauri.conf.json` identifier conflicts | Use a unique reverse-DNS identifier. |
| Capability schema stale after adding a permission | Generated schemas were not rebuilt | Rebuild; `src-tauri/gen/schemas` is generated and ignored by git. |
| Build fails after cloning, a source folder is missing | A `.gitignore` pattern matches a source directory (for example an unanchored `reports/`) | Run `git check-ignore -v <path>`; anchor output-only patterns to the repository root (`/reports/`). |
| Windows build fails | Missing MSVC build tools or WebView2 | Install “Desktop development with C++” and WebView2. |

**中文要点：** 本机推荐用 Homebrew 的 rustup，并确保
`/opt/homebrew/opt/rustup/bin` 在 `PATH` 最前面；`gen/schemas` 是生成物，改完
权限要重新构建。

## 8. Platform notes

### macOS

- The build is unsigned; Gatekeeper needs right-click → Open once.
- `xattr -cr Daymark.app` removes the quarantine attribute.
- Moving the `.app` after installation is safe; data lives in the chosen folder,
  not inside the bundle.

### Windows

- WebView2 is required.
- The portable executable can run from a path with spaces or Chinese
  characters; test after copying to such a path.
- No registry configuration is written by Daymark itself.

### Both

- The data folder path is absolute and device-specific; never copy
  `localStorage` between machines.
- A folder on a network drive is slower and riskier than a local synced folder.
- Markdown files are UTF-8; do not save them with a legacy encoding — Chinese
  titles will become unreadable.

**中文要点：** macOS 未签名需右键打开；Windows 需要 WebView2；数据文件夹不要
放在网络共享盘上；`_settings.md` 与日期文件必须保存为 UTF-8。

## 9. When it is a known limitation, not a bug

Read `15-user-guide.md` §11 before filing an issue:

- day, backlog, settings and category conflicts are merged automatically (tasks
  by id/version, settings and categories per key/field); a merge that cannot
  order two edits keeps a `(conflict …)` copy and lists the item in Settings,
  where keep mine / keep theirs / keep both settles it;
- reopening a task clears its completion timestamp;
- archived categories cannot be restored in the UI;
- WebDAV sync is manual and never deletes;
- the AI assistant is opt-in, needs an API key and a network connection;
- no CalDAV, reminders, search or tags yet;
- no duration blocks in the week grid;
- reports use built-in Word styles.

## 10. Reporting a problem

Include:

1. Daymark version (`package.json` / app bundle version).
2. Operating system and version, and whether the build is dev or packaged.
3. Device ID from Settings.
4. Exact reproduction steps, with dates and report period if relevant.
5. The exact error text from the banner/status line, or the terminal output.
6. Whether a sync client is involved, and its state at the time.
7. The relevant `.md` file, with personal content replaced by dummy tasks.

Do **not** attach your real data folder publicly; it contains your tasks.
Create a minimal folder with dummy data if a file is required.
