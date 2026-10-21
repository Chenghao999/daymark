# 15 · User Guide

> 中文摘要：面向使用者的操作手册。首次启动选择数据文件夹；周/日/月视图管理任务；
> 勾选完成任务；在“报告”页生成日报/周报/月报并导出 DOCX；在“设置”页切换语言、
> 编号样式、扫描间隔和分类。数据只存在你选择的 `daymark.db` 文件里。

This guide describes the shipped 0.1.0 behaviour only. Features that are
designed but not built are listed in §11.

## 1. Install and first launch

**macOS.** Open the `.app` from `src-tauri/target/release/bundle/macos/` or move
it to `/Applications`. The build is unsigned; if macOS refuses to open it,
right-click the app → **Open** → **Open** once, or run `xattr -cr Daymark.app`.

**Windows.** Run the portable executable. WebView2 must be installed (it is
present on current Windows 10/11 by default).

**First launch.** Daymark shows a welcome screen and asks for a folder. It does
not create or read any task data until a folder is chosen.

**中文要点：** 首次打开会出现欢迎页，必须先选择一个文件夹；macOS 未签名版本
需要右键“打开”，或在终端执行 `xattr -cr Daymark.app`。

## 2. Choosing the data folder

Daymark stores everything in one SQLite file named `daymark.db` inside the
folder you pick. Choose:

- a folder inside a synced directory (Nutstore 坚果云, OneDrive, iCloud Drive,
  Dropbox, Syncthing, a WebDAV mount) if you want several devices;
- a local folder if you only use one machine and prefer manual backups.

The folder can be changed later in **Settings → Change folder**. Changing the
folder opens the database in the new folder; it does **not** move or copy the
old file. To keep your tasks, move `daymark.db` yourself while Daymark is
closed, then select the new folder.

**中文要点：** 所有数据只在所选文件夹里的 `daymark.db`。放同步盘即可多设备；
“更改文件夹”只是打开另一个数据库，不会自动搬迁旧文件。

## 3. Interface tour

```
┌────────────┬───────────────────────────────────────────────┐
│ Daymark    │  ←  Today  →   period title        + Add task │
│            ├───────────────────────────────────────────────┤
│ Day        │                                               │
│ Week       │   selected view (calendar / reports / settings)│
│ Month      │                                               │
│ Reports    │                                               │
│ Settings   │                                               │
│ daymark.db │                                               │
└────────────┴───────────────────────────────────────────────┘
```

- The sidebar switches views.
- The top bar moves the period back/forward, returns to today, and adds a task.
- The sidebar footer shows the database file name and the folder's last path
  segment; hover it to see the full path.
- A red banner appears if another program changed the database file (see §9).

**中文要点：** 左侧切换视图；顶部前后翻页、回到今天、添加任务；底部显示数据库
文件名和文件夹。

## 4. Creating a task

Click **+ Add task** (top bar) or the **+** inside a day cell.

| Field | Required | Behaviour |
|---|---|---|
| Title | yes | Empty titles are rejected. |
| Category | no | Defaults to the first active category; “Uncategorized” is available. |
| Priority | no | Normal, Low, High, Urgent. |
| All day | no | Hides the end time; the start becomes a date. |
| Start | no | Date + time, or a date when “All day” is on. |
| Due | no | Date only. |
| End | no | Hidden for all-day tasks. |
| Notes | no | Free text. |

A task with a start or due date becomes **scheduled**; a task with neither stays
in the **backlog**. Saving closes the editor and refreshes every view.

**中文要点：** 只有标题必填。有开始或截止日期就是“已排期”，两者都没有就是
“待办池（Backlog）”。保存后立即生效。

## 5. Editing, completing and deleting

- **Edit:** click a task title in any calendar view.
- **Complete:** click the circle/check button. The task moves to the done style
  and gains a completion record for the report.
- **Reopen:** click the check again. The task returns to scheduled/backlog and
  its completion records are removed, so it leaves the report.
- **Delete:** open the task and click **Delete**. This is a soft delete: the row
  stays in the database with `deleted = 1`, so it can be recovered only by
  editing the database manually.
- **Backlog:** the Day view lists every undated, unfinished task in the backlog
  section, regardless of which day is selected.

**中文要点：** 点标题编辑；点圆圈完成；再次点击重新打开（会删除完成记录，任务
从报告中消失）；删除是软删除，界面无法撤销。

## 6. Calendar views

| View | Shows | Interactions |
|---|---|---|
| **Week** | Monday–Sunday columns. A task appears on its start date, or its due date if it has no start. | Click a day header to open the day; click a title to edit; click the circle to complete; **+** adds a task on that day. |
| **Day** | Scheduled tasks for the selected day, plus the whole backlog. | Complete, edit, add. Times are shown for timed tasks. |
| **Month** | A six-week grid; up to three task titles per day, then “+N more”. | Click any day to open it in the day view. |

Dates are local wall-clock dates. A task that starts at 23:00 belongs to that
calendar day.

**中文要点：** 周视图按“开始日期，否则截止日期”归位；日视图额外显示全部未排期
任务；月视图每天最多显示三条，点击进入当日。

## 7. Reports

Open **Reports** in the sidebar.

1. Choose **Daily**, **Weekly** or **Monthly**.
2. Move the period with the top bar if needed. Weeks run Monday–Sunday.
3. Optionally change the section numbering: Chinese (一、二、三), Arabic
   (1. 2. 3.) or alphabetical (A. B. C.).
4. Review the preview.
5. Click **Export DOCX** and choose a file name and location.

What appears in a report:

- **Completed** — tasks with a completion recorded inside the period.
- **Planned** — unfinished tasks whose start or due date falls inside the
  period.
- Sections follow the category order configured in Settings; uncategorized
  tasks come last. Each task appears once, and items are ordered by date.

Export is disabled when the report has no sections. Cancelling the save dialog
simply returns to the app. The suggested file name is
`<report title>-<period>.docx`, with characters `\ / : * ? " < > |` replaced by
`-`.

**中文要点：** 报告完全由任务和完成记录推导。已完成=周期内有完成记录；计划中=
周期内排期且未完成。分类顺序取自设置，未分类排最后。无内容时导出按钮禁用。

## 8. Settings

| Setting | Values | Scope |
|---|---|---|
| Language | 简体中文 / English | Device-local; applies immediately. |
| Report numbering | Chinese / Arabic / Alphabetical | Device-local, used by previews and exports. |
| Scan for external changes | 30 s / 60 s / 300 s | Device-local; how often the database file's mtime is checked. |
| Data location | absolute folder | Device-local; **Change folder** opens another database. |
| Categories | add (English + Chinese names, colour) / delete | Shared data, stored in the database. |
| Device ID | read-only UUID | Device-local; identifies this installation. |

**Archiving a category.** The Delete button in the category list archives it: it
disappears from pickers and reports. Existing tasks keep the category id, so
they appear under **Uncategorized** in reports until you reassign them. There
is no restore button in 0.1.0.

**中文要点：** 语言、编号、扫描间隔、数据位置是“本机设置”；分类是共享数据。
删除分类等于归档，分类下已有任务会在报告里显示为“未分类”，界面暂时无法恢复。

## 9. External changes and the conflict banner

Daymark checks the database file's modification time at the configured interval.
If a sync client (or another Daymark window) replaced the file, a banner says
another device wrote to it.

Click **Reload** to close and reopen the database and refresh the views. If you
click it while the sync client is still writing, you may reopen a partial file;
wait until the sync client reports completion, then reload.

Daymark never merges two versions and never silently overwrites a newer file.
See `16-data-sync-operations.md` for the safe multi-device procedure.

**中文要点：** 同步盘写入数据库文件后会出现提示条。等同步客户端彻底完成后再点
“重新加载”。Daymark 不会自动合并，也不会静默覆盖。

## 10. Backup and moving data

- **Backup:** close Daymark, copy `daymark.db` to a dated backup location.
  Copying while the app is open can capture an inconsistent file.
- **Restore:** close Daymark, replace the current `daymark.db` with the backup,
  reopen the app.
- **Move to another computer:** copy the whole folder (or just the `.db`),
  install Daymark there, choose the copied folder on first launch.
- **Change folder:** move the file yourself while the app is closed, then use
  Settings → Change folder.

A full procedure, including multi-device hygiene, is in
`16-data-sync-operations.md`.

**中文要点：** 备份前先退出应用，直接复制 `daymark.db`。换电脑同样复制这个文件，
首次启动时选择它所在的文件夹。

## 11. Known limitations in 0.1.0

| Limitation | Consequence |
|---|---|
| No automatic merge | The last writer to the synced file wins at file level. |
| One completion row per completion, deleted on reopen | Reopening erases that task's completion history. |
| Archived categories cannot be restored in the UI | Re-create the category manually if needed. |
| Calendar tasks are all-day or timestamped; no duration blocks | Tasks do not render as time ranges in the week grid. |
| CalDAV is not implemented | `source` and `external_uid` are reserved fields only. |
| No search, tags, reminders or notifications | Not part of 0.1.0. |
| No automatic backup | Backups are the user's responsibility. |

**中文要点：** 0.1.0 没有自动合并、没有 CalDAV、没有提醒和搜索；重新打开任务
会清除其完成历史；归档分类在界面上无法恢复。

## 12. Quick reference

| I want to… | Do this |
|---|---|
| Add a task on a date | Click **+** in that day cell, or **+ Add task** in the top bar. |
| See only one day | Click the day header in the week view, or a day in the month view. |
| Mark work done | Click the circle next to the task. |
| Generate this week's report | Reports → Weekly → check the period → Export DOCX. |
| Use another language | Settings → Language. |
| Change category numbering | Settings → Report numbering, or the selector on the Reports page. |
| Move my data | Close the app, move `daymark.db`, then Settings → Change folder. |
| Use two computers | Put the database in a synced folder and read doc 16 first. |
| Fix a problem | See `17-troubleshooting.md`. |
