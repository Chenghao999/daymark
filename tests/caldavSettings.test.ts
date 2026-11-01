import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CALDAV_SETTINGS,
  isCalDavConfigured,
  isCalDavReady,
  loadCalDavSettings,
  saveCalDavSettings,
} from "../src/settings/caldav";

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

describe("CalDAV settings", () => {
  it("starts empty and device-local", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(loadCalDavSettings()).toEqual(DEFAULT_CALDAV_SETTINGS);
    expect(isCalDavConfigured(DEFAULT_CALDAV_SETTINGS.config)).toBe(false);
    expect(isCalDavReady(DEFAULT_CALDAV_SETTINGS.config)).toBe(false);
  });

  it("round-trips credentials, calendars and the import cursor", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    const settings = {
      config: {
        serverUrl: "https://caldav.icloud.com/",
        username: "me",
        password: "app-password",
        calendars: [{ href: "https://caldav.icloud.com/1/calendars/work/", name: "Work" }],
      },
      state: {
        calendars: {
          "https://caldav.icloud.com/1/calendars/work/": {
            ctag: "ctag-1",
            uids: ["uid-1", "uid-2"],
            syncedAt: "2026-11-01T10:00:00.000Z",
          },
        },
      },
      ignoredUids: ["detached-1"],
    };
    saveCalDavSettings(settings);
    expect(loadCalDavSettings()).toEqual(settings);
    expect(isCalDavReady(settings.config)).toBe(true);
  });

  it("drops malformed entries instead of throwing", () => {
    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.caldav.v1": JSON.stringify({
          config: {
            serverUrl: 42,
            calendars: [null, { href: 7 }, { href: "/c/", name: 1 }, { href: "/c/", name: "dup" }],
          },
          state: { calendars: { "/c/": { ctag: 9, uids: ["a", 1, null], syncedAt: 3 } } },
          ignoredUids: "nope",
        }),
      }),
    );
    const loaded = loadCalDavSettings();
    expect(loaded.config.serverUrl).toBe("");
    expect(loaded.config.calendars).toEqual([{ href: "/c/", name: "" }]);
    expect(loaded.state.calendars["/c/"]).toEqual({ ctag: null, uids: ["a"], syncedAt: "" });
    expect(loaded.ignoredUids).toEqual([]);
  });

  it("survives unreadable JSON", () => {
    vi.stubGlobal("localStorage", fakeStorage({ "daymark.caldav.v1": "{" }));
    expect(loadCalDavSettings()).toEqual(DEFAULT_CALDAV_SETTINGS);
  });
});
