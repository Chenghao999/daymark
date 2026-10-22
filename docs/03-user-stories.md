# 03 · User Stories and Acceptance Criteria

> 中文摘要：每个 P0 功能至少一条 Given/When/Then 验收条件，可直接反推测试用例。
> 数据以 Markdown 文件夹存放，因此验收条件同时覆盖“文件长什么样”。

## US-01 Choose the data location

Given a first launch with no saved folder
When the user picks an empty folder
Then `_categories.md` is written with the four default categories, `_backlog.md`
is created, and the calendar opens. The path survives a restart and is not
written into any data file.

## US-02 Plan a day

Given the week view
When the user clicks "+" on Wednesday and saves a task with a title and category
Then the task appears in Wednesday's column, in the day view, and as a line in
`YYYY-MM/YYYY-MM-DD.md` under its category heading.

## US-03 Backlog to scheduled

Given a backlog task
When the user sets a start date
Then it moves out of `_backlog.md`, appears in that day's file and view, and its
status becomes `scheduled`.

## US-04 Complete work

Given a scheduled task
When the user ticks it
Then the checkbox becomes `[x]`, `completedAt` is written into the task's
metadata comment, and the item appears in that period's report.

## US-05 Reopen work

Given a completed task
When the user unticks it
Then `completedAt` and `completionId` are cleared from the metadata and the task
returns to `scheduled` or `backlog`.

## US-06 Weekly report

Given completed and planned tasks in the current week
When the user opens Reports → Weekly
Then sections follow category order, each heading uses the configured numbering,
the week starts on the configured day, and the counts match the items shown.

## US-07 Export report

Given a non-empty report preview
When the user clicks Export DOCX and picks a path
Then a valid `.docx` is written atomically and the path is shown.

## US-08 External change

Given the data folder is modified outside Daymark
When one scan interval passes
Then the folder signature changes, a banner appears, and no local data is
silently overwritten.

## US-09 Language switch

Given the app is open in Chinese
When the user selects English in Settings
Then every label updates without a restart, the choice survives a restart, and
`_settings.md` records the new language.

## US-10 Custom categories

Given the category list
When the user adds "Review / 评审"
Then a line `- Review / 评审 <!-- daymark {...} -->` is appended to
`_categories.md`, and the category appears in the task editor and reports.

## US-11 Missing data folder

Given a saved path whose folder or files were deleted
When the app starts
Then it recreates the folder and the missing scaffolding with an empty state
instead of crashing. Existing day files are never rewritten on open.

## US-12 Category numbering

Given the Chinese numbering style
When a report has three non-empty categories
Then headings are 一、二、三 and, with the Arabic style, 1. 2. 3.

## US-13 Hand editing

Given a day file edited in a text editor
When the app reloads
Then recognised task lines are parsed, unknown non-empty lines are preserved, and
saving re-emits them unchanged at the end of the file.

## US-14 Legacy migration

Given a folder containing `daymark.db` and no `_categories.md`
When the app opens that folder
Then categories and tasks are written as Markdown, `_categories.md` is written
last as the commit marker, and the database is renamed to
`daymark.db.migrated-YYYYMMDD-HHmmss`.
