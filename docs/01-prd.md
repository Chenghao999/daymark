# 01 · Product Requirements Document (PRD)

> 中文摘要：Daymark（日迹）是一款以本地文件为唯一数据源、可放在任意同步盘中的
> 日工作计划与自动周报生成桌面工具。数据主权、冲突不丢、报告自动推导是三条不
> 可妥协的原则。本文定义目标用户、场景、F-01 至 F-25 功能与优先级。

## 1. Background

Knowledge workers already have calendars and to-do apps, but the artifact they
are actually judged on — the daily, weekly or monthly work report — is still
written by hand. Existing tools either keep the data on a vendor's server or
treat reports as an export afterthought. Daymark's bet is that a small desktop
tool owning one local SQLite file, placed inside whatever sync folder the user
already trusts, can remove both the account requirement and the report-writing
work.

## 2. Target users

- **Primary:** one professional working across two machines (office + home)
  who must submit a weekly report and already uses a Chinese cloud drive.
- **Secondary:** a self-employed user who wants a private, local task history.
- **Non-target:** teams needing shared assignment, permissions and audit trails.

## 3. Core scenarios

1. **Single-device planning.** Open the week view, drag unscheduled work into a
   day, tick items off; Friday's report is already derived.
2. **Two-device sync.** The database sits in a synced folder. The office machine
   writes, the home machine detects the external change and reloads; if both
   wrote, both versions are preserved and presented.
3. **Report export.** Choose daily/weekly/monthly, preview the derived report,
   export DOCX and submit it.

## 4. Functional scope

Priority: **P0** must ship in 1.0 · **P1** should ship · **P2** optional.

| ID | Capability | Priority | 1.0 status |
|---|---|---|---|
| F-01 | Day / week / month calendar views | P0 | done |
| F-02 | Dated task creation (start, end, due, priority, category) | P0 | done |
| F-03 | Undated backlog tasks, scheduled later | P0 | done |
| F-04 | Completion records with timestamp | P0 | done |
| F-05 | 3–8 user-defined categories | P0 | done (add/archive) |
| F-06 | Configurable category numbering (Chinese / Arabic / alpha) | P0 | done |
| F-07 | Custom database path chosen at first run | P0 | done |
| F-08 | Configurable external-change scanning | P0 | done |
| F-09 | Two-device conflict detection and choice | P1 | detection only |
| F-10 | File-lock avoidance (local copy + delta exchange) | P1 | design |
| F-11 | Sync-folder compatibility hints | P2 | detection helper pending |
| F-12 | Daily report | P0 | done |
| F-13 | Weekly report | P0 | done |
| F-14 | Monthly report | P0 | done |
| F-15 | Template placeholder engine | P1 | partial (built-in styles) |
| F-16 | DOCX export | P0 | done |
| F-17 | PDF export | P2 | not started |
| F-18 | CalDAV account binding | P1 | not started |
| F-19 | Read-only CalDAV events in calendar | P1 | not started |
| F-20 | Write tasks back as VTODO/VEVENT | P2 | not started |
| F-21 | Incremental CalDAV sync (ctag/etag) | P1 | not started |
| F-22 | zh-CN + en, switch without restart | P0 | done |
| F-23 | Windows portable build | P0 | build config ready, unverified |
| F-24 | Unsigned macOS distribution | P0 | build config ready |
| F-25 | Modular deployment, external resources | P1 | partial |

## 5. Non-functional requirements

| Area | Requirement |
|---|---|
| Startup | Cold start to usable week view ≤ 2 s on a 2020-class laptop |
| Data volume | 20,000 tasks and 60,000 completion rows without visible lag |
| Scan accuracy | External change detected within one configured interval ±2 s |
| Report time | Daily/weekly report generation ≤ 300 ms for 5,000 tasks |
| File safety | No non-atomic write to the shared database file |
| Offline | Every P0 feature works with no network |
| Accessibility | Keyboard reachable; visible focus; respects OS light/dark |

## 6. Explicit non-goals for 1.0

- Real-time collaboration or a hosted sync service.
- Mobile clients.
- Team assignment, permissions, comments.
- Automatic merge of concurrent edits (P1; 1.0 preserves and asks).

## 7. Success criteria

- A user can run one full week on two devices without losing a task.
- A weekly report takes under one minute from opening the app to a saved DOCX.
- No user data leaves the chosen folder.

## 8. Open questions

1. Should the conflict UI offer field-level merge or only "keep A / keep B / keep
   both" in 1.0? Current design: keep both, merge later.
2. Do users want report templates editable inside the app, or is "replace the
   file on disk" acceptable? Current design: external template file.
