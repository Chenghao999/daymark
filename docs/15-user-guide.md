# 15 · User Guide

> 中文摘要：面向使用者的操作手册。首次启动选择数据文件夹；周/日/月视图管理任务；
> 勾选完成任务；在“报告”页生成日/周/月/年报告并导出 DOCX；在“设置”页切换语言、
> 编号样式、周起始日、考核周期、扫描间隔和分类。数据是你选择的一个文件夹里的
> 纯 Markdown 文件，可以直接阅读和手工编辑。

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

Daymark stores everything as plain Markdown files inside the folder you pick:

```
<your folder>/
├── _settings.md
├── _categories.md
├── _backlog.md
└── 2026-10/
    └── 2026-10-22.md
```

Choose:

- a folder inside a synced directory (Nutstore 坚果云, OneDrive, iCloud Drive,
  Dropbox, Syncthing, a WebDAV mount) if you want several devices;
- a local folder if you only use one machine and prefer manual backups;
- a folder you can read with any text editor — that is the point of the format.

The folder can be changed later in **Settings → Change folder**. Changing the
folder opens the store in the new folder; it does **not** move or copy the old
files. To keep your tasks, copy the whole folder while Daymark is closed, then
select the new folder.

**中文要点：** 所有数据都在所选文件夹里，一天一个 `.md` 文件。放同步盘即可多
设备；“更改文件夹”只是打开另一个文件夹，不会自动搬迁旧文件。

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
│ Daymark/   │                                               │
└────────────┴───────────────────────────────────────────────┘
```

- The sidebar switches views.
- The top bar moves the period back/forward, returns to today, and adds a task.
- The sidebar footer shows the data folder's last path segment; hover it to see
  the full path.
- A banner appears if another program changed the folder (see §9).

**中文要点：** 左侧切换视图；顶部前后翻页、回到今天、添加任务；底部显示数据
文件夹。

## 4. Creating a task

Click **+ Add task** (top bar) or the **+** inside a day cell.

| Field | Required | Behaviour |
|---|---|---|
| Title | yes | Empty titles are rejected. |
| Category | no | Defaults to the first active category; "Uncategorized" is available. |
| Priority | no | Normal, Low, High, Urgent. |
| All day | no | Hides the end time; the start becomes a date. |
| Start | no | Date + time, or a date when "All day" is on. |
| Due | no | Date only. |
| End | no | Hidden for all-day tasks. |
| Notes | no | Free text. |

A task with a start or due date becomes **scheduled** and is filed under the
start date (or the due date when there is no start). A task with neither stays
in the **backlog** and is written to `_backlog.md`. Saving closes the editor,
writes the day file and refreshes every view.

**中文要点：** 只有标题必填。有开始或截止日期就是“已排期”，按开始日期（否则
截止日期）归档；两者都没有就写进 `_backlog.md`。

## 5. Editing, completing and deleting

- **Edit:** click a task title in any calendar view.
- **Complete:** click the circle/check button. The box becomes `[x]` and a
  completion timestamp is written into the task's comment, so the report can
  count it.
- **Reopen:** click the check again. The task returns to scheduled/backlog and
  its completion timestamp is cleared, so it leaves the report.
- **Delete:** open the task and click **Delete**. The task line and its comment
  are removed from the file. This is a hard delete; the app cannot undo it, but
  a backup copy of the folder can.
- **Backlog:** the Day view lists every undated, unfinished task from
  `_backlog.md`, regardless of which day is selected.
- **Hand editing:** see §10. Anything you type in a recognised format is read
  back on the next reload.

**中文要点：** 点标题编辑；点圆圈完成；再次点击重新打开（会清除完成时间，任务
从报告中消失）；删除是硬删除，只能靠文件夹备份恢复。

## 6. Calendar views

| View | Shows | Interactions |
|---|---|---|
| **Week** | One column per day, starting on the configured first day of the week (Monday by default). A task appears on its start date, or its due date if it has no start. | Click a day header to open the day; click a title to edit; click the circle to complete; **+** adds a task on that day. |
| **Day** | Scheduled tasks for the selected day, plus the whole backlog. | Complete, edit, add. A start time is shown for timed tasks. |
| **Month** | A six-week grid honouring the configured week start; up to three task titles per day, then "+N more". | Click any day to open it in the day view. |

Dates are local wall-clock dates. A task that starts at 23:00 belongs to that
calendar day.

**中文要点：** 周视图按“开始日期，否则截止日期”归位，周起始日可在设置里改；
日视图额外显示全部未排期任务；月视图每天最多显示三条，点击进入当日。

## 7. Reports

Open **Reports** in the sidebar.

1. Choose **Daily**, **Weekly**, **Monthly** or **Yearly**.
2. Move the period with the top bar if needed. For monthly and yearly reports a
   hint shows the assessment window, e.g. "26th through the 25th".
3. Optionally change the section numbering: Chinese (一、二、三), Arabic
   (1. 2. 3.) or alphabetical (A. B. C.).
4. Review the preview.
5. Click **Export DOCX** and choose a file name and location.

What appears in a report:

- **Completed** — tasks with a completion timestamp inside the period.
- **Planned** — unfinished tasks whose start or due date falls inside the
  period.
- Sections follow the category order configured in Settings; uncategorized
  tasks come last. Each task appears once, and items are ordered by date.

Period boundaries come from Settings: the week start day, the assessment month
start day (1 = calendar month, 26 = the 26th through the 25th) and the
assessment year start month.

Export is disabled when the report has no sections. Cancelling the save dialog
simply returns to the app. The suggested file name is
`<report title>-<period>.docx`, with characters `\ / : * ? " < > |` replaced by
`-`.

**中文要点：** 报告完全由任务和完成记录推导。已完成=周期内有完成时间；计划中=
周期内排期且未完成。周起始日、考核月起始日、考核年起始月都在设置里配置。

## 8. Settings

| Setting | Values | Scope |
|---|---|---|
| Language | English (default) / 简体中文 | Synced (`_settings.md`); applies immediately. An existing saved choice is kept. |
| Week starts on | Monday / Sunday | Synced; affects the week view, month grid and weekly reports. |
| Assessment month starts on | 1–28 | Synced; `26` means the 26th through the 25th. |
| Assessment year starts in | January–December | Synced; uses the same start day. |
| Report signature name | free text | Synced; intended as the report signature, not yet printed; reserved for the AI assistant. |
| Report numbering | Chinese / Arabic / Alphabetical | Synced; used by previews and exports. |
| Scan for external changes | 30 s / 60 s / 300 s | Synced; how often the folder is polled. |
| Data location | absolute folder | Device-local; **Change folder** opens another folder. |
| WebDAV sync | server URL, remote folder, username, password | Device-local; nothing in this card is written to the data folder. |
| AI assistant | enable, Anthropic API key, model | Device-local; off by default; only the report outline is sent. |
| Categories | add (English + Chinese names, colour) / archive | Shared, stored in `_categories.md`. |
| Device ID | read-only UUID | Device-local; identifies this installation. |

**Archiving a category.** The Delete button in the category list archives it: it
disappears from pickers and reports. Existing tasks keep the category id, so
they appear under **Uncategorized** in reports until you reassign them. There
is no restore button in 0.1.0; you can set `"archived": false` by hand in
`_categories.md`.

**中文要点：** 语言、周起始日、考核周期、编号、扫描间隔写入 `_settings.md`，
会随文件夹同步；数据文件夹路径和设备 ID 是本机设置。删除分类等于归档，可以
手工改 `_categories.md` 恢复。

### WebDAV sync

The WebDAV card uploads the same Markdown files to a WebDAV folder, for when a
desktop sync client is not available. It is manual: nothing runs in the
background, and a sync only happens when you press **Sync now**.

1. Enter the server URL (for example `https://dav.jianguoyun.com/dav`), the
   remote folder (default `/daymark/`, created on first sync) and your
   credentials.
2. Press **Test connection**. It checks the URL and that the remote folder is
   reachable; a missing remote folder is created by the first sync instead.
3. Press **Sync now**. The status line shows the phase and file count; the
   result line reports how many files were uploaded, downloaded, merged, and
   left unresolved.

How a sync decides:

- Only the local file changed → upload. Only the remote file changed →
  download. Identical content → skip.
- Both sides changed the same file → **conflict**. Daymark first merges the two
  copies: day and backlog files task by task — an edit made on one side only is
  kept, and when both sides changed the same task the higher `rowVersion` wins,
  then the later `updatedAt`, with a completion beating a reopen. `_settings.md`
  and `_categories.md` merge key by key against the text both sides had after
  the last sync, so edits to different settings or different categories combine.
  A clean merge replaces both copies and is counted as **merged** in the result
  line. Whatever the merge cannot order — two edits of the same task with the
  same version, or the same setting/category field changed differently on both
  sides — stays a conflict: the local file keeps its name, the remote version is
  saved as `<name> (conflict <device> <date>).md`, and the item is listed in
  Settings with both sides shown. Choose **Keep mine**, **Keep theirs** or (for
  a task) **Keep both**, then press **Apply**; the choice is written to both
  sides and the conflict leaves the list. The copy stays on disk as a backup,
  and you can delete it whenever you like.
- Deleting a task leaves a one-line `<!-- daymark deleted … -->` comment in its
  file, so the other device removes the task instead of re-adding it. If the
  other side edited the task after the deletion, the edit wins and the task
  comes back.
- A file that exists on both sides with different content on the very first
  sync is also a conflict; Daymark never guesses which side is newer.
- **Nothing is ever deleted** by a sync. Deleting a whole file on one side does
  not delete it on the other; only an individual task deletion travels, as that
  marker.

The password is stored in this device's local app data only. It is never
written to `_settings.md` or the data folder, so it does not travel to other
devices or into backups. Use an app-specific password when the server offers
one.

**中文要点：** WebDAV 是手动同步：填地址、远端目录和账号，先测试连接，再点
“立即同步”。两边都改过时先自动合并：日文件和待办文件按任务合并（只有一边改过
的保留，同一任务版本号高者、再比更新时间的胜出，完成优先于重开）；设置和分类按
键/字段合并，以最后一次同步时两边相同的文本为基准，因此改不同设置或不同分类
不会冲突。能干净合并时两份文件都会被合并结果替换。无法判定先后的改动（同版本
同时间的不同改动、同一键被两边改成不同值）仍另存为 `(conflict …)` 副本，并在
设置页列出两边内容：选择“保留我的 / 保留对方的 / 两者都保留（仅任务）”后点
“应用”，两边同时写入，冲突从列表消失；副本保留在磁盘上作为备份。删除任务会在
文件里留一行 `<!-- daymark deleted … -->` 注释，让另一台设备也删掉它；若对方在
删除之后改过该任务，则以修改为准、任务保留。同步本身不会删除任何文件。密码只
存在本机，不会写进 `_settings.md`。

### AI assistant

The AI assistant is **off by default**. Enable it in Settings, choose the API
protocol, paste a key and pick a model; the Reports page then shows an **AI
assistant** button next to Export.

- **API protocol** — `Anthropic-compatible` for Anthropic and Claude relays
  (`/v1/messages`), or `OpenAI-compatible` for OpenAI-style services such as
  DeepSeek, Kimi, GLM, OpenRouter and most enterprise gateways
  (`/v1/chat/completions`).
- **API base URL** — leave empty for the official endpoint. For a relay or a
  vendor such as Oppo AI, enter its base address; the app appends the protocol's
  path itself.
- **Model name** — any model the endpoint accepts. The dropdown is a set of
  suggestions, not a whitelist.

- **Polish report** rewrites the period's report as prose while keeping every
  category and every item.
- **Retrospective** summarises what was completed, what stayed planned, and
  suggests what to change next period.

Before anything leaves the machine, the panel states how many categories, items
and characters will be sent, plus a rough input-token estimate. **Preview what
will be sent** shows the exact text. After a request, the panel shows the
provider's actual input/output token counts; no price is shown.
Only the report title, period, counts, category names, task titles and dates are
included — task notes, task ids and the data-folder path are not.

The answer appears in an editable box. Nothing is written to disk until you
press **Save to `_ai/`**, which creates a new timestamped Markdown file in the
`_ai/` folder inside your data folder; **Copy** puts it on the clipboard. AI
output is an ordinary note: it is not a task, it does not enter reports, and
WebDAV sync does not upload `_ai/`.

The API key is stored in this device's local app data, like the WebDAV password.
It is never written to `_settings.md` or the data folder. Requests go directly
from this app to Anthropic and are billed to your account.

**中文要点：** AI 助手默认关闭。启用后选择接口协议、填写密钥与模型：协议可选
Anthropic 兼容（`/v1/messages`）或 OpenAI 兼容（`/v1/chat/completions`）；接口
地址留空用官方地址，用中转、Oppo AI 等服务时填基础地址；模型名可任意填写。
随后报告页会出现“AI 助手”按钮：可以“润色报告”或生成“周期回顾”。发送前会显示
分类/条目/字符数与 token 估算，并可预览完整文本；只发送报告标题、周期、分类和
任务标题，不发送备注、任务 ID 和本地路径。结果可编辑，只有点“保存到 `_ai/`”
才会写成新的 Markdown 文件。密钥只存在本机，不写入 `_settings.md`；请求直接发往
你配置的接口，按你的账号计费，面板会显示本次实际使用的 token 数。离线时按钮
禁用，失败后按钮变为“重试”。

### Appearance

Settings → **Appearance**: **Follow system** (default), **Light** or **Dark**.
The choice is saved on this device only, so a desktop and a laptop can differ.
“Follow system” picks up OS changes immediately.

**中文要点：** 设置 → 外观：跟随系统（默认）、浅色、深色。主题只保存在本机，
不同设备可以不同；选“跟随系统”时随系统切换即时生效。

### One-sentence task entry

Once the assistant is configured, the task editor (new or existing task) starts
with **Describe it in one sentence**. Type something like
“Lunch with Ana next Tuesday at noon, category Work”, press **Fill fields**, and
the editor's title, category, start/end, due date, priority, all-day flag and
notes are filled in for you.

- The sentence is resolved against your computer's local clock; relative words
  like “tomorrow” or “next Tuesday” use that date.
- Only categories that already exist are used — the assistant cannot invent one.
- If the sentence describes several tasks, you pick one from a list.
- **Nothing is saved automatically.** Review the fields and press Save; the
  assistant only fills the form.

**中文要点：** 配置好 AI 后，任务编辑器顶部有“用一句话描述”。输入
“下周二中午和 Ana 吃饭，分类工作”，点“填充表单”，标题、分类、开始/结束、截止、
优先级、全天和备注会被填好。相对日期按本机当前时间计算；只会使用已有分类；
一句话拆出多条任务时由你选择一条。**不会自动保存**，确认字段后照常点保存。

## 9. External changes and the reload banner

Daymark polls a signature of the data folder — the number of Markdown files and
the newest modification time — at the configured interval. If a sync client,
another Daymark window or a text editor changed any file, a banner says the
folder changed outside Daymark.

Click **Reload** to reopen the store and refresh the views. If you click it
while the sync client is still writing, you may read a partial file; wait until
the sync client reports completion, then reload.

Daymark never merges two versions and never silently overwrites newer files.
See `16-data-sync-operations.md` for the safe multi-device procedure.

**中文要点：** 同步盘或编辑器改动了文件夹后会出现提示条。等同步客户端彻底完成
后再点“重新加载”。Daymark 不会自动合并，也不会静默覆盖。

## 10. Hand editing and backups

**Hand editing.** The files are ordinary Markdown. You may:

- rename a task in the `- [ ]` line, or change `[ ]` to `[x]` to complete it
  (a box you check by hand gets that day's local noon as its completion time);
- add a `  > note` line under a task;
- add a task line to a day file or to `_backlog.md`;
- edit the bullet list in `_settings.md` (the JSON comment wins if both exist);
- fix a category name or colour in `_categories.md`.

Do not edit the JSON inside `<!-- daymark ... -->` comments unless you are
correcting a value; a broken comment is ignored, which can lose metadata. Lines
Daymark does not recognise are preserved and written back at the end of the
file, so a stray paragraph will not be destroyed — but it will not become a
task either.

**Backup:** quit Daymark, copy the whole data folder to a dated backup
location. Because it is plain text, you can also put the folder in git.

**Restore:** quit Daymark, replace the folder contents with the backup, reopen.

**Move to another computer:** copy the whole folder, install Daymark there,
choose the copied folder on first launch.

**中文要点：** 文件就是普通 Markdown，可以直接改名、勾选、加备注甚至新增任务；
无法识别的行会被保留。备份就是复制整个文件夹，也可以放进 git。

## 11. Known limitations in 0.1.0

| Limitation | Consequence |
|---|---|
| Automatic merge is task-level only | A clean merge re-serialises the whole file. Edits to the same task with equal versions, or to the same settings key / category field changed differently on both sides, stay unresolved until you choose keep mine / keep theirs / keep both in Settings. A task deleted on one side stays deleted unless the other side edited it afterwards. |
| Reopening clears completion metadata | The task's earlier completion date is lost. |
| Archived categories cannot be restored in the UI | Edit `_categories.md` by hand if needed. |
| No duration blocks in the week grid | Tasks show as items; the start time appears in the day view. |
| CalDAV is not implemented | `source` and `externalUid` are reserved fields only. |
| WebDAV sync is manual and first-version | No background sync, and sync never deletes files; an individual task deletion travels as a marker comment. Unresolved conflicts are settled in Settings, and the conflict copy stays on disk as a backup. It has not been tested against every WebDAV server. |
| AI assistant is first-version and online | Requires an Anthropic API key and a network connection; no local model; the key is in local app storage, not the OS keychain yet. |
| No search, tags, reminders or notifications | Not part of 0.1.0. |
| No automatic backup | Backups are the user's responsibility. |

**中文要点：** 0.1.0 的 WebDAV 只支持手动同步，同步不删除文件（任务删除以标记
注释的形式同步）；无法自动排序的冲突在设置页选择“保留我的 / 保留对方的 / 两者
都保留”。没有 CalDAV、AI 助手、提醒和搜索；重新打开任务会清除其完成时间；归档
分类需要在文件里手工恢复。

## 12. Quick reference

| I want to… | Do this |
|---|---|
| Add a task on a date | Click **+** in that day cell, or **+ Add task** in the top bar. |
| See only one day | Click the day header in the week view, or a day in the month view. |
| Mark work done | Click the circle next to the task, or change `[ ]` to `[x]` in the file. |
| Generate this week's report | Reports → Weekly → check the period → Export DOCX. |
| Use another language | Settings → Language. |
| Change the week start | Settings → Week starts on. |
| Change report boundaries | Settings → Assessment month / Assessment year. |
| Move my data | Close the app, copy the folder, then Settings → Change folder. |
| Recover an old SQLite file | Look for `daymark.db.migrated-*` in the folder (see doc 16). |
| Use two computers | Put the folder in a synced directory and read doc 16 first. |
| Sync without a desktop client | Settings → WebDAV sync → Test connection → Sync now. |
| Settle a sync conflict | Settings → WebDAV sync → choose Keep mine / theirs / both → Apply. |
| Polish this period's report | Reports → AI assistant → Polish report → Generate → Save to `_ai/`. |
| Create a task from a sentence | New task → Describe it in one sentence → Fill fields → review → Save. |
| Use a relay or Oppo AI | Settings → AI assistant → choose the protocol, enter the base URL and model, then Test. |
| Change the theme | Settings → Appearance → Follow system / Light / Dark. |
| Fix a problem | See `17-troubleshooting.md`. |
