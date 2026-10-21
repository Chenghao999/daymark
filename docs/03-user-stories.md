# 03 · User Stories and Acceptance Criteria

> 中文摘要：每个 P0 功能至少一条 Given/When/Then 验收条件，可直接反推测试用例。

## US-01 Choose the data location

Given a first launch with no saved path
When the user picks a folder
Then `daymark.db` is created there, the calendar opens, and the path survives a restart.

## US-02 Plan a day

Given the week view
When the user clicks "+" on Wednesday and saves a task with a title and category
Then the task appears in Wednesday's column and in the day view.

## US-03 Backlog to scheduled

Given a backlog task
When the user sets a start date
Then its status becomes `scheduled` and it appears in that day's view.

## US-04 Complete work

Given a scheduled task
When the user ticks it
Then status becomes `done`, a completion row is written, and the item appears in
that period's report.

## US-05 Reopen work

Given a completed task
When the user unticks it
Then the completion row is removed and the task returns to `scheduled`.

## US-06 Weekly report

Given completed and planned tasks in the current week
When the user opens Reports → Weekly
Then sections follow category order, each heading uses the configured numbering,
and the counts match the items shown.

## US-07 Export report

Given a non-empty report preview
When the user clicks Export DOCX and picks a path
Then a valid `.docx` is written atomically and the path is shown.

## US-08 External change

Given the database file is modified outside Daymark
When one scan interval passes
Then a banner appears and no local data is silently overwritten.

## US-09 Language switch

Given the app is open in Chinese
When the user selects English in Settings
Then every label updates without a restart and the choice survives a restart.

## US-10 Custom categories

Given the category list
When the user adds "Review / 评审"
Then it appears in the task editor and in report ordering.

## US-11 Missing database

Given a saved path whose file was deleted
When the app starts
Then it recreates the file with the schema and an empty state instead of crashing.

## US-12 Category numbering

Given the Chinese numbering style
When a report has three non-empty categories
Then headings are 一、二、三 and, with the Arabic style, 1. 2. 3.
