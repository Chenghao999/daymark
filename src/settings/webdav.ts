import type { WebDavConfig } from "../sync/webdav/types";
import { localSecretOf, queueSecret, scrubStoredSecret } from "./secrets";

const STORAGE_KEY = "daymark.webdav.v1";
const PASSWORD_SECRET = "webdav.password";

export const DEFAULT_WEBDAV: WebDavConfig = {
  url: "",
  remotePath: "/daymark/",
  username: "",
  password: "",
  autoSyncMinutes: 0,
  syncOnLaunch: false,
};

/** Intervals offered in Settings; any stored value outside this set is off. */
export const WEBDAV_SYNC_MINUTES = [0, 15, 30, 60] as const;

/** A stored interval that is not one of the presets is read as manual only. */
export function normalizeWebDavSyncMinutes(value: unknown): number {
  return typeof value === "number" &&
    (WEBDAV_SYNC_MINUTES as readonly number[]).includes(value)
    ? value
    : 0;
}

/**
 * WebDAV settings are device-local and must never be written to
 * `_settings.md`: the password would sync to every device and into every
 * backup of the data folder.
 */
export function loadWebDavSettings(): WebDavConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WEBDAV };
    const parsed = JSON.parse(raw) as Partial<WebDavConfig>;
    const localPassword = localSecretOf(PASSWORD_SECRET);
    return {
      url: typeof parsed.url === "string" ? parsed.url : "",
      remotePath: typeof parsed.remotePath === "string" ? parsed.remotePath : DEFAULT_WEBDAV.remotePath,
      username: typeof parsed.username === "string" ? parsed.username : "",
      // The dedicated secret slot wins, including an empty clear-tombstone;
      // the field is kept for installs saved before the keychain migration.
      password:
        localPassword ??
        (typeof parsed.password === "string" ? parsed.password : ""),
      autoSyncMinutes: normalizeWebDavSyncMinutes(parsed.autoSyncMinutes),
      syncOnLaunch: parsed.syncOnLaunch === true,
    };
  } catch {
    return { ...DEFAULT_WEBDAV };
  }
}

export function saveWebDavSettings(config: WebDavConfig): void {
  try {
    // The password lives in the OS credential store (or its dedicated local
    // fallback), never in the general settings object.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...config, password: "" }),
    );
  } catch {
    // Device-local convenience; a failed write only means re-entering the URL.
  }
  queueSecret(PASSWORD_SECRET, config.password);
}

/** Called after hydration: old builds must no longer find the password here. */
export function scrubWebDavPassword(): void {
  scrubStoredSecret(STORAGE_KEY, ["password"]);
}

export function isWebDavConfigured(config: WebDavConfig): boolean {
  return config.url.trim().length > 0;
}
