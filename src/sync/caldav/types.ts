/**
 * Device-local CalDAV configuration and the shapes shared by the client, the
 * iCalendar parser and the import engine.
 *
 * Credentials live only in this device's localStorage, exactly like WebDAV:
 * they must never reach `_settings.md` or the synced data folder.
 */
export interface CalDavConfig {
  /** Server base URL, e.g. `https://caldav.icloud.com/`. */
  serverUrl: string;
  username: string;
  password: string;
  /** Calendars the user chose to import. Empty until discovery has run. */
  calendars: CalDavCalendarRef[];
}

export interface CalDavCalendarRef {
  /** Absolute collection URL, used for REPORT/PROPFIND. */
  href: string;
  /** `displayname`, or the last path segment when the server has none. */
  name: string;
}

/** Discovery returns the same shape as a saved reference. */
export type CalDavCalendar = CalDavCalendarRef;

/** Per-calendar cursor. `uids` is the previous full listing, for deletions. */
export interface CalDavCalendarState {
  /** `getctag` value; null when the server does not expose one. */
  ctag: string | null;
  uids: string[];
  syncedAt: string;
}

export interface CalDavState {
  calendars: Record<string, CalDavCalendarState>;
}

export interface CalDavSettings {
  config: CalDavConfig;
  state: CalDavState;
  /**
   * Series UIDs the user turned into local tasks. Importing skips them, so a
   * detached event does not come back as a duplicate on the next sync.
   */
  ignoredUids: string[];
}

export interface CalDavRequest {
  method: string;
  url: string;
  username?: string | null;
  password?: string | null;
  depth?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface CalDavHttpResponse {
  status: number;
  body: string;
}

/**
 * One HTTP call. The production implementation is the Rust `webdav_request`
 * command (REPORT/PROPFIND and Basic auth are unavailable in a WebView);
 * tests inject a function returning canned responses.
 */
export type CalDavTransport = (request: CalDavRequest) => Promise<CalDavHttpResponse>;

/** A single occurrence of a calendar event, already in local wall-clock time. */
export interface CalDavEvent {
  /** VEVENT UID; shared by every occurrence of a recurring series. */
  uid: string;
  /**
   * Stable per-occurrence key: `uid` for a single event, `uid#occ=<start>`
   * for one occurrence of a recurring series. Stored as `externalUid`.
   */
  key: string;
  title: string;
  notes: string;
  /** Raw `CATEGORIES` values, matched by name against local categories. */
  categories: string[];
  /** `YYYY-MM-DD` for all-day events, `YYYY-MM-DDTHH:mm` otherwise. */
  startAt: string;
  /** Same format as `startAt`, or null when the event has no end. */
  endAt: string | null;
  allDay: boolean;
  cancelled: boolean;
}

export interface CalDavSyncResult {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  /** Number of selected calendars considered. */
  calendars: number;
  errors: string[];
  /** Replaces the saved state after the run, whether or not it fully succeeded. */
  nextState: CalDavState;
}
