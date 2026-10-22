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
- No automatic merge and no silent overwrite.

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

Three actions per conflicted field: **keep mine**, **keep theirs**, **keep
both** (creates a second task). The UI never auto-resolves a genuine conflict.
After resolution the day file is written once, with a fresh `rowVersion`.

### Guards

- A merge writes only files it actually changed, reusing the atomic write path.
- `_categories.md` and `_settings.md` merge per line / per key, so simultaneous
  edits to different categories do not collide.
- If the folder signature changes during a merge, abort and ask the user to
  reload rather than retrying blindly.

## 5. Roadmap

Manual WebDAV sync (first version) is implemented in `src/sync/webdav/`: it uses
a per-device baseline and produces conflict copies, but it does **not** merge —
the sections above remain the design for merging. Background sync and the AI
assistant are still roadmap items; see `19-roadmap.md` §3.8 and §4. CalDAV
remains design-only (doc 07).

## 6. Non-goals

- CRDT text merge for notes.
- Real-time sync; the scan interval is the resolution.
- Server-side coordination of any kind.
