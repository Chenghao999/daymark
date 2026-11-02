# 07 · CalDAV Integration

> 中文摘要：CalDAV v1 已实现只读导入：发现日历、按 ctag 增量拉取 VEVENT、把事件
> 映射为 `source = "caldav"` 的只读任务，可"转为本地任务"；凭据只存在设备本地，
> 永不写回服务器。VTODO 与写回（F-20）仍未实现。

## 1. Scope

| ID | Requirement | Status |
|---|---|---|
| F-18 | Bind an account (iCloud, Nextcloud, Fastmail, generic CalDAV) | Implemented (manual discovery) |
| F-19 | Pull events read-only into the calendar | Implemented |
| F-20 | Write tasks back as VTODO or VEVENT | Not implemented (P2) |
| F-21 | Incremental sync via `getctag` / `etag` | Implemented (ctag + full REPORT) |

The module lives in `src/sync/caldav/` — the design originally proposed
`src/features/caldav/`, but this is a sync concern, not a screen. It imports
`domain/` and `storage/` but never the other way round.

## 2. Discovery and auth

1. The settings card asks for the server base URL and credentials (an
   app-specific password where the provider requires one).
2. `PROPFIND` depth 0 on the base URL for `current-user-principal`; on failure,
   fall back to `/.well-known/caldav`.
3. `PROPFIND` the principal for `calendar-home-set`.
4. `PROPFIND` depth 1 on the home set for collections; keep only
   `calendar` resources, drop system collections (inbox, outbox,
   notification, trash), and read `displayname`.
5. The user ticks the calendars to import. The selection, the server URL and
   the credentials are stored device-locally.

`CalDavClient` (`client.ts`) knows the verbs and the multistatus grammar; the
HTTP transport stays in Rust. `PROPFIND` and `REPORT` go through the same
`webdav_request` command the WebDAV sync already used, so no new capability was
needed.

## 3. Sync state machine

```
idle → PROPFIND getctag → unchanged → idle
                       └→ changed → REPORT calendar-query (VEVENT) → parse
                                  → plan diff → apply → idle
```

- `getctag` unchanged: the calendar is skipped entirely.
- A server without `getctag` returns no ctag and every sync fetches the
  calendar; the only throttle is the manual trigger or the optional timer.
- The REPORT is a full `calendar-query` for `VEVENT` with `calendar-data`; it
  is not an `etag`-based delta. The ctag check is what avoids the fetch when
  nothing changed.
- Sync is manual by default. The user may opt into an in-app timer (every 15,
  30 or 60 minutes); it runs only while the window is open, skips a run while
  another import is in flight, and has no retry or backoff.
- Per-calendar UID sets are the deletion basis: a series UID present last time
  and absent now means its tasks are deleted.
- A malformed object is skipped and surfaced as a per-calendar error; the rest
  of the calendar still imports.

## 4. Mapping to local tasks

| CalDAV | Daymark |
|---|---|
| `uid` | `externalUid` (occurrences add `#occ=<start>`) |
| `summary` | `title` |
| `dtstart` / `dtend` | `startAt` / `endAt` (device-local wall clock) |
| `duration` | `endAt` when `dtend` is absent |
| `categories` | matched case-insensitively to `nameEn` / `nameZh`, else `null` |
| `description` | `notes` |
| `all-day DTSTART` | `allDay = true`, `endAt = null` |

- Imported rows are `source = "caldav"` and read-only: the checkbox, completion
  and editor fields are disabled; there is no delete.
- "Turn into local task" (`detachExternalTask`) sets `source = "local"` and
  `externalUid = null` and records the series UID in `ignoredUids`, so a later
  sync never re-imports it. `ignoredUids` is device-local.
- Recurring series are expanded within the window (past 366 days, future 731
  days). Supported: `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY` with `INTERVAL`,
  `COUNT`, `UNTIL`, `BYDAY`, `BYMONTHDAY`, `WKST`, plus `EXDATE`.
  A `RECURRENCE-ID` override replaces just its occurrence (a moved or renamed
  instance keeps the task keyed by its original recurrence start), and a
  cancelled override removes just that occurrence. An override with
  `RANGE=THISANDFUTURE` shifts or cancels that occurrence and every later one;
  a closer override, a single-occurrence override or an `EXDATE` still wins. A
  cancelled series deletes all of its imported occurrences.
- The per-calendar import cursor stores both the series UIDs and the occurrence
  keys from the previous listing. An occurrence that disappears from the
  listing (EXDATE, dropped out of the window, deleted on the server) deletes
  its imported task. On the first sync after upgrading, `keys` is empty, so no
  occurrence is removed by the cursor until the next sync.
- Calendar events are excluded from reports and AI context. They become
  ordinary report data only after the user detaches them.

## 5. Error handling

| Error | Behaviour |
|---|---|
| Network error | the error is shown in the settings card; imported tasks stay |
| 401/403 | a typed `CalDavError` with the status; sync stops, local data stays |
| Non-207 response | treated as an error for the calendar; skipped, others continue |
| 404 on calendar | the error is reported; previously imported events stay |
| Invalid iCalendar object | skipped; the error is collected per calendar |
| Server without ctag | full sync on every manual run |
| Timeout | 45 s per request, from the Rust transport |

## 6. Storage and privacy

| Data | Where | Synced? |
|---|---|---|
| Server URL, username, password | `localStorage["daymark.caldav.v1"]` | No |
| Selected calendars, selection names | same key | No |
| Per-calendar ctag, last UID set and occurrence-key set, `syncedAt` | same key | No |
| Automatic import interval | same key | No |
| Detached (ignored) series UIDs | same key | No |
| Imported tasks | Markdown day files | Yes, via the data folder |

The credentials are device-local rather than in the OS keychain: the app has no
keychain dependency today, and `localStorage` is no weaker than the WebDAV and
AI credentials already stored there. They never enter `_settings.md`, a day
file or the synced data folder.

## 7. Known limitations

- No write-back, no VTODO, no event editing.
- No OS-level background sync and no push. The user runs "Import now", or opts
  into an in-app timer (15/30/60 minutes) that only runs while the app is open.
- `RANGE=THISANDPRIOR` is not supported; only `THISANDFUTURE` and single
  occurrences are applied.
- Detaching is per device: `ignoredUids` is not synced, so another device that
  imports the same series will still create its read-only tasks. The detached
  copy is a local task and is not removed by a later calendar deletion.
- Tasks are matched by `externalUid`; changing an event's UID on the server
  looks like a deletion plus a creation.

## 8. Not in scope

- `ts-caldav` and the Rust `caldav` crate: the client is a small hand-written
  PROPFIND/REPORT parser over the existing transport.
- Scheduling, free/busy, attendees, attachments, reminders and alarms. Nested
  `VALARM` blocks are skipped.
