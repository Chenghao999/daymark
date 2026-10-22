import type { WebDavConfig } from "../sync/webdav/types";

const STORAGE_KEY = "daymark.webdav.v1";

export const DEFAULT_WEBDAV: WebDavConfig = {
  url: "",
  remotePath: "/daymark/",
  username: "",
  password: "",
};

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
    return {
      url: typeof parsed.url === "string" ? parsed.url : "",
      remotePath: typeof parsed.remotePath === "string" ? parsed.remotePath : DEFAULT_WEBDAV.remotePath,
      username: typeof parsed.username === "string" ? parsed.username : "",
      password: typeof parsed.password === "string" ? parsed.password : "",
    };
  } catch {
    return { ...DEFAULT_WEBDAV };
  }
}

export function saveWebDavSettings(config: WebDavConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Device-local convenience; a failed write only means re-entering the URL.
  }
}

export function isWebDavConfigured(config: WebDavConfig): boolean {
  return config.url.trim().length > 0;
}
