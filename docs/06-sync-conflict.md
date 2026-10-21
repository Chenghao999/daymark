# 06 · Sync and Conflict Design

> 中文摘要：这是 Daymark 最关键的设计。原则是不让两个进程同时持有同一个 SQLite
> 文件的写锁：本地工作副本 + 共享文件交换。1.0 只做变更检测与提示，自动合并放到 P1。

## 1. The problem

A SQLite file placed in a cloud-sync folder can be written by two machines. If
both hold the file open and write, SQLite locks and WAL files are themselves
synced, which can corrupt the database. Daymark does not assume it is the only
writer.

## 2. Chosen model: local working copy + shared file exchange

```
Machine A                    Synced folder                 Machine B
daymark.db (local)  ⇄  exchange/  ⇄  daymark.db (local)
```

- Each machine keeps its own SQLite file outside the synced folder, or accepts
  that the synced file is only written through atomic replacement.
- Data moves as a **delta package**: a small SQLite file (or JSON bundle)
  containing changed rows since the last exchange, named with the device ID and
  monotonic sequence: `delta-<device>-<seq>.db`.
- On scan, a machine imports deltas from other devices, writes its own delta,
  and removes deltas it has already imported (or moves them to `imported/`).
- The shared file is never held open for writing. Exports use write-to-temp +
  rename; imports happen into the local database.

This removes SQLite lock competition entirely, at the cost of an extra exchange
step.

## 3. 1.0 implementation (shipped)

1.0 ships the **detection half**:

- `sync_meta.last_write_device` and `last_write_at` are updated on every write.
- The scanner polls the database file's mtime at the configured interval.
- Daymark re-baselines the mtime after its own writes, so only external changes
  trigger the banner.
- On an external change with a different `last_write_device`, the UI shows a
  conflict banner; the user clicks Reload, which closes and reopens the
  database and refreshes the views.
- No automatic merge and no silent overwrite.

This is safe but coarse: if two machines edit offline, the last writer to the
sync folder wins at the file level. Document that limitation until P1 lands.

## 4. P1 implementation plan

### Delta format

- Table `change_log(seq INTEGER PK AUTOINCREMENT, entity TEXT, entity_id TEXT,
  op TEXT, changed_at TEXT, device_id TEXT, payload TEXT)`.
- Export rows with `seq > last_exported_seq` into a delta database.
- Import applies rows idempotently by `(device_id, seq)`.

### Conflict rules

Per field, not per row:

| Case | Resolution |
|---|---|
| Only one side changed the field | Take that value |
| Both changed, equal | No conflict |
| Both changed, different | Keep both in `conflicts` and ask the UI |
| Delete vs edit | Keep the edit; surface "deleted elsewhere" |
| Complete vs reopen | Completion wins until the user resolves |

`updated_at` + `device_id` + `row_version` identify the two sides.

### UI

Three actions per conflicted field: **keep mine**, **keep theirs**, **keep
both** (creates a second task). The UI never auto-resolves a genuine conflict.

### Mutual exclusion

- Import/export use a marker file in the exchange folder
  (`lock-<device>.json`, with a timestamp and expiry).
- A machine that sees a fresh lock backs off and retries with jitter.
- Stale locks expire after 5 minutes.

## 5. Non-goals

- CRDT text merge for notes in 1.0.
- Real-time sync; the exchange interval is the resolution.
- Server-side coordination of any kind.
