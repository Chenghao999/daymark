# 16 · Data and Sync Operations Manual

> 中文摘要：如何在多台电脑之间安全地使用同一个 Daymark 数据文件夹。数据现在是
> 一天一个 Markdown 文件，同一时间只建议让一台电脑编辑同一天。0.1 只做外部变更
> 检测，不做自动合并。本文件给出推荐流程、冲突处理、备份、迁移与恢复步骤。

This is the operational counterpart to `06-sync-conflict.md`. Document 06
explains the design; this document explains what a user or support person
should actually do.

## 1. What is shared and what is not

| Item | Shared between devices? | Where it lives |
|---|---|---|
| Tasks and completions | **Yes** | `YYYY-MM/YYYY-MM-DD.md`, `_backlog.md` |
| Categories | **Yes** | `_categories.md` |
| Language, week start, assessment periods, numbering, scan interval, signature name | **Yes** | `_settings.md` |
| Chosen data folder path | No | `localStorage`; paths differ per machine |
| Device ID | No | `localStorage` on each device |
| Generated DOCX reports | Only if you save them into a synced folder | wherever you export them |

Consequence: after setting up a new device you must choose the folder again.
The language and period settings arrive from `_settings.md`, so they do not need
to be re-entered. A different device ID is expected, not data loss.

**中文要点：** 任务、分类和计划类设置都在文件夹里，会同步；只有文件夹路径和
设备 ID 是本机的。新设备只需要重新选一次文件夹。

## 2. Supported model in 0.1.0: one folder, per-day files

```
Device A ──writes──▶ 2026-10/2026-10-22.md ◀──sync client──▶ same folder ◀──writes── Device B
                          ▲
                          └── detection only: tree_signature (fingerprint of path+size+mtime)
```

- The store is a folder of small Markdown files, one per day.
- The sync client (Nutstore, OneDrive, iCloud Drive, Dropbox, Syncthing, a
  WebDAV mount) is responsible for moving files.
- Daymark detects that the folder changed underneath it and asks you to reload.
- Daymark does **not** merge changes and does **not** coordinate writers.

Because each day is its own file, two devices editing different days do not
collide. The operating rule is therefore narrower than before:

> **Only one device should edit the same day at the same time.**

Editing different days on two machines is safe as long as both eventually sync.

**中文要点：** 一天一个文件，所以两台机器改不同的日期通常不会冲突。真正的规则
是“同一天只让一台机器编辑”。同步盘负责搬文件，Daymark 只负责发现变化并提示。

## 3. First-time setup on two devices

1. On device A, install Daymark and choose a folder inside the synced directory,
   for example `~/Nutstore Files/Daymark/`.
2. Confirm that `_categories.md`, `_backlog.md` and `_settings.md` exist and
   that the sync client has finished uploading them.
3. Wait for the folder to appear on device B (check the sync client's status,
   not just the file icon).
4. On device B, install Daymark and choose the **same synced folder** (its local
   path will be different, which is fine).
5. Create a test task on B for a date A has not edited, wait for sync, then open
   A and confirm the banner appears and **Reload** shows the task.
6. Record each device's ID from Settings for support purposes.

Do not copy the folder while Daymark is open on either side.

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

Never leave Daymark open on two machines editing the same day "just in case".

**中文要点：** 换机顺序：保存 → 完全退出 Daymark → 等同步完成 → 另一台等下载
完成 → 打开并点“重新加载” → 再开始编辑。

## 5. When the reload banner appears

The banner means: the folder signature changed without Daymark writing it — a
file was added, removed, or modified.

| Situation | Action |
|---|---|
| You just switched devices and the sync client delivered new files | Wait for the sync client to finish, then click **Reload**. |
| Another Daymark window is open on the same machine | Close the other window, then **Reload**. |
| A sync client is still downloading | Wait; do not reload mid-download. |
| You edited a file in a text editor | **Reload** to pick up your change; Daymark re-reads every file. |
| You are unsure | Quit Daymark, let sync settle, reopen. Nothing is lost by reopening. |

Reload re-reads the whole folder. It does not merge; it simply loads the files
as they now exist.

**中文要点：** 提示条只表示文件夹被外部改写。等同步完成再点“重新加载”；不确定
时直接退出应用、等同步稳定后重开。

## 6. Known risks

| Risk | What happens | Mitigation |
|---|---|---|
| Two devices edit the same day | File-level last-writer-wins for that day; the other side's edits to that day can be lost | One editor per day (§4); different days do not collide. |
| Reload during a partial download | The app may read a half-downloaded file | Wait for sync completion; keep backups. |
| Sync client uploads while Daymark writes | The client may capture a mid-write state | Writes are atomic (`*.tmp` + rename), so this is unlikely; still prefer quitting before hand-off. |
| A day file is deleted on one device | The day disappears everywhere; other devices see the banner | Check the trash or backup before recreating it. |
| `daymark.db.migrated-*` is synced | A large legacy file travels to every device | Move it out of the synced folder after verifying the migration. |
| `.tmp` files are synced briefly | Sync client copies a transient file | Harmless; they are overwritten or removed by the rename. |
| Clock or filesystem mtime quirks | A change is not detected, or is detected late | Use a 30 s scan interval when actively switching; reload manually when in doubt. |

There is no automatic conflict resolution in 0.1.0. Document 06 describes the
planned P1 merge, which will remove the one-editor-per-day rule.

**中文要点：** 最大风险是两台机器同时编辑同一天导致“后写者胜”。迁移后生成的
`daymark.db.migrated-*` 不要留在同步目录里，否则会同步到所有设备。

## 7. Backup procedure

The data is a folder of small text files, so backups are simple and diffable.

1. Quit Daymark.
2. Copy the whole data folder to a backup location outside the live folder.
3. Name it with a date: `daymark-2026-10-22/`.
4. Keep at least one copy on a different disk or cloud account.
5. Optionally keep the folder in git; every save is a readable diff.
6. Periodically verify a backup by opening it from a **copy** of the folder —
   never point the live app at the backup and start editing it.

Recommended cadence: before every app upgrade, before archiving categories,
before switching machines, and on a weekly schedule.

**中文要点：** 退出应用后复制整个文件夹，按日期命名，放在另一个磁盘或云账号。
纯文本文件也可以直接放进 git。升级、归档分类、换机前各备份一次。

## 8. Restore procedure

1. Quit Daymark on every device that can see the folder.
2. If the sync client is running, pause it to avoid re-uploading the broken
   files.
3. Replace the folder contents with the chosen backup.
4. Resume sync and wait for it to propagate.
5. Open Daymark, verify tasks and reports.
6. If only one device was corrupted, restore there first, then let sync
   propagate the good version.

Do not restore while another device is editing.

**中文要点：** 所有设备退出 → 暂停同步 → 用备份覆盖整个文件夹 → 恢复同步 →
打开验证。

## 9. Moving, renaming, or migrating the data folder

**Within one machine:**

1. Quit Daymark.
2. Move the whole folder (including `_settings.md`, `_categories.md`,
   `_backlog.md` and every month folder) to the new location.
3. Start Daymark; the old path no longer exists, so the app shows the welcome
   screen.
4. Choose the new folder.

**To a new machine:** copy the folder, install Daymark, choose the copied
folder.

**Changing the path in Settings without moving the files** opens a *different*
store. If the new folder is empty, Daymark seeds the four default categories
and your old tasks appear to be gone. They are still in the old folder.

**Migrating from a 0.1 SQLite build.** Open the folder that contains
`daymark.db`. Daymark detects that `_categories.md` is absent, converts
categories, tasks and completions into Markdown, writes `_categories.md` last
as the commit marker, and renames the database to
`daymark.db.migrated-YYYYMMDD-HHmmss`. Verify the result, then move that file
out of the synced folder.

**中文要点：** “更改文件夹”不会搬迁数据，先在应用关闭时手动移动整个文件夹；
旧版 SQLite 数据会在首次打开该文件夹时自动迁移，原库改名为
`daymark.db.migrated-*`。

## 10. Sync-client notes

| Client | Notes |
|---|---|
| Nutstore / 坚果云 | Many small files sync quickly; wait for the explicit “同步完成” state. |
| OneDrive | May create “conflict copy” files when both sides change the same day. Keep the intended file and archive the other. |
| iCloud Drive | Can throttle large folders; check the cloud status before switching devices. |
| Dropbox | Version history can recover an overwritten day file; useful as a secondary safety net. |
| Syncthing | Works well on a LAN; ensure both devices are fully synced before opening the app. |
| WebDAV mount | Ensure the mount is present before launch; a missing mount looks like a missing folder. |

No client is “approved” by Daymark; the requirement is only that it copies
files completely enough for your usage pattern.

**中文要点：** 各家同步盘都可能产生“冲突副本”。发现副本时保留正确的那份，另一
份改名归档，不要两个都放进同一目录。

## 11. Recovery scenarios

| Symptom | Likely cause | Recovery |
|---|---|---|
| All tasks are gone after changing folders | A new empty folder was opened | Switch back to the old folder; the data is still there. |
| Tasks are gone after a bad migration | The legacy database was renamed before you verified | Find `daymark.db.migrated-*`, rename it back to `daymark.db`, delete the generated `_categories.md` and day files, reopen the folder. |
| You need the original SQLite data | The migration kept it by design | Rename `daymark.db.migrated-YYYYMMDD-HHmmss` to `daymark.db` in a *separate copy* of the folder and inspect it with `sqlite3`. |
| A day file disappears | Sync client deleted or replaced it | Restore it from a backup or the client's version history. |
| “Store is not open” error | The chosen folder/mount is unavailable | Reconnect the drive or choose the folder again. |
| The app opens but tasks do not appear on the other device | Sync not finished, or the devices point at different folders | Compare folder paths and sync status. |
| Two variants of a day file (`2026-10-22 (1).md`, `conflict copy`) | Sync client conflict | Decide which is newer, keep it under the canonical name, archive the other. |
| Repeated banner with no other device | Another window, a backup tool, or the sync client touching files | Close other windows; check the sync client; reload once. |

**中文要点：** 换文件夹后“任务消失”通常是打开了新文件夹，切回旧文件夹即可；
迁移出问题时可把 `daymark.db.migrated-*` 改回 `daymark.db` 并在副本里重新迁移。

## 12. What changes in P1

The planned merge (doc 06 §4) will:

- merge at task level using `id`, `rowVersion` and `updatedAt` already stored in
  the file comments;
- resolve conflicts per field with explicit UI choices;
- remove the requirement that only one device edits a given day.

WebDAV sync and the AI assistant are separate roadmap items; see
`19-roadmap.md`. Until merge ships, this manual's rules are the supported
operating procedure.

## 13. Operations checklist

- [ ] Each device has its own device ID; the folder is chosen per device.
- [ ] All devices point at the same synced folder.
- [ ] Only one device edits a given day at a time.
- [ ] Sync client reports completion before opening on another device.
- [ ] A dated backup of the whole folder exists outside the live folder.
- [ ] `daymark.db.migrated-*` was moved out of the synced folder after migration.
- [ ] The user knows what the reload banner means and when to reload.
