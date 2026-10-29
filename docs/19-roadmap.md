# 19 · Roadmap: WebDAV sync, AI assistant and the modular plan

> **Status:** partly implemented. M0–M5 have shipped (WebDAV v1 in §3.8, AI v1 in
> §4.9, natural-language entry v1 in §4.10); custom AI endpoints, dark mode and
> automated packaging are also complete (M7, M8). M6 v1 — automatic merge of
> tasks, settings and categories — has shipped (§3.9); the conflict-resolution
> UI and CalDAV remain planned. Documents 01–18 are the source of truth for what
> exists; this document records only the plan and its trade-offs. Date:
> 2026-10-29. Baseline version `0.1.0`; storage has moved from SQLite to
> Markdown text.
>
> **中文摘要：** Daymark（日迹）的路线图。M0–M5 已落地（WebDAV 第一版见 §3.8，
> AI 第一版见 §4.9，自然语言录入第一版见 §4.10）；自定义 AI 接口、暗色模式与
> 自动打包也已完成（M7、M8）；M6 第一版（任务、设置与分类的自动合并）已落地
> （§3.9），冲突解决界面与 CalDAV 仍是计划。已实现的模块以 01–18 号文档为准，
> 本文只记录路线与取舍。日期：2026-10-29，基线版本 `0.1.0`，存储已从 SQLite
> 切换为 Markdown 文本。

---

## 1. Principles · 总原则

1. **Text first.** Every new capability must be able to read and write Markdown
   files; it must not lock data into a new binary container or a remote account.
   AI and sync are "another way to read and write these texts", not new data
   sources.
2. **Opt-in, off by default.** WebDAV and AI must be switched on by the user in
   Settings, and the user must know which data is sent where.
3. **Never silent overwrite.** A sync conflict keeps both files; AI output is
   written only after the user confirms it, and tasks are never changed
   automatically.
4. **Modular by feature.** Each capability gets one directory and one public
   entry point; the UI depends only on the interface, never on protocol details.
   Avoid piling sync, AI and report logic into `App.tsx`.

---

## 2. Milestones · 里程碑总览

| Milestone | Theme | Depends on | Deliverable |
|---|---|---|---|
| M0 | Markdown storage | — | Done: `src/storage/*`, `_settings.md`, migration |
| M1 | Custom assessment period and annual report | M0 | Done: `src/domain/periods.ts`, year tab |
| M2 | Week-start setting | M0 | Done: `weekStartsOn`, shared by the day/week/month views and weekly reports |
| M3 | WebDAV sync | M0, M2 | v1 done: `src/sync/webdav/*`, "WebDAV sync" card in Settings (see §3.8) |
| M4 | AI assistant (report polishing / period review) | M0, M1 | v1 done: `src/ai/*`, "AI assistant" on the Reports page (see §4.9) |
| M5 | AI natural-language entry | M4 | v1 done: `src/ai/tasks.ts`, "Fill fields" one-sentence entry in the task editor (see §4.10) |
| M6 | Automatic merge and CalDAV | M3 | v1 done: task-level merge plus per-key settings/categories merge in `src/sync/merge/*`, applied by `syncWebDav` (see §3.9); conflict-resolution UI and CalDAV still planned |
| M7 | Custom AI endpoints + dark mode | M4 | Done: protocol / base URL / custom model (§4.11); appearance follows the system or switches manually |
| M8 | Automated packaging and release | M0 | Done: `.github/workflows/release.yml`, `npm run release` (doc 10 §7–8); first packaged `v0.1.0` on 2026-10-24, all four platforms succeeded, installers attached to the draft release |

Ordering note: M3 and M4 are independent and can proceed in parallel; both
depend on M0's file contract, so **stabilise the Markdown format before
connecting external capabilities**. M6 comes last because automatic merge needs
clear conflict semantics, and those semantics should be proven by WebDAV sync
first.

---

## 3. WebDAV sync · WebDAV 同步

### 3.1 Goals · 目标

Let users sync the same data folder to WebDAV services such as Nutstore (坚果云),
Nextcloud, Synology and ownCloud without depending on any one vendor's desktop
client. Desktop sync clients (iCloud, OneDrive, the Nutstore client) remain the
preferred option; WebDAV is the fallback when no desktop client exists.

### 3.2 Remote layout · 远端布局

The remote directory mirrors the local one exactly, so it can be inspected and
migrated by hand:

```
<webdav-root>/
  _settings.md
  _categories.md
  _backlog.md
  2026-10/2026-10-22.md
  2026-10/2026-10-23.md
```

No remote-only index file is introduced. The files are the index; when a
manifest is needed, generate it locally on demand.

### 3.3 Credentials and settings · 凭据与设置

| Field | Stored in | Synced | Notes |
|---|---|---|---|
| `webdavUrl` | local localStorage | No | Each device may point at a different service |
| `webdavUsername` | local localStorage | No | |
| `webdavPassword` | v1: local localStorage (stated in the UI; later versions move to the system keychain) | **Never** | Must not be written to `_settings.md`, or the password would sync out with the folder |
| `webdavEnabled` | local localStorage | No | Per-device switch |
| `webdavRemotePath` | local localStorage | No | Remote root path, default `/daymark/` |

Settings shows only "configured / not configured" and never echoes the password.

### 3.4 Sync algorithm (v1: manual "Sync now") · 同步算法

1. **Local manifest:** read only Daymark's data files — `_settings.md`,
   `_categories.md` and `_backlog.md` in the root, plus
   `YYYY-MM/YYYY-MM-DD.md`. Produce `{path, sha256}` and the text to upload.
2. **Remote manifest:** `PROPFIND` depth 1, then one depth-1 pass per directory;
   then `GET` each file and compute `sha256`. If any remote file cannot be read,
   abort without writing a single byte.
3. **Three-way comparison** of the local hash, the remote hash and the last-sync
   baseline (stored locally per device):
   - only one side exists → `upload` / `download`
   - both sides identical → skip
   - both differ, but only one side changed since the baseline → the changed side wins
   - both changed since the baseline (or they differ on first sync) → `conflict`
4. **Execute:**
   - `upload`: `PUT` to `<name>.daymark-tmp`, then `MOVE` over the target; if the
     server does not support `MOVE` (405/501), fall back to a direct `PUT`.
   - `download`: atomic local write (`.tmp` + rename).
   - `conflict`: **overwrite neither side**. The local copy keeps the original
     name; the remote version is written as
     `<name> (conflict <device8> <yyyyMMdd-HHmmss>).md` and listed in Settings.
     The baseline does not advance, so the same conflict keeps being reported
     until it is merged and synced again.
5. **No deletes:** sync never deletes files on either side; a deletion on one
   side does not propagate to the other.
6. **Commit and refresh:** successful paths update the baseline; failed paths
   keep the old baseline and retry next time. If anything was downloaded, call
   `reloadFromDisk()`; otherwise call `scanner.touch()`, so sync writes are not
   mistaken for external modifications.

v1 does no background scheduling, no `If-Match` conditional requests and no
automatic merge; the user presses "Sync now" once per sync. v2 adds scheduled
sync, ETag conditional requests and a merge UI.

### 3.5 Module layout · 模块划分

```
src/sync/webdav/
  client.ts      # PROPFIND/GET/PUT/MOVE/DELETE, auth and error normalisation
  manifest.ts    # local file manifest (reuses the storage/fs tree walk)
  plan.ts        # pure function: local/remote manifests → operation plan + conflicts
  engine.ts      # executes the plan, writes back, progress callbacks
  types.ts       # WebDavConfig, RemoteEntry, SyncPlan, SyncResult
```

The UI calls only `engine.syncNow(config, root, onProgress)`. `plan.ts` is pure
and can be covered by Vitest without a real server.

### 3.6 Transport choice · 传输层选择

- Option A: implement a `webdav_request` command with `reqwest` on the Rust
  side; the front end passes only method/path/headers. Pros: no WebView CORS
  restrictions; the password never enters JS memory. Cons: new dependencies and
  capability declarations.
- Option B: `tauri-plugin-http` + front-end `fetch`. Fast to build, but every
  domain needs a capability entry, and credentials end up in front-end memory.

**Recommendation: A.** Add `webdav.rs` under `src-tauri` exposing the minimal
command surface: `webdav_propfind`, `webdav_get`, `webdav_put`, `webdav_move`.
Credentials come from the system keychain (`keyring` crate) or one-off command
parameters; never log them.

### 3.7 Acceptance criteria · 验收标准

- Empty remote + 3 local files: after upload the remote structure matches and
  the content is byte-for-byte identical.
- Change one task title on the remote and another file locally: after sync both
  survive and the conflict list is empty.
- Both sides change the same file: one conflict copy is created, the original
  file is not overwritten, and the UI shows both.
- Offline, 401, remote 507: readable errors; local files intact (temp file +
  rename).
- Chinese file names, spaces, `#`, `%`: URL encoding is correct.

### 3.8 Implementation status (first version) · 第一版实现状态

Shipped (2026-10-23):

| Item | Result |
|---|---|
| Transport | `src-tauri/src/webdav.rs`, a single command `webdav_request`, `reqwest` + rustls, 45 s timeout; HTTP errors returned as data |
| Front-end modules | `src/sync/webdav/{types,client,manifest,plan,baseline,engine}.ts`; settings in `src/settings/webdav.ts` |
| UI | Settings "WebDAV sync" card: address, remote directory, username, password, Test connection, Sync now, progress, result, conflict-copy list |
| Decision | Three-way comparison (local / remote / baseline), pure function `planSync`; **never deletes, never silently overwrites** |
| Security | Password stored only in local localStorage, never written to `_settings.md`; Basic auth is sent only when a username is filled in |
| Tests | 20 unit tests across `webdavPlan`, `webdavClient` and `webdavManifest`; `npm run typecheck`, `npm run test`, `npm run build` and `cargo check` all pass |

First-version boundaries (deliberate, not defects):

- Syncs only files Daymark knows about; other files the user puts in the folder
  are not mirrored.
- Manual trigger only; no background schedule, no sync at login.
- Conflicts produce copies and a list only; there is no in-app merge editor.
- Not yet validated end to end against a real WebDAV service (the §3.7
  checklist still needs a manual run against Nutstore / Nextcloud); unit tests
  cover the pure logic, not the network or differences in each server's
  `PROPFIND` behaviour.
- The password lives in localStorage, not yet in the system keychain.

Next (M3 v2): keychain storage, `If-Match`/ETag overwrite protection, scheduled
sync, integration tests against a local `rclone serve webdav`.

### 3.9 Automatic merge (M6, first version) · 自动合并

Shipped (2026-10-29): `src/sync/merge/{types,tasks,files,index}.ts`, covered by
19 unit tests in `tests/mergeTasks.test.ts` and `tests/mergeFiles.test.ts`.

| Item | Result |
|---|---|
| Trigger | A path whose two copies both changed in `planSync` |
| Task unit | Task `id` from the metadata comment; metadata-less hand-written lines match by content |
| Task rules | Higher `rowVersion`, then later `updatedAt`; completion beats reopen; tasks added on either side are unioned; unmanaged lines from both copies are kept |
| Settings | Per key, with the last synced text kept in the device-local baseline as the base |
| Categories | Per category id and field against the same base; a deletion wins only when the other side did not edit the category |
| Clean merge | Local file rewritten, remote `PUT` with the same text, baseline advanced, counted as `merged` in `SyncResult` |
| Unresolved | Neither side is written; the remote copy becomes a conflict copy exactly as before |
| Not done | The keep-mine / keep-theirs / keep-both UI, deletion tombstones for tasks, field-level merging of task records |

Boundary: without a per-task base, task ordering is record-level. Two devices
editing different fields of the same task get the newer record, not a merge of
both fields. Settings and categories store a small `baseText` in the baseline;
the first sync after upgrading without one treats any difference as a conflict
and records it for next time.

---

## 4. AI assistant · AI 助手

### 4.1 Goals and non-goals · 目标与非目标

**Goals:** make the last step from "record → report" less work.

- **Polishing** weekly/monthly reports: turn generated entries into coherent
  prose.
- **Period review:** based on completion records, surface "what was finished
  this week, what slipped".
- **Natural-language entry:** split one sentence into task, date and category
  (M5).
- **Planning suggestions:** suggest a schedule from the backlog and historical
  durations (later).

**Non-goals:** no automatic task editing, no cloud account system, no blanket
upload of the whole data directory.

### 4.2 Privacy model · 隐私模型

1. Off by default. When enabled, show an explanation: requests go to the model
   provider the user configured.
2. **Bring your own key:** v1 stores it in local localStorage (stated in the
   UI); later versions move it to the system keychain. It is never written to
   `_settings.md` and never synced with the folder.
3. **Minimal context:** send only the report title, period, category names,
   task titles and dates for the current report period; **never notes, task
   IDs, device IDs, local paths or the entire file history**.
4. **Preview before sending:** the panel always shows "this will send N
   categories, M entries, about K characters" and can expand to show the exact
   text; the request is made only after the user presses Generate.
5. **Output is not written automatically:** the AI result first appears in an
   editable panel; it is written only when the user presses "Save to `_ai/`",
   as `_ai/YYYY-MM-DD-<kind>-HHmmss.md`, never overwriting earlier results.

### 4.3 Technology choices · 技术选型

- Official SDK: `@anthropic-ai/sdk` (TypeScript), default model
  `claude-opus-5-5`.
- Uses adaptive thinking `thinking: {type: "adaptive"}`; report polishing and
  structured extraction are both reasoning tasks.
- Long reports use streaming to avoid timeouts; `stream.finalMessage()` returns
  the complete result.
- When strict JSON is required (e.g. natural-language task parsing), use
  structured outputs (`output_config.format`) instead of prompting "return only
  JSON".
- Compatibility layer: the `AiProvider` interface allows local models
  (Ollama / LM Studio) or enterprise gateways later; v1 implements only
  Anthropic, and other providers are explicitly marked "not implemented".

### 4.4 Module layout · 模块划分

v1 actual structure (`4.9` records the differences from the plan):

```
src/ai/
  types.ts             # AiProvider, AiRequest, AiResult, AiFeature, AiConfig, AiJsonSchema
  context.ts           # pure: ReportDocument → the Markdown text to send
  prompts.ts           # pure: AiRequest → {system, user}
  tasks.ts             # pure: one sentence → prompt / schema / validated task suggestions
  providers/
    anthropic.ts       # official SDK; loaded dynamically on first call
  output.ts            # the only entry point that saves to _ai/
  index.ts             # createAiProvider + public exports
```

Natural-language entry (M5) did not get its own `prompts/parseTask.ts`: it
shares `AiPrompt` with the report features, so it lives in the same `tasks.ts`.
The UI still depends only on the public interface in `index.ts` and never
constructs an SDK client directly. Assembly in `context.ts`, `prompts.ts` and
`tasks.ts` is pure, so unit tests can use fixed samples without a real API.

### 4.5 Phase 1: report polishing · 第一阶段功能：报告润色

Input: `ReportDocument` (title, period, categories, entries, completed count).
Output: one paragraph of Chinese or English prose that preserves category order
and adds no new facts.

Constraints written into the system prompt:

- Use only tasks present in the input; invent no numbers, names or project
  names.
- Keep the original entries as the "source of truth"; polishing only organises
  language.
- Output language follows `settings.language`.
- A length cap (e.g. 600 characters) is configurable.

UI: a new "AI polish" button on the Reports page → sidebar preview → "Copy" /
"Insert into report notes" / "Save as `_ai/` file". The original text is always
retained.

### 4.6 Phase 2: natural-language entry (M5) · 第二阶段：自然语言录入

Example input: "Next Wednesday at 3 pm, meet with Mr. Zhang, prepare the quote,
remind me one day ahead."

Flow:

1. `parseTask.ts` assembles the current date, time zone and category list.
2. Call the model with structured outputs returning
   `{title, startAt, endAt, dueAt, categoryId, priority, notes}[]`.
3. The front end validates with `zod` or a hand-written validator: dates parse,
   category IDs exist, titles are non-empty.
4. Open the task editor prefilled; call `createTask` only after the user
   confirms.

Never write files directly; on parse failure show the raw model output and
allow manual correction.

### 4.7 Cost, offline and failure handling · 成本、离线与失败处理

- Show an estimate in Settings: "this request is about X input / Y output
  tokens"; make no hard promise.
- Request failures (401, 429, timeout) do not affect local data; show a
  retryable error.
- When offline, disable the button and show "network required".
- Never log keys, full request bodies or task notes; log only the feature name,
  duration and token counts.

### 4.8 Acceptance criteria · 验收标准

- With no key configured, the AI button is visible but clicking it points to
  Settings and sends no request.
- Cancelling at the preview stage produces no file changes.
- Polished output contains no tasks absent from the input.
- Dates parsed from natural language fall in the user's local time zone, and
  are correct across months and years.
- With AI off, all network requests stop and no code path touches the SDK.

### 4.9 Implementation status (first version) · 第一版实现状态

Shipped (2026-10-23):

| Item | Result |
|---|---|
| Provider | `AiProvider` interface; `AnthropicProvider` uses the official `@anthropic-ai/sdk`, default model `claude-opus-5-5`, adaptive thinking, streaming, `finalMessage()`; the SDK is imported dynamically and stays out of the startup bundle |
| Context | Pure functions `reportOutline` / `buildPrompt`; only the report title, period, counts, category names, task titles and dates |
| Privacy | Off by default; the panel shows entry count, character count and input-token estimate, and can expand to preview the exact text sent; the key is stored only in local localStorage |
| Output | The result is editable; only "Save to `_ai/`" writes `_ai/YYYY-MM-DD-<kind>-HHmmss.md`, never overwriting older files; `_ai/` does not participate in WebDAV sync |
| UI | Settings "AI assistant" card (switch, key, model); Reports page "AI assistant" button → polish / period review |
| Tests | Unit tests for `aiPrompt`, `aiSettings` and `aiUsage`; 99 tests in total; typecheck and build pass |

Differences from the plan / acceptance criteria:

- With no key configured the button is **hidden**, rather than "visible but
  points to Settings". The Settings card is always shown and explains how to
  enable it.
- The key lives in localStorage, not yet in the system keychain.
- **No end-to-end call has been made with a real API key** (none was
  available); prompt assembly, settings parsing and output paths have unit
  tests, but the SDK's network path is unverified. On first use, configure a key
  in Settings, run a small report, and check the result and billing.
- A rough token estimate is shown before sending; the server's actual
  input/output token counts (`AiUsage`) are shown afterwards, but no price —
  model pricing changes, so avoid quoting stale amounts.
- Offline detection and automatic retry are not done yet (§4.7).

Next (M4 v2): keychain storage, token/cost estimation, offline detection and
retry, and inserting polished text into report exports instead of only writing
`_ai/`.

### 4.10 Natural-language task entry (first version) · M5 第一版实现状态

Shipped (2026-10-24):

| Item | Result |
|---|---|
| Entry point | "Describe it in one sentence / 用一句话描述" at the top of the task editor → **Fill fields**; shown only when AI is enabled and a key is present |
| Structure | `TASK_SUGGESTION_SCHEMA` handed to Anthropic structured outputs (`completeJson`), not a "return only JSON" prompt |
| Context | `buildTaskPrompt` sends only the current local time (with weekday), the UI language, the category `id → name` list and that sentence; no existing tasks or notes |
| Validation | `parseTaskResponse` checks each item: real date, `HH:mm` range, all-day tasks keep only the date, end not before start, category id must exist, priority 0–3 only, drop items with an empty title, at most 10 |
| Behaviour | **Fills the form only**: writes title, category, start/end/due, priority, all-day and notes into the editor; the user saves as usual; never creates tasks automatically |
| Multiple tasks | When one sentence yields several tasks, list them as buttons so the user picks one; never apply all |
| Failure | JSON structure errors, no tasks and network errors are all shown inside the form; the editor's original content is unchanged |
| Tests | 16 unit tests in `tests/aiTasks.test.ts`; 99 tests in total; typecheck and build pass |

Differences from the plan / acceptance criteria:

- `zod` was not added: structured outputs already guarantee the shape, and the
  hand-written `parseTaskResponse` validator is enough, saving a runtime
  dependency.
- On parse failure only an error message is shown; the raw model output is
  **not** displayed (it is JSON, of limited use to the user; it can be observed
  in the console when debugging).
- There is no "remind me one day ahead" capability: the data model has no
  reminder field, and the prompt does not pretend to support one; `dueAt` means
  only the due date.
- Again, **no end-to-end call with a real API key**; prompts, schema and
  validation have unit-test coverage, but the network path is unverified.

M5 v2 has completed "create all N tasks at once" (still triggered by a user
button, never automatically). Next: highlight relative-time parse results for
the user to confirm; support a `reminders` field before handling "remind me one
day ahead". The AI button is disabled offline, and a failed request can be
retried directly.

### 4.11 Custom AI endpoints (M7) · 自定义 AI 接口

The original provider could reach only Anthropic's official endpoint and
offered only three models, which made it unusable for relays, enterprise
gateways or services such as Oppo AI. `AiConfig` now has three more fields, all
stored on this device only:

| Field | Purpose |
|---|---|
| `protocol` | `anthropic` (`/v1/messages`) or `openai` (`/v1/chat/completions`) |
| `baseUrl` | Empty uses the official endpoint; fill in a relay/gateway base address and the app appends the path |
| `model` | Any non-empty model name; the presets are only dropdown suggestions |

Implementation notes:

- `createAiProvider` is the only branch point: `AnthropicProvider` passes
  `baseUrl` to the official SDK's `baseURL`; `OpenAiProvider` uses `fetch`
  directly and adds no second SDK.
- The OpenAI-compatible path first requests `response_format: json_schema`; when
  the server rejects it (4xx), it retries once with `json_object` and appends
  the schema to the system prompt; `parseTaskResponse` also strips Markdown code
  fences for weaker implementations.
- `baseUrl` accepts only absolute `http(s)` addresses; trailing slashes are
  stripped; invalid values fall back to the official endpoint.
- The panel still shows the token estimate and actual usage; the button is
  disabled offline (`navigator.onLine`) and becomes "Retry" after a failure;
  `AnthropicProvider` sets `maxRetries: 2` explicitly.

Known limitations: still not validated end to end with a real key; no special
headers for proxy authentication; no pricing shown.

**Dark mode:** Settings → Appearance offers Follow system / Light / Dark,
defaulting to Follow system. The theme is a per-device setting and is not
written to `_settings.md` (desktop and laptop may have different preferences).

---

## 5. Web build / PWA feasibility (optional) · Web 版 / PWA 的可行性

If the "webdev" mentioned by the user means a browser version, evaluate it
separately and do not mix it with WebDAV:

- The Tauri front end is React + Vite and can be built as a static site.
- File access must use the File System Access API (Chromium) or zip
  import/export; Safari/Firefox support is incomplete.
- Without Tauri's atomic rename and arbitrary path access, automatically
  writing `_settings.md` back requires the user to authorise a directory.
- Conclusion: **do it after the desktop app is stable**; the first version
  could offer at most "read-only preview + export", with no promise of full
  editing. If WebDAV is all you want, follow §3.

---

## 6. Modular boundaries · 模块化与代码边界

| Directory | Does one thing | Not allowed |
|---|---|---|
| `src/domain/` | Pure computation: task state, periods, reports, numbering | File IO, React, network |
| `src/storage/` | Markdown parse/serialise, paths, repository, migration | UI state, network |
| `src/sync/` | Change detection; WebDAV transport and planning | Directly mutating React state |
| `src/ai/` | Context assembly, providers, prompts, actions | Writing files directly |
| `src/features/` | Pages and interaction | Protocol details, file-format details |
| `src/settings/` | Setting types, validation, local persistence | Business rules |
| `src-tauri/` | File system, keychain, WebDAV transport | Business decisions |

When adding a feature, first ask "which layer does this belong to", then create
the directory; stop piling logic into `App.tsx`. `App.tsx` only wires things
together: it opens the store, refreshes data, switches views and calls actions.

---

## 7. Testing and release gates · 测试与发布门槛

Before each milestone merges:

1. `npm run typecheck`, `npm test` and `npm run build` are all green.
2. New pure functions have unit tests (periods, plan generation, context
   trimming, parse validation).
3. `cargo check` passes; new Rust commands are registered in doc 14.
4. Manual acceptance covers: first launch, migration, power/network loss,
   conflicts and Chinese paths.
5. Docs are updated in the same batch: 05 (format), 06 (sync), 14 (interfaces),
   15 (usage) and 17 (troubleshooting).

WebDAV integration tests use a local `rclone serve webdav` or Docker's
`bytemark/webdav`, never a real cloud drive; test accounts and passwords exist
only in test environment variables.

AI tests never call the real API: `AiProvider` uses a fake returning fixed
text/JSON to verify context assembly, the preview flow and failure branches.

---

## 8. Risks and open questions · 风险与待决事项

| Risk | Impact | Mitigation |
|---|---|---|
| The sync client partially writes a Markdown file | Corrupt file | Atomic writes + temp file; on parse failure keep the raw text and warn |
| Both ends edit the same file | Data loss | Conflict copy, never overwrite; line-level merge later |
| WebDAV server differences (Nutstore/Nextcloud) | Sync failure | Depend only on PROPFIND/GET/PUT/MOVE; normalise error codes; integration tests cover both |
| Keychain unavailable on Linux | Nowhere to store the key | Fall back to "enter per session", never on disk |
| AI output contains invented content | Inaccurate report | Send only factual entries; prompts forbid additions; preview confirmation |
| Uncontrolled API cost | User expense | Show estimates, limit context, per-feature switches |
| Model/API changes | Maintenance cost | `AiProvider` isolation; locked SDK version; graceful error handling |

Open questions:

1. Should WebDAV v1 support self-signed certificates? (Recommendation: no;
   ask users to use a certificate trusted by the system.)
2. Should the AI default provider be Anthropic only, or also
   OpenAI-compatible? (Recommendation: Anthropic first, with the extension
   point in place.)
3. Should the `_ai/` output directory be inside or outside the sync scope? It
   is not in `.gitignore`; is it synced? (Recommendation: sync it, but state in
   the UI that these are generated artefacts that can be deleted at any time.)

---

## 9. References · 参考

- 05 Data model: Markdown file format and fields
- 06 Sync and conflict: the current scanner and future merge strategy
- 14 Interface reference: existing Rust commands and TS modules
- 18 Development guide: verification commands and doc-update rules
- Anthropic TypeScript SDK: <https://github.com/anthropics/anthropic-sdk-typescript>
- WebDAV RFC 4918: <https://www.rfc-editor.org/rfc/rfc4918>
