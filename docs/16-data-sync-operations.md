# 16 · Data and Sync Operations Manual

> 中文摘要：如何在多台电脑之间安全地使用同一个 Daymark 数据库。核心规则只有
> 一条：**同一时间只让一台电脑写数据库**。1.0 只做外部变更检测，不做自动合并；
> 两台机器同时离线编辑时，文件级“后写者胜”。本文件给出推荐流程、冲突处理、
> 备份与恢复步骤。

This is the operational counterpart to `06-sync-conflict.md`. Document 06
explains the design; this document explains what a user or support person
should actually do.

## 1. What is shared and what is not

| Item | Shared between devices? | Where it lives |
|---|---|---|
| Tasks, completions, categories | **Yes** | `daymark.db` in the chosen folder |
| Sync metadata (`last_write_device`, `last_write_at`) | Yes | inside `daymark.db` |
| Language, numbering, scan interval | No | `localStorage` on each device |
| Chosen data folder path | No | `localStorage`; paths differ per machine |
| Device ID | No | `localStorage` on each device |
| Generated DOCX reports | Only if you save them into a synced folder | wherever you export them |

Consequence: after setting up a new device you must choose the folder and,
optionally, set the language and numbering again. That is expected, not data
loss.

**中文要点：** 任务和分类在数据库里，会同步；语言、编号、扫描间隔、文件夹路径、
设备 ID 都是本机设置，不会同步。

## 2. Supported model in 0.1.0: one file, sequential writers

```
Device A ──writes──▶ daymark.db ◀──sync client──▶ daymark.db ◀──writes── Device B
                          ▲
                          └── detection only: mtime + last_write_device
```

- The database is a single SQLite file.
- The sync client (Nutstore, OneDrive, iCloud Drive, Dropbox, Syncthing, a
  WebDAV mount) is responsible for moving the file.
- Daymark detects that the file changed underneath it and asks you to reload.
- Daymark does **not** merge changes and does **not** coordinate writers.

Therefore the operating rule is:

> **Only one device may have Daymark open on the database at a time.**

This is safe and simple, but it is not real-time collaboration.

**中文要点：** 0.1.0 的安全模型是“同一时间只有一台机器打开数据库”。同步盘负责
搬文件，Daymark 只负责发现文件变了并提示重新加载。

## 3. First-time setup on two devices

1. On device A, install Daymark and choose a folder inside the synced directory,
   for example `~/Nutstore Files/Daymark/`.
2. Confirm that `daymark.db` exists in that folder and that the sync client has
   finished uploading it.
3. Wait for the folder to appear on device B (check the sync client's status,
   not just the file icon).
4. On device B, install Daymark and choose the **same synced folder** (its local
   path will be different, which is fine).
5. Create a test task on B, wait for sync, then open A and confirm the banner
   appears and **Reload** shows the task.
6. Record each device's ID from Settings for support purposes.

Do not copy a database while Daymark is open on either side.

**中文要点：** 两台机器选择同一个同步文件夹；等同步客户端显示“已完成”后再在
另一台打开。用一条测试任务验证双向同步。

## 4. Daily routine and hand-off checklist

Use this sequence when moving from one computer to another:

1. Finish the current edit; confirm the task list looks right.
2. **Quit Daymark completely** (not just close the window).
3. Wait until the sync client says the upload is complete.
4. Open the other device and wait until the download is complete.
5. Launch Daymark there. If the change banner appears, click **Reload** once.
6. Only then start editing.

Never leave Daymark open on two machines “just in case”. The file may be
replaced under the open instance, and the last writer wins.

**中文要点：** 换机顺序：保存 → 完全退出 Daymark → 等同步完成 → 另一台等下载
完成 → 打开并点“重新加载” → 再开始编辑。

## 5. When the conflict banner appears

The banner means: the database file's mtime changed without Daymark writing it.

| Situation | Action |
|---|---|
| You just switched devices and the sync client delivered a new version | Wait for the sync client to finish, then click **Reload**. |
| Another Daymark window is open on the same machine | Close the other window, then **Reload**. |
| A sync client is still downloading | Wait; do not reload mid-download. |
| You are unsure | Quit Daymark, let sync settle, reopen. Nothing is lost by reopening. |

Reload closes and reopens the database and refreshes all views. It does not
merge; it simply reads the file as it now exists.

**中文要点：** 提示条只表示文件被外部改写。等同步完成再点“重新加载”；不确定时
直接退出应用、等同步稳定后重开。

## 6. Known risks

| Risk | What happens | Mitigation |
|---|---|---|
| Two devices edit while both are open | File-level last-writer-wins; one side's edits can be lost | One writer at a time (§4). |
| Reload during a partial download | The app may open an inconsistent file | Wait for sync completion; keep backups. |
| Sync client uploads while Daymark writes | The client may capture a mid-write state | Daymark writes are small; still prefer quitting before hand-off. |
| The database is replaced under an open app | The open connection may keep writing to the old inode or fail | Reload promptly; quit before sync-heavy periods. |
| Sidecar files (`-wal`, `-shm`, `-journal`) appear | The sync client may copy them inconsistently | Keep them together with the `.db`; quit the app before hand-off. |
| Clock or filesystem mtime quirks | A change is not detected, or is detected late | Use a 30 s scan interval when actively switching; reload manually when in doubt. |

There is no automatic conflict resolution in 0.1.0. Document 06 describes the
planned P1 delta exchange, which will remove the single-writer requirement.

**中文要点：** 最大风险是两台机器同时编辑导致“后写者胜”。出现 `-wal`/`-shm`
等伴随文件时，要让同步盘把它们和 `.db` 一起同步。

## 7. Backup procedure

The database is one file, so backups are simple.

1. Quit Daymark.
2. Copy `daymark.db` to a backup location outside the live folder.
3. Name it with a date: `daymark-2026-10-21.db`.
4. Keep at least one copy on a different disk or cloud account.
5. Periodically verify a backup by opening it from a **copy** of the folder —
   never point the live app at the backup and start editing it.

Recommended cadence: before every app upgrade, before archiving categories,
before switching machines, and on a weekly schedule.

**中文要点：** 退出应用后复制 `daymark.db`，按日期命名，放在另一个磁盘或云账号。
升级、归档分类、换机前各备份一次，平时每周一次。

## 8. Restore procedure

1. Quit Daymark on every device that can see the folder.
2. If the sync client is running, pause it to avoid re-uploading the broken file.
3. Replace `daymark.db` with the chosen backup.
4. Resume sync and wait for it to propagate.
5. Open Daymark, verify tasks and reports.
6. If the file was corrupted on one device only, restore there first, then let
   sync propagate the good version.

Do not restore while another device is editing.

**中文要点：** 所有设备退出 → 暂停同步 → 用备份覆盖 → 恢复同步 → 打开验证。

## 9. Moving or renaming the data folder

**Within one machine:**

1. Quit Daymark.
2. Move `daymark.db` (and any `-wal`/`-shm`/`-journal` files) to the new folder.
3. Start Daymark; the old path no longer exists, so the app shows the welcome
   screen or an error.
4. Choose the new folder.

**To a new machine:** copy the file, install Daymark, choose the copied folder.

**Changing the path in Settings without moving the file** opens a *different*
database. If the new folder is empty, Daymark creates a fresh database with the
four default categories and your old tasks appear to be gone. They are still in
the old file.

**中文要点：** “更改文件夹”不会搬迁数据库。先在应用关闭时手动移动文件，再选择
新文件夹；否则会打开一个全新的空数据库。

## 10. Sync-client notes

| Client | Notes |
|---|---|
| Nutstore / 坚果云 | Treats SQLite files as binary; wait for the explicit “同步完成” state. |
| OneDrive | May create “conflict copy” files when both sides change. Keep only the intended database and archive the other. |
| iCloud Drive | Can throttle large files; check the cloud status before switching devices. |
| Dropbox | Version history can recover an overwritten database; useful as a secondary safety net. |
| Syncthing | Works well on a LAN; ensure both devices are fully synced before opening the app. |
| WebDAV mount | Ensure the mount is present before launch; a missing mount looks like a missing file. |

No client is “approved” by Daymark; the requirement is only that it copies the
whole file atomically enough for your usage pattern.

**中文要点：** 各家同步盘都可能产生“冲突副本”。发现副本时保留正确的那份，另一份
改名归档，不要两个都放进同一目录。

## 11. Recovery scenarios

| Symptom | Likely cause | Recovery |
|---|---|---|
| All tasks are gone after changing folders | A new empty database was created | Switch back to the old folder; the data is still there. |
| File missing after a sync error | Sync client deleted or renamed it | Restore the latest backup or use the client's version history. |
| “Database is not open” banner | The chosen folder/mount is unavailable | Reconnect the drive or choose the folder again. |
| The app opens but tasks do not appear on the other device | Sync not finished, or the devices point at different folders | Compare folder paths and sync status. |
| Two `daymark.db` variants (`daymark (1).db`, `conflict copy`) | Sync client conflict | Decide which is newer, keep it as `daymark.db`, archive the other. |
| Repeated conflict banner with no other device | Another window, a backup tool, or the sync client touching the file | Close other windows; check the sync client; reload once. |

**中文要点：** 换文件夹后“任务消失”通常是打开了新库，切回旧文件夹即可；出现多个
`daymark.db` 副本时，确认哪份最新，只保留一份。

## 12. What changes in P1

The planned delta exchange (doc 06 §4) will:

- keep a local working copy per device and exchange delta files;
- apply changes idempotently by `(device_id, seq)`;
- resolve conflicts per field with explicit UI choices;
- remove the requirement that only one device is open.

Until that ships, this manual's rules are the supported operating procedure.

## 13. Operations checklist

- [ ] Each device has its own device ID and its own settings.
- [ ] All devices point at the same synced folder.
- [ ] One writer at a time; quit before hand-off.
- [ ] Sync client reports completion before opening on another device.
- [ ] A dated backup exists outside the live folder.
- [ ] Sidecar files, if any, travel with the `.db`.
- [ ] The user knows what the conflict banner means and when to reload.
