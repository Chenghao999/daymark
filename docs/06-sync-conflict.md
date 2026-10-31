# 06 · Sync and Conflict Design

> 中文摘要：这是 Daymark 最关键的设计。0.1 用“一天一个 Markdown 文件”把并发
> 编辑面缩小到单日，并用整个文件夹的签名做变更检测；自动合并放到 P1。原则是
> 永不静默覆盖别人的改动，检测不到就不动手。

## 1. The problem

A data folder placed in a cloud-sync folder is written by two machines. A single
monolithic database file has two failure modes: the client uploads a half-written
file, or one device's whole history replaces another's. Daymark does not assume
it is the only writer, and it no longer shares one file for everything.

Per-day files change the shape of the problem: two devices editing different
days touch different files, so most concurrency is harmless. The remaining risk
is the same day edited on both sides, plus the small shared files
(`_settings.md`, `_categories.md`, `_backlog.md`).

## 2. Chosen model: per-day files + whole-folder detection

```
Device A                     Synced folder                    Device B
2026-10-22.md   ⇄   2026-10/2026-10-22.md   ⇄   2026-10-22.md
                    2026-11/2026-11-03.md
```

- Every write is atomic (temp file + rename), so a sync client never uploads a
  partial day file.
- Day files are the unit of collision. A conflict is usually one day, not the
  whole history.
- The unit of detection is the folder, not a file.

## 3. 0.1 implementation (shipped)

Detection is the only shipped half:

- Rust exposes `tree_signature(root) → {fileCount, latestMtimeMs, fingerprint}`.
  It walks `.md` files to depth 2, skipping dotfiles, and returns the number of
  files, the newest mtime, and a hash over every file's path, size and mtime.
  The scanner compares the fingerprint, so a sync client that replaces a file
  while preserving its mtime is still detected. Adding or removing any file
  changes the file count and the fingerprint too.
- `src/sync/scanner.ts` polls that signature every `scanIntervalSec`.
- Daymark calls `touch()` after its own writes, re-baselining the signature so
  its own write does not raise the banner.
- On a signature change the app shows a reload banner; the user clicks
  **Reload**, which calls `openStore(root)` again.
- Automatic merge is not part of this detection layer; it is applied later by
  the WebDAV engine (§4) and never silently overwrites an unresolved conflict.

This is coarse on purpose: it is a single IPC call per interval regardless of
how many files exist. It detects change, not authorship — `deviceId` in the
file comments is what tells a human who wrote what.

If two devices edit the same day offline, the sync client decides which file
lands last, and that version wins for that file. Document that limitation until
P1 lands.

## 4. P1 implementation plan

### Merge unit

Merge at the task level, using the metadata already written into each file:

| Identity | Source |
|---|---|
| Task id | `id` in `<!-- daymark task ... -->` |
| Version | `rowVersion`, then `updatedAt` |
| Author | `deviceId` |

No change log and no delta database are needed: the files themselves carry the
versioning fields, and a merge can be computed from the two copies of a day
file.

### Conflict rules

Per field, not per line:

| Case | Resolution |
|---|---|
| Only one side changed the field | Take that value |
| Both changed, equal | No conflict |
| Both changed, different | Keep both in a conflict record and ask the UI |
| Task present on one side only | Keep it (added), unless deleted after the other side's last read |
| Delete vs edit | Keep the edit; surface "deleted elsewhere" |
| Complete vs reopen | Completion wins until the user resolves |

### UI

Three actions per conflict item: **keep mine**, **keep theirs**, **keep both**
(creates a second task; offered for tasks only, since a setting key or a
category has one value). The choice is per item — one task, settings key, or
category — because the task merge is record-level. Each item shows a one-line
summary of both sides and the differing fields. The UI never auto-resolves a
genuine conflict. After resolution the file is written once, uploaded, and the
baseline advances.

### Guards

- A merge writes only files it actually changed, reusing the atomic write path.
- `_categories.md` and `_settings.md` merge per line / per key, so simultaneous
  edits to different categories do not collide.
- If the folder signature changes during a merge, abort and ask the user to
  reload rather than retrying blindly.

### Implementation status (v1, 2026-10-29)

`src/sync/merge/` implements the day-file half of this design:

| Piece | Result |
|---|---|
| Merge unit | Task `id` from the metadata comment. A hand-written line without metadata is matched by content instead, because its id is generated anew on every parse |
| Ordering | Higher `rowVersion`, then later `updatedAt`; a completion beats a reopen; two completions → later `completedAt` |
| Combination | Tasks added on either side are unioned; unmanaged lines (extras) from both copies are kept |
| Settings | `mergeSettingsFile`: per key, using the last synced `_settings.md` text as the base |
| Categories | `mergeCategoriesFile`: per category id and field against the same kind of base; a deletion wins only when the other side did not edit the category |
| Unresolved | A tie no rule can order returns a `SyncConflict`: the local file keeps its name, the remote text becomes a conflict copy, and every unordered item is listed with its differing fields |
| Applied by | `syncWebDav` when both sides changed a file: it rewrites the local file, uploads the merged text and advances the baseline; `SyncResult.merged` counts it |
| Resolution UI | `Settings → WebDAV` lists each conflict with **keep mine / keep theirs / keep both**. Applying calls `resolveConflict` (`webdav/resolve.ts`), which recomputes the merge with those answers against the current local file and the conflict copy, then writes both sides. A merged settings or categories file records its new base |
| Still manual | Task deletion tombstones |

Known limitations: task ordering is record-level, not field-level, so when both
devices edit different fields of the same task the newer record wins and the
older field edit is dropped. Deletions of tasks are not represented in the file
format, so a task removed on one side is re-added by the merge. Settings and
categories need a stored base: the first sync after upgrading without one treats
any differing value as a conflict, then records the base for next time.

## 5. Roadmap

Manual WebDAV sync (first version) is implemented in `src/sync/webdav/`: it uses
a per-device baseline and merges day/backlog files task by task and
`_settings.md` / `_categories.md` key by key before falling back to conflict
copies. Unresolved items are answered in Settings (§4); the conflict copy stays
on disk as a backup after resolution. Background sync and the AI assistant are
still roadmap items; see `19-roadmap.md` §3.8 and §4. CalDAV remains
design-only (doc 07).

## 6. Non-goals

- CRDT text merge for notes.
- Real-time sync; the scan interval is the resolution.
- Server-side coordination of any kind.
