# 11 · Test Plan

> 中文摘要：单元测试覆盖报告推导、周期计算、编号与 Markdown 解析；集成测试覆盖
> 文件读写、迁移与扫描调度；手工清单覆盖双设备、同步盘延迟与 CalDAV 断网场景。

## 1. Unit tests (Vitest)

| Area | Cases |
|---|---|
| `domain/numbering` | 1–99 Chinese numerals, ten boundary, alpha rollover, heading formats |
| `domain/reports` | grouping, category order, uncategorized last, outside-period exclusion, no double counting, daily/weekly/monthly/yearly titles |
| `domain/periods` | week start 0/1, assessment month day 26 → 26th–25th, assessment year month, day-only windows |
| `domain/tasks` | backlog ↔ scheduled ↔ done, reopen with and without dates, delete |
| `storage/markdown` | day-file round-trip, categories round-trip, extras preserved, hand-checked box gets noon, time range parsing |
| `storage/settingsFile` | JSON comment wins over bullets, bullet fallback, malformed JSON tolerated, clamping |
| Template validation (P1) | missing required placeholder, unknown placeholder, empty sections |

Run:

```bash
npm test
```

Current suites: `numbering.test.ts`, `reports.test.ts`, `periods.test.ts`,
`markdown.test.ts`, `settingsFile.test.ts`.

## 2. Integration tests (manual or scripted against a temporary folder)

1. Create a store in a temporary folder; confirm `_categories.md` is seeded with
   four categories and `_backlog.md` exists.
2. Create a task on a date; confirm `YYYY-MM/YYYY-MM-DD.md` exists with a
   heading, a task line and a metadata comment. Reopen the store and confirm the
   task survives.
3. Edit the day file by hand, adding an unknown line; confirm it is preserved
   after the app rewrites the file.
4. Delete every task in a day; confirm the day file is removed while
   `_backlog.md` remains.
5. Point the app at a folder containing only `daymark.db`; confirm migration
   runs once and the database is renamed to `daymark.db.migrated-*`.
6. Touch any `.md` file externally; confirm the banner appears within one
   interval and clears after Reload.
7. Export a DOCX to a path containing spaces and Chinese characters.

## 3. Manual acceptance checklist

### Two-device simulation

- [ ] Machine A writes a task; the file syncs to B; B reloads and sees it.
- [ ] A edits `2026-10-22.md` and B edits `2026-10-23.md` while offline; after
      sync and reload both days are intact — per-day files do not collide.
- [ ] Both edit the same day offline; the reload banner appears and the last
      file to land wins (P1 merge is not implemented — verify the documented
      limitation instead).

### Sync-folder latency

- [ ] Place the folder in a sync client; edit from another tool; confirm the
      scanner fires once, not repeatedly.
- [ ] After Daymark's own write, no banner appears (signature re-baselining).
- [ ] Deleting a day file externally also raises the banner (file count drops).

### CalDAV (when implemented)

- [ ] Wrong password → clear error, local data unchanged.
- [ ] Airplane mode → cached events remain visible.
- [ ] Removed event → disappears after the next full sync.

## 4. Performance checks

- 20,000 tasks spread over day files: week view renders under 200 ms after load.
- Weekly report generation under 300 ms.
- Scanner CPU cost below 1% on an idle machine (one `tree_signature` IPC call per
  interval, independent of file count).
- Loading a year of day files stays under the 2 s cold-start budget.

## 5. Accessibility

- Tab reaches every control; focus ring visible in light and dark.
- Checkbox toggles work with Space/Enter.
- Dialog traps focus and closes on Escape (planned).

## 6. What is not covered yet

- Automated end-to-end UI tests.
- Windows-specific rendering.
- Multiple simultaneous app instances on one machine.
- Merge behaviour (P1, not implemented).
