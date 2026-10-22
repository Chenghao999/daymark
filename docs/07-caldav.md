# 07 · CalDAV Integration (design)

> 中文摘要：CalDAV 是一期之后的模块。本文定义服务器发现、认证、增量同步与错误
> 降级。1.0 尚未实现，代码中保留模块边界。

## 1. Scope

- F-18 bind an account (iCloud, Nextcloud, Fastmail, generic CalDAV).
- F-19 pull events read-only into the calendar.
- F-20 (P2) write tasks back as VTODO or VEVENT.
- F-21 incremental sync via `getctag` / `etag`.

## 2. Discovery and auth

1. Ask for the server base URL and credentials (app-specific password where the
   provider requires it).
2. `PROPFIND` on the principal URL to find `calendar-home-set`.
3. `PROPFIND` the home set for calendars, `displayname`, `supported-calendar-component-set`.
4. Store credentials in the OS keychain — never in a Markdown file, the synced
   `_settings.md`, or device settings.

## 3. Sync state machine

```
idle → fetching(ctag) → unchanged → idle
                      └→ changed → list(etag) → fetch new/changed → apply → idle
```

- `getctag` unchanged: stop.
- Changed: `REPORT calendar-query` for `VEVENT` (and `VTODO` if enabled).
- Apply events idempotently keyed by `(calendar_id, uid)`.
- Store `etag` per event; skip unchanged.
- Deletions: an event missing from the full listing is marked `deleted`.

## 4. Mapping to local tasks

| CalDAV | Daymark |
|---|---|
| uid | `external_uid` |
| summary | title |
| dtstart / dtend | start_at / end_at |
| due (VTODO) | due_at |
| categories | matched by name to a local category, else uncategorized |
| description | notes |

Imported rows: `source = 'caldav'`, read-only in the UI unless the user
"detaches" them into a local task.

## 5. Error handling

| Error | Behaviour |
|---|---|
| Network error | mark account offline, keep cache, retry with backoff |
| 401/403 | stop syncing, prompt re-auth, keep local data |
| 404 on calendar | mark calendar missing, keep previously imported events |
| Invalid iCalendar | skip entry, log UID, continue |
| Server without ctag | full sync, minimum interval 15 minutes |

## 6. Library options

- `ts-caldav` (TypeScript) covers discovery, event/VTODO CRUD and ctag/etag.
- If implemented in Rust: `caldav` crate, or direct HTTP + `ical` parsing.
- Decision deferred until the core is stable; the module boundary is
  `src/features/caldav/` and it must not leak into `domain/`.

## 7. Privacy

CalDAV credentials and event data stay on the device. Calendar content is never
included in exported reports unless the user explicitly schedules it.
