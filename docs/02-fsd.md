# 02 · Functional Specification (FSD)

> 中文摘要：逐功能定义输入、输出、状态流转与边界条件，重点写清任务状态机、
> 大类编号规则、归档规则（一天一个 Markdown 文件）、冲突判定与 CalDAV 失败时的
> 降级行为。

## 1. Task state machine

States: `backlog`, `scheduled`, `done`.

```
          set start/due                complete
backlog ─────────────────▶ scheduled ──────────▶ done
   ▲                           ▲                    │
   │      clear all dates      │      reopen        │
   └───────────────────────────┴────────────────────┘
```

Rules:

- A task with neither `start_at` nor `due_at` is `backlog`, never `scheduled`.
  Backlog tasks live in `_backlog.md`.
- Completing a task keeps its dates; reports still attribute it to its period.
- Reopening returns to `scheduled` if dates exist, otherwise `backlog`.
- Deletion is a hard delete: the task line and its metadata comment are removed
  from the file. There is no soft-delete flag any more.
- Status is not stored separately; it is derived from dates plus the presence of
  a `completedAt` in the task's metadata comment.

Boundary conditions:

| Input | Result |
|---|---|
| Start set, end earlier than start | Accepted but flagged in the editor |
| Due before start | Accepted; the report uses `start_at` for placement |
| Complete an already-done task | No-op; no duplicate completion |
| Reopen a task with no dates | Returns to backlog |
| Title empty | Save blocked with a validation message |
| Hand-edited `- [x]` with no metadata | Completion timestamp = local noon of that day |

## 2. Category numbering

- Sections are ordered by `categories.sortOrder`, then name; the uncategorized
  bucket is always last.
- Styles: `chinese` → 一、二、三；`arabic` → 1. 2. 3.；`alpha` → A. B. C.
- Chinese numerals cover 1–99; beyond that the decimal number is used rather
  than failing an export.
- Empty categories are omitted from the report but keep their relative order.
- In day files a section heading is `## English · 中文`; the writer maps the
  heading back to a `categoryId`.

## 3. Report derivation

Inputs: tasks, their completions, categories, period, numbering style.

1. Build the period window `[start of first day, end of last day]` in local time
   using `reportPeriod(kind, anchor, options)`.
2. Collect the completion attached to each task whose `completedAt` falls in the
   window.
3. A task with a completion in the window becomes one **completed** item.
4. A task that is not done and whose `start_at` or `due_at` falls in the window
   becomes one **planned** item.
5. Group by category and order as above.
6. A task outside the window contributes nothing.

Period options are assessment periods, configurable in `_settings.md`: weekly
honours `weekStartsOn` (Sunday or Monday), monthly honours
`assessmentMonthStartDay` (e.g. 26 → the 26th through the 25th), yearly honours
`assessmentYearStartMonth` plus the same start day.

## 4. Conflict detection

- Every write stamps the file header comment `<!-- daymark file {...} -->` with
  `updatedAt` and `deviceId`, and every task comment carries `updatedAt`,
  `deviceId` and `rowVersion`.
- The scanner asks Rust for `tree_signature(root)`, which returns
  `{fileCount, latestMtimeMs, fingerprint}` for every `.md` file up to depth 2.
- The scanner compares the `fingerprint`, a hash over each file's path, size and
  mtime. A new or removed day file, an edit, or a sync client replacing a file
  while preserving its mtime all change it and raise the reload banner.
- 0.1 behaviour: banner + "Reload"; the user decides when to reload.
- No automatic merge, and no silent overwrite of the folder. Merge is P1
  (see doc 06).

## 5. CalDAV degradation

| Condition | Behaviour |
|---|---|
| No network | Show cached events; mark the account "offline" |
| 401 / expired credentials | Keep local data; prompt to re-authenticate |
| Server without ctag support | Fall back to full sync with backoff |
| Malformed event | Skip the event, log its UID, do not abort the sync |
| Account removed | Keep imported events read-only until the user deletes them |

CalDAV is design-only; nothing in §5 is implemented in 0.1.

## 6. Data path changes

- The data folder is a directory, not a file. Changing it opens the store in the
  new directory; the old directory is left untouched.
- The selected path is device-local, so each machine remembers its own path; it
  is never written into `_settings.md`.
- A missing directory is created. If `_categories.md` is absent and no legacy
  `daymark.db` exists, the four default categories are seeded and the calendar
  opens empty.
- Every recognised file is rebuilt on save; unrecognised non-empty lines are
  preserved as extras and re-emitted at the end of the file.
