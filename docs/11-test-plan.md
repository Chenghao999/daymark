# 11 · Test Plan

> 中文摘要：单元测试覆盖报告推导、编号与任务状态机；集成测试覆盖 SQLite 读写与
> 扫描调度；手工清单覆盖双设备、同步盘延迟与 CalDAV 断网场景。

## 1. Unit tests (Vitest)

| Area | Cases |
|---|---|
| `domain/numbering` | 1–99 Chinese numerals, ten boundary, alpha rollover, heading formats |
| `domain/reports` | grouping, category order, uncategorized last, outside-period exclusion, no double counting, daily/weekly/monthly titles |
| `domain/tasks` | backlog ↔ scheduled ↔ done, reopen with and without dates, soft delete |
| Template validation (P1) | missing required placeholder, unknown placeholder, empty sections |

Run:

```bash
npm test
```

## 2. Integration tests (manual or scripted with a test DB)

1. Create a database in a temporary folder, seed categories, insert tasks,
   complete one, reopen the app, confirm rows survive.
2. Point the app at a missing file; confirm schema creation and no crash.
3. Write to the file externally; confirm the banner appears within one interval.
4. Reload; confirm the new data is visible and the banner clears.
5. Export a DOCX to a path containing spaces and Chinese characters.

## 3. Manual acceptance checklist

### Two-device simulation

- [ ] Machine A writes a task; the file syncs to B; B reloads and sees it.
- [ ] Both write while offline; B's reload shows the banner and does not lose
      A's rows at the database level (P1 merge is not yet implemented — verify
      the documented limitation instead).

### Sync-folder latency

- [ ] Place the file in a sync folder; edit from another tool; confirm the
      scanner fires once, not repeatedly.
- [ ] After Daymark's own write, no banner appears (mtime re-baselining).

### CalDAV (when implemented)

- [ ] Wrong password → clear error, local data unchanged.
- [ ] Airplane mode → cached events remain visible.
- [ ] Removed event → disappears after the next full sync.

## 4. Performance checks

- 20,000 tasks / 60,000 completions: week view renders under 200 ms after load.
- Weekly report generation under 300 ms.
- Scanner CPU cost below 1% on an idle machine (one `stat` per interval).

## 5. Accessibility

- Tab reaches every control; focus ring visible in light and dark.
- Checkbox toggles work with Space/Enter.
- Dialog traps focus and closes on Escape (planned).

## 6. What is not covered yet

- Automated end-to-end UI tests.
- Windows-specific rendering.
- Multiple simultaneous app instances on one machine.
