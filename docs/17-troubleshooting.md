# 17 · Troubleshooting

> 中文摘要：按“症状 → 原因 → 处理”组织。先做第 1 节的三项检查；数据问题优先
> 退出应用、确认同步状态、恢复备份。文档最后附问题报告模板，提交 issue 时请
> 附上版本、系统、复现步骤和相关错误文本。

## 1. First three checks

Before changing anything, establish:

```bash
# 1. Which build and toolchain?
node --version
npm --version
rustc --version
cargo --version
rustup show

# 2. Where is the database, and does it exist?
ls -l "/path/to/chosen/folder/daymark.db"

# 3. Is the file valid SQLite with the expected tables?
sqlite3 "/path/to/chosen/folder/daymark.db" ".tables"
```

Expected tables: `categories`, `tasks`, `task_completions`, `sync_meta`,
`report_runs`.

Also note the device ID shown in Settings. It identifies the writer in
`sync_meta` and is useful in every sync report.

**中文要点：** 先确认版本、数据库文件是否存在、表是否完整，并记下设置页的设备 ID。

## 2. Startup and onboarding

| Symptom | Likely cause | Action |
|---|---|---|
| Welcome screen appears every launch | `dataDir` is empty or settings are not persisting | Choose the folder again. If it repeats, browser storage is blocked; check the WebView's site-data settings. |
| Folder picker does not open | Dialog permission missing or the plugin failed to initialise | Confirm `dialog:default` is in `src-tauri/capabilities/default.json`; rebuild. |
| App shows an error under the welcome card | Database open failed (bad path, permission, corrupt file) | Read the error text; check the path exists and is writable; try another folder. |
| Window is blank but the process runs | Frontend failed to load | Run `npm run tauri dev` and check the terminal and WebView console. |
| App refuses to open on macOS | Unsigned build quarantined by Gatekeeper | Right-click → Open, or `xattr -cr Daymark.app`. |

**中文要点：** 每次启动都回到欢迎页，说明本机设置没保存住；先重新选文件夹，再
检查 WebView 的站点数据权限。

## 3. Database errors

| Error / symptom | Cause | Action |
|---|---|---|
| `Database is not open` | Code called the repository before `openDatabase` succeeded | Re-select the folder; check the startup error banner. This is a bug if it happens after a successful onboarding. |
| Writes fail but reads work | Missing `sql:allow-execute` capability | Add it to `capabilities/default.json` and rebuild. `sql:default` alone grants only load/select/close. |
| `database is locked` | Another Daymark window/process, or a sync client holds the file | Quit all Daymark instances; pause the sync client; reopen. |
| `unable to open database file` | Folder missing, drive unmounted, or no write permission | Reconnect the drive; check permissions; choose the folder again. |
| Tables missing | The file is not a Daymark database, or schema creation failed | Check `.tables`; if it is an unrelated SQLite file, choose another folder. |
| File grows but the UI shows nothing | Opened a different database than expected | Compare the path in Settings with the file you inspected. |

**中文要点：** 能读不能写，九成是缺少 `sql:allow-execute`；`database is locked`
通常是另一个窗口或同步客户端占着文件。

## 4. Sync and multiple devices

| Symptom | Cause | Action |
|---|---|---|
| Conflict banner appears repeatedly | Sync client keeps touching the file, another window is open, or mtime changes | Close other windows; let sync settle; reload once. |
| Tasks created on device B never appear on A | Sync not finished, or the devices point at different folders | Compare folder paths and the sync client's status. |
| Tasks disappeared after **Change folder** | The new folder held a different (or empty) database | Switch back to the old folder; the original file is unchanged. |
| Two database files (`daymark (1).db`, “conflict copy”) | The sync client preserved both versions | Decide which is newer, keep it as `daymark.db`, archive the other outside the synced folder. |
| Sidecar files `-wal`, `-shm`, `-journal` present | SQLite journal mode / an unclean shutdown | Keep them together with the `.db`; quit the app before hand-off. |
| Reload shows partial data | The file was still downloading | Wait for sync completion and reload again; restore a backup if the file is inconsistent. |
| Last edits from one device are gone | Two devices wrote while both were open (last-writer-wins) | Restore from backup or the sync client's version history; follow doc 16 §4 afterwards. |

The full safe procedure is `16-data-sync-operations.md`.

**中文要点：** 多设备问题的根因几乎都是“两台同时打开”或“同步没完成”。先停手，
确认文件和同步状态，再决定是否恢复备份。

## 5. Reports and export

| Symptom | Cause | Action |
|---|---|---|
| Report is empty | No completions and no scheduled tasks in the period | Check the period (weeks are Monday–Sunday) and the task dates. |
| A completed task is missing | The completion is outside the period, or the task was reopened (which deletes completions) | Complete it again inside the period, or widen the period. |
| A task appears as planned although it is done | It was completed outside the period; completion attribution wins only inside the period | Expected for daily/weekly boundaries; check the completion date. |
| A task is under “Uncategorized” | Its category was archived, or it never had one | Reassign the task to an active category. |
| Export button is disabled | The report has no sections | Add or schedule work in the period, or choose another period. |
| Export fails | Target folder not writable, path invalid, or IPC error | Choose a writable folder; read the error message in the status line. |
| Nothing happens after choosing a path | The save dialog returned `null` (cancel) | Not an error; run export again. |
| DOCX opens with unexpected styling | The export deliberately uses Word's built-in styles | Restyle in Word, or wait for the template engine (doc 08). |
| Chinese text looks wrong in the file name | Characters were sanitised (`\ / : * ? " < > |` → `-`) | Expected. |

**中文要点：** 日报/周报的边界是本地自然日；重新打开任务会删除完成记录，所以它
不再出现在历史报告里。

## 6. Language and labels

| Symptom | Cause | Action |
|---|---|---|
| Some labels stay in English | A key is missing from `zh-CN.json`; i18next falls back to `en` | Add the key to both locale files. |
| Language does not change | Settings were not persisted, or the i18n instance was not re-initialised | Change it in Settings; restart the app if needed. |
| Dates use the wrong locale | `date-fns` locale not passed to `format` | Check the view's `locale` variable. |

**中文要点：** 出现英文兜底说明中文键缺失；两个语言文件的键集合必须完全一致。

## 7. Build and development

| Error | Cause | Action |
|---|---|---|
| `cargo: command not found` | Rust not installed, or the Homebrew rustup path is not on `PATH` | `brew install rustup`, then add `/opt/homebrew/opt/rustup/bin` before other entries in `~/.zshrc`; open a new shell. |
| `rustup` is keg-only / wrong cargo | A second rustup exists in `~/.cargo/bin` | Put the Homebrew path first; verify with `which -a cargo`. Do not delete toolchains unless you intend to re-download them. |
| `error: linker not found` / missing SDK | Xcode command line tools absent | `xcode-select --install`. |
| `tauri: command not found` | Dependencies not installed | `npm install`. |
| Vite port 1420 in use | Another dev server is running | Stop it; `strictPort` is intentional. |
| `npm run build` fails on TypeScript | Strict mode error, unused symbol, or a type mismatch | Fix the reported file; `npm run typecheck` shows the same errors. |
| Tests fail after a domain change | The invariant changed or a fixture is stale | Update the test only if the new behaviour is intentional; document it in doc 14. |
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

- SQLite file paths are absolute and device-specific; never copy
  `localStorage` between machines.
- A database on a network drive is slower and riskier than a local synced
  folder.

**中文要点：** macOS 未签名需右键打开；Windows 需要 WebView2；数据库不要放在
网络共享盘上。

## 9. When it is a known limitation, not a bug

Read `15-user-guide.md` §11 before filing an issue:

- no automatic merge between devices;
- reopening a task deletes its completion history;
- archived categories cannot be restored in the UI;
- no CalDAV, reminders, search or tags yet;
- reports use built-in Word styles.

## 10. Reporting a problem

Include:

1. Daymark version (`package.json` / app bundle version).
2. Operating system and version, and whether the build is dev or packaged.
3. Device ID from Settings.
4. Exact reproduction steps, with dates and report period if relevant.
5. The exact error text from the banner/status line, or the terminal output.
6. Whether a sync client is involved, and its state at the time.
7. What you already tried (reload, restart, another folder).

Do **not** attach a real `daymark.db` publicly; it contains your tasks. Create a
minimal database with dummy data if a file is required.
