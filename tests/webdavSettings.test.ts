import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WEBDAV,
  isWebDavConfigured,
  loadWebDavSettings,
  saveWebDavSettings,
  scrubWebDavPassword,
} from "../src/settings/webdav";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WebDAV settings", () => {
  it("starts empty, manual and device-local", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(loadWebDavSettings()).toEqual(DEFAULT_WEBDAV);
    expect(loadWebDavSettings().autoSyncMinutes).toBe(0);
    expect(isWebDavConfigured(DEFAULT_WEBDAV)).toBe(false);
  });

  it("round-trips credentials, the automatic-sync interval and startup sync", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    const config = {
      url: "https://dav.jianguoyun.com/dav",
      remotePath: "/daymark/",
      username: "me",
      password: "app-password",
      autoSyncMinutes: 30,
      syncOnLaunch: true,
    };
    saveWebDavSettings(config);
    expect(loadWebDavSettings()).toEqual(config);
    expect(isWebDavConfigured(config)).toBe(true);
    // The password has its own slot and never sits in the general config.
    expect(
      JSON.parse(storage.getItem("daymark.webdav.v1") ?? "{}").password,
    ).toBe("");
    expect(storage.getItem("daymark.secret.webdav.password")).toBe(
      "app-password",
    );
  });

  it("scrubs a password saved by an older build after hydration", () => {
    const storage = fakeStorage({
      "daymark.webdav.v1": JSON.stringify({
        url: "https://dav.example.com/dav",
        username: "me",
        password: "old-password",
      }),
    });
    vi.stubGlobal("localStorage", storage);
    expect(loadWebDavSettings().password).toBe("old-password");
    scrubWebDavPassword();
    const stored = JSON.parse(storage.getItem("daymark.webdav.v1") ?? "{}");
    expect(stored.password).toBe("");
    expect(stored.url).toBe("https://dav.example.com/dav");
  });

  it("does not resurrect a legacy password after the user cleared it", () => {
    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.webdav.v1": JSON.stringify({ password: "old-password" }),
        "daymark.secret.webdav.password": "",
      }),
    );
    expect(loadWebDavSettings().password).toBe("");
  });

  it("reads a stored interval that is not a preset as manual only", () => {
    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.webdav.v1": JSON.stringify({
          url: "https://dav.example.com/dav",
          remotePath: "/daymark/",
          username: "me",
          password: "secret",
          autoSyncMinutes: 7,
        }),
      }),
    );
    const loaded = loadWebDavSettings();
    expect(loaded.autoSyncMinutes).toBe(0);
    expect(loaded.url).toBe("https://dav.example.com/dav");
  });

  it("keeps a preset automatic-sync interval", () => {
    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.webdav.v1": JSON.stringify({ autoSyncMinutes: 60 }),
      }),
    );
    expect(loadWebDavSettings().autoSyncMinutes).toBe(60);
  });

  it("fills in missing fields from defaults", () => {
    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.webdav.v1": JSON.stringify({ url: 42, autoSyncMinutes: "often", syncOnLaunch: "yes" }),
      }),
    );
    expect(loadWebDavSettings()).toEqual(DEFAULT_WEBDAV);
  });

  it("survives unreadable JSON", () => {
    vi.stubGlobal("localStorage", fakeStorage({ "daymark.webdav.v1": "{" }));
    expect(loadWebDavSettings()).toEqual(DEFAULT_WEBDAV);
  });
});
