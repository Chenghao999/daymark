import type {
  CalDavCalendarRef,
  CalDavConfig,
  CalDavSettings,
  CalDavState,
} from "../sync/caldav/types";

const STORAGE_KEY = "daymark.caldav.v1";

/**
 * CalDAV settings are device-local for the same reason as WebDAV settings: the
 * password must never be written to `_settings.md` or the synced data folder.
 * The import cursor (`state`) is also per device, because it describes what
 * this device last read from the server.
 */
export const DEFAULT_CALDAV_SETTINGS: CalDavSettings = {
  config: {
    serverUrl: "",
    username: "",
    password: "",
    calendars: [],
  },
  state: { calendars: {} },
  ignoredUids: [],
  refreshMinutes: 0,
};

/** Intervals offered in Settings; any stored value outside this set is off. */
export const CALDAV_REFRESH_MINUTES = [0, 15, 30, 60] as const;

/** A stored interval that is not one of the presets is read as manual only. */
export function normalizeRefreshMinutes(value: unknown): number {
  return typeof value === "number" &&
    (CALDAV_REFRESH_MINUTES as readonly number[]).includes(value)
    ? value
    : 0;
}

export function loadCalDavSettings(): CalDavSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefault();
    const parsed = JSON.parse(raw) as {
      config?: Partial<CalDavConfig>;
      state?: CalDavState;
      ignoredUids?: unknown;
      refreshMinutes?: unknown;
    };
    return {
      config: {
        serverUrl: text(parsed.config?.serverUrl),
        username: text(parsed.config?.username),
        password: text(parsed.config?.password),
        calendars: calendars(parsed.config?.calendars),
      },
      state: stateOf(parsed.state),
      ignoredUids: stringList(parsed.ignoredUids),
      refreshMinutes: normalizeRefreshMinutes(parsed.refreshMinutes),
    };
  } catch {
    return cloneDefault();
  }
}

export function saveCalDavSettings(settings: CalDavSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Device-local convenience; a failed write only means re-entering the URL.
  }
}

export function isCalDavConfigured(config: CalDavConfig): boolean {
  return config.serverUrl.trim().length > 0;
}

export function isCalDavReady(config: CalDavConfig): boolean {
  return isCalDavConfigured(config) && config.calendars.length > 0;
}

function cloneDefault(): CalDavSettings {
  return {
    config: { ...DEFAULT_CALDAV_SETTINGS.config, calendars: [] },
    state: { calendars: {} },
    ignoredUids: [],
    refreshMinutes: 0,
  };
}

function calendars(value: unknown): CalDavCalendarRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CalDavCalendarRef[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const entry = item as { href?: unknown; name?: unknown };
    const href = text(entry.href);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    result.push({ href, name: text(entry.name) });
  }
  return result;
}

function stateOf(value: CalDavState | undefined): CalDavState {
  if (!value || typeof value !== "object" || !value.calendars) return { calendars: {} };
  const result: CalDavState = { calendars: {} };
  for (const [href, raw] of Object.entries(value.calendars)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as {
      ctag?: unknown;
      uids?: unknown;
      keys?: unknown;
      syncedAt?: unknown;
    };
    result.calendars[href] = {
      ctag: typeof entry.ctag === "string" ? entry.ctag : null,
      uids: stringList(entry.uids),
      keys: stringList(entry.keys),
      syncedAt: text(entry.syncedAt),
    };
  }
  return result;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
