import type {
  CalDavCalendarRef,
  CalDavConfig,
  CalDavSettings,
  CalDavState,
} from "../sync/caldav/types";
import { localSecretOf, queueSecret, scrubStoredSecret } from "./secrets";

const STORAGE_KEY = "daymark.caldav.v1";
const PASSWORD_SECRET = "caldav.password";

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
  importOnLaunch: false,
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
      importOnLaunch?: unknown;
    };
    const localPassword = localSecretOf(PASSWORD_SECRET);
    return {
      config: {
        serverUrl: text(parsed.config?.serverUrl),
        username: text(parsed.config?.username),
        // The dedicated secret slot wins, including an empty clear-tombstone;
        // the field is kept for installs saved before the keychain migration.
        password: localPassword ?? text(parsed.config?.password),
        calendars: calendars(parsed.config?.calendars),
      },
      state: stateOf(parsed.state),
      ignoredUids: stringList(parsed.ignoredUids),
      refreshMinutes: normalizeRefreshMinutes(parsed.refreshMinutes),
      importOnLaunch: parsed.importOnLaunch === true,
    };
  } catch {
    return cloneDefault();
  }
}

export function saveCalDavSettings(settings: CalDavSettings): void {
  try {
    // The password lives in the OS credential store (or its dedicated local
    // fallback), never in the general settings object.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...settings,
        config: { ...settings.config, password: "" },
      }),
    );
  } catch {
    // Device-local convenience; a failed write only means re-entering the URL.
  }
  queueSecret(PASSWORD_SECRET, settings.config.password);
}

/** Called after hydration: old builds must no longer find the password here. */
export function scrubCalDavPassword(): void {
  scrubStoredSecret(STORAGE_KEY, ["config", "password"]);
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
    importOnLaunch: false,
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
