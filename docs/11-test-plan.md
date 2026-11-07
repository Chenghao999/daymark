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
| `storage/tombstone` | marker round-trip, malformed markers ignored, dedupe by id, delete-vs-edit comparison, filtering stored tasks |
| `storage/syncFolder` | iCloud, OneDrive (personal/business/CloudStorage), Google Drive, Dropbox (team), Nutstore (en/zh), Syncthing, case and separator handling, no partial-name matches |
| `sync/webdav/plan` | upload/download only, unchanged, one-sided change wins, both-sided conflict, first sync, stale baseline, no deletions, deterministic order |
| `sync/webdav/client` | remote path normalisation, URL encoding (`space`, `#`, `%`), href resolution, PROPFIND with and without namespaces, XML entities, conditional PUT headers, 412 reporting, GET ETag |
| `sync/webdav/manifest` | file whitelist, content hash changes with content, files disappearing mid-scan |
| `sync/webdav/engine` | whole `syncWebDav` / `resolveConflict` against in-memory IO, client and baseline: first sync, download, task and settings merges, conflict copy, deletion marker, abort when a remote read fails, decisions and baseline advancement, `If-Match`/`If-None-Match` guards, 412 keeps the old baseline, weak or missing ETag fallback, stale conflict refusal |
| `sync/merge/tasks` | added tasks, `rowVersion`/`updatedAt` ordering, completion beats reopen, unresolvable ties, explicit decisions, extras, deletion markers, backlog |
| `sync/merge/files` | settings per-key and categories per-field three-way merge, with and without a base, deletions, explicit decisions |
| `sync/caldav/ics` | all-day/UTC/`TZID`/floating time, folded lines, weekly `BYDAY` + `EXDATE` + `COUNT`, daily `UNTIL`, cancelled, `RECURRENCE-ID` replacement/cancellation, orphan override, `THISANDFUTURE`/`THISANDPRIOR` shift/cancel/closest-wins, unknown TZID fallback, missing `UID`/`DTSTART` |
| `sync/caldav/client` | URL normalisation, href resolution, namespace-less multistatus, CDATA, discovery chain, ctag fallback, REPORT content-type/depth, typed 401 |
| `sync/caldav/import` | create/update/unchanged/delete planning, category match by Chinese name, recurring occurrence retention, series deletion, cancelled series vs cancelled occurrence, vanished occurrence via `previousKeys`, missing cursor, detached series, `seriesUidOf` |
| `settings/caldav` | defaults, credential/cursor round-trip including occurrence keys, automatic-import interval presets, malformed-entry sanitisation, unreadable JSON, keychain migration and scrubbing of a legacy password |
| `settings/webdav` | defaults, credential round-trip, automatic-sync interval presets, non-preset interval → manual, missing fields, unreadable JSON, keychain migration and scrubbing of a legacy password |
| `settings/secrets` | local fallback read/write, keychain read, unavailable-keychain fallback, clear tombstone, write success/failure retention, hydration migration, debounced typing writes, nested scrubbing |
| `ai/prompts` | outline rendering, counts, per-feature and per-language system text, author only when set, no ids or paths |
| `ai/appendix` | AI answer Markdown → heading (depth clamped), bullet, blockquote, paragraph and blank blocks; inline emphasis/code/link markers removed; code fences and horizontal rules handled |
| `ai/pricing` | malformed, negative, NaN and out-of-range prices → no estimate; currency defaulting and capping; input/output/total cost; fractional-cent formatting |
| `ai/retry` | success without delay; 5xx, 429 and network errors retried with exponential delays; 4xx not retried; delay cap; exhaustion; `completeJson`; `onRetry` progress; error classification |
| `ai/settings` | defaults, round-trip, provider-preset inference from legacy configs, preset/protocol consistency, endpoint resolution (typed URL wins), custom model and protocol, base URL normalization, malformed JSON, opt-in + key rule, unique output paths, pricing normalization and invalid-price fallback |
| `ai/tasks` | local-time prompt context and weekday, category id → name list, unknown category dropped, impossible dates and out-of-range times rejected, end before start dropped, all-day date-only, priority coercion, multiple tasks, 10-item cap, malformed JSON and wrong shape |
| `ai/usage` | Latin and CJK rates, mixed scripts, prompt halves counted, rounding never fractional |
| `ai/providers/openai` | URL and bearer header, message body, usage mapping, preset endpoint resolution, injected transport, `json_schema` → `json_object` retry on 4xx, `max_tokens` → `max_completion_tokens` retry, HTTP status in the error, empty answer rejected |
| `settings/store` | theme normalization (system/light/dark, junk → system) and that the theme is not part of the synced file |
| `reports/template` | language-specific template path and local timestamp; known/unknown placeholder detection; missing `{{sections}}` rejected; inline placeholders replaced, including a placeholder split across runs by Word; `{{sections}}` replaced by the generated headings and bullets while template text around it is kept; unknown placeholders left as text and reported; AI appendix appended after the sections; 20 MB cap |

WebDAV network behaviour is **not** covered by unit tests: `webdav_request` and
real servers must be exercised by hand (or by a future `rclone serve webdav`
smoke test). Everything above the transport is: the plan/URL/XML logic has unit
tests, and `webdavEngine.test.ts` runs the whole sync and conflict-resolution
flow against an in-memory folder, client and baseline. AI network behaviour is
not covered either: `ai_request` and the real vendor endpoints need a manual
call with a real key; the provider request shape and retries are unit-tested
through an injected transport. CalDAV network behaviour is not covered either:
discovery and REPORT against a real server need a manual run; the multistatus
parser, `.ics` parser, import planner and settings are unit-tested with canned
documents.

Run:

```bash
npm test                # once
npm run test:watch      # while developing
npm run test:coverage   # V8 coverage in coverage/
npm run verify          # typecheck + tests + production build
```

Current suites: `numbering.test.ts`, `reports.test.ts`, `periods.test.ts`,
`markdown.test.ts`, `settingsFile.test.ts`, `tombstone.test.ts`,
`webdavPlan.test.ts`, `webdavClient.test.ts`, `webdavManifest.test.ts`,
`webdavEngine.test.ts`, `webdavSettings.test.ts`, `mergeTasks.test.ts`, `mergeFiles.test.ts`,
`aiPrompt.test.ts`, `aiSettings.test.ts`, `aiTasks.test.ts`, `aiUsage.test.ts`,
`openaiProvider.test.ts`, `theme.test.ts`, `caldavIcs.test.ts`,
`caldavClient.test.ts`, `caldavImport.test.ts`, `caldavSettings.test.ts`,
`secrets.test.ts`, `aiAppendix.test.ts`, `aiPricing.test.ts`,
`aiRetry.test.ts`, `reportTemplate.test.ts`.

AI provider calls are also **not** covered: tests cover prompt construction,
settings parsing and output paths. Verifying the SDK/API path requires a real
key and is done by hand.

Automation: `.github/workflows/ci.yml` runs the suite with coverage on Ubuntu
and `cargo check` on macOS for every pull request and push to `main`. The
coverage report is uploaded as a build artifact. A red run blocks the merge;
see doc 18 §3.1 for the local reproduction commands. The README CI badge shows
the latest result.

**中文要点：** 每次 PR 和推送 `main` 都会自动跑类型检查、带覆盖率的单元测试和构建；
Rust 侧跑 `cargo check`。CI 未通过不得合并，本地用 `npm run verify` 复现。

## 2. Integration tests (manual or scripted against a temporary folder)

1. Create a store in a temporary folder; confirm `_categories.md` is seeded with
   four categories and `_backlog.md` exists.
2. Create a task on a date; confirm `YYYY-MM/YYYY-MM-DD.md` exists with a
   heading, a task line and a metadata comment. Reopen the store and confirm the
   task survives.
3. Edit the day file by hand, adding an unknown line; confirm it is preserved
   after the app rewrites the file.
4. Delete every task in a day; the tasks disappear from the app, and the day
   file either is removed (only hand-written lines were deleted) or keeps a
   single `<!-- daymark deleted … -->` marker per deleted task. `_backlog.md`
   remains.
5. Point the app at a folder containing only `daymark.db`; confirm migration
   runs once and the database is renamed to `daymark.db.migrated-*`.
6. Touch any `.md` file externally; confirm the banner appears within one
   interval and clears after Reload.
7. Export a DOCX to a path containing spaces and Chinese characters.
8. Generate an AI answer, edit it, press **Use in export**, then export: the
   DOCX ends with a page-broken **AI assistant** section whose headings and
   bullets follow Word styles; changing the report period removes the pending
   appendix without touching the saved `_ai/` file.
9. With token prices filled in Settings, generate: an input-cost estimate
   appears before sending and the total estimate after; clearing both prices
   hides the estimates.
10. With a wrong API key, the error appears immediately (no retry); while
    offline or against a 500/429 endpoint, the panel shows the retry wait and
    succeeds on a later attempt.
11. Put a `report.en.docx` into `<data folder>/templates/` with a title, a
    paragraph using `{{title}}`/`{{period}}`/`{{completed_count}}`, and a
    paragraph containing only `{{sections}}`; export: the saved file keeps the
    template's styles, headers and images, the placeholders are replaced and the
    sections appear where `{{sections}}` stood.
12. Rename the template to `report.zh-CN.docx` while the UI stays English: the
    export silently uses the built-in layout (there is no English template).
    Delete the template: same silent fallback. Add `{{brand_colour}}` to a
    template: it stays as text and the status line lists it. Replace the
    template with a non-DOCX file: the export falls back to the built-in layout
    and the status says the template was ignored.

## 3. Manual acceptance checklist

### Two-device simulation

- [ ] Machine A writes a task; the file syncs to B; B reloads and sees it.
- [ ] A edits `2026-10-22.md` and B edits `2026-10-23.md` while offline; after
      sync and reload both days are intact — per-day files do not collide.
- [ ] Both edit the same day offline; the reload banner appears and the last
      file to land wins (desktop sync clients do not merge — verify the
      documented limitation instead). With built-in WebDAV sync, run the same
      case and verify the day file is merged task by task; a same-version tie
      still leaves a `(conflict …)` copy and lists the task in Settings.
- [ ] With built-in WebDAV sync, change the language on A and the week start on
      B; after syncing both values survive with no conflict copy. Change the
      same setting differently on both sides and verify a conflict copy remains.
- [ ] Keep the same setting conflict and answer it in Settings with keep mine,
      then again with keep theirs; the chosen value ends up on both devices and
      the conflict disappears from the list.
- [ ] Create a same-version task tie on both devices; resolve it with keep both
      and verify the day shows two tasks with different ids.
- [ ] Delete a task on A and, without syncing, edit an unrelated task on the
      same day on B; sync both. The deleted task is gone on both sides and the
      day file holds one `daymark deleted` marker.
- [ ] Delete a task on A and edit that same task on B afterwards; sync both.
      The edit wins, the task remains, and the marker is gone.

### Sync-folder latency

- [ ] Place the folder in a sync client; edit from another tool; confirm the
      scanner fires once, not repeatedly.
- [ ] After Daymark's own write, no banner appears (signature re-baselining).
- [ ] Deleting a day file externally also raises the banner (file count drops).

### CalDAV

- [ ] Wrong password → a clear 401 error in the settings card, local tasks
      unchanged.
- [ ] Press **Find calendars** against a real iCloud/Nextcloud account → the
      expected calendars are listed; tick one and **Import now** → events appear
      as read-only tasks with ◆.
- [ ] Press **Import now** again with no server change → the ctag skip reports
      no work and changes nothing.
- [ ] Move or rename an event on the server → the imported task follows after
      the next import; delete it → the task disappears.
- [ ] Open an imported event → fields are disabled; **Turn into local task** →
      the task becomes editable/completable and a later import does not
      re-create it.
- [ ] Build a report covering an imported event's date → the event is not in
      the report until detached.
- [ ] Airplane mode → a readable network error; previously imported tasks stay
      visible.

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
- Live network runs against a real WebDAV or CalDAV server (manual checklist
  above).
