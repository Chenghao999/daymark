# 02 · Functional Specification (FSD)

> 中文摘要：逐功能定义输入、输出、状态流转与边界条件，重点写清任务状态机、
> 大类编号规则、冲突判定与 CalDAV 失败时的降级行为。

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
- Completing a task keeps its dates; reports still attribute it to its period.
- Reopening returns to `scheduled` if dates exist, otherwise `backlog`.
- Deletion is soft (`deleted = 1`) so completion history stays consistent.

Boundary conditions:

| Input | Result |
|---|---|
| Start set, end earlier than start | Accepted but flagged in the editor |
| Due before start | Accepted; the report uses `start_at` for placement |
| Complete an already-done task | No-op; no duplicate completion row |
| Reopen a task with no dates | Returns to backlog |
| Title empty | Save blocked with a validation message |

## 2. Category numbering

- Sections are ordered by `categories.sort_order`, then name; the uncategorized
  bucket is always last.
- Styles: `chinese` → 一、二、三；`arabic` → 1. 2. 3.；`alpha` → A. B. C.
- Chinese numerals cover 1–99; beyond that the decimal number is used rather
  than failing an export.
- Empty categories are omitted from the report but keep their relative order.

## 3. Report derivation

Inputs: tasks, completion rows, categories, period, numbering style.

1. Build the period window `[start of first day, end of last day]` in local time.
2. Collect completion rows whose `completed_at` falls in the window.
3. A task with at least one completion in the window becomes one **completed**
   item (never duplicated by multiple rows).
4. A task that is not done and whose `start_at` or `due_at` falls in the window
   becomes one **planned** item.
5. Group by category and order as above.
6. A task outside the window contributes nothing.

## 4. Conflict detection

- Every write updates `sync_meta.last_write_device` and `last_write_at`.
- Every task row carries `updated_at`, `device_id` and `row_version`.
- The scanner compares the file mtime with the baseline captured after
  Daymark's own last write. A change with `last_write_device != this device`
  raises the conflict banner.
- 1.0 behaviour: banner + "Reload"; the user decides when to reload.
- P1 behaviour: keep both versions, present a merge view (see doc 06).

## 5. CalDAV degradation

| Condition | Behaviour |
|---|---|
| No network | Show cached events; mark the account "offline" |
| 401 / expired credentials | Keep local data; prompt to re-authenticate |
| Server without ctag support | Fall back to full sync with backoff |
| Malformed event | Skip the event, log its UID, do not abort the sync |
| Account removed | Keep imported events read-only until the user deletes them |

## 6. Data path changes

- Changing the folder opens the new database; the old file is left untouched.
- Settings are device-local, so each machine remembers its own path.
- A missing file is created with an empty schema and seeded categories.
