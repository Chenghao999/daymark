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
            keys: ["uid-1", "uid-2#occ=2026-11-02T09:00"],
            syncedAt: "2026-11-01T10:00:00.000Z",
          },
        },
      },
      ignoredUids: ["detached-1"],
      refreshMinutes: 30,
      importOnLaunch: true,
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
          refreshMinutes: 7,
          importOnLaunch: "yes",
        }),
      }),
    );
    const loaded = loadCalDavSettings();
    expect(loaded.config.serverUrl).toBe("");
    expect(loaded.config.calendars).toEqual([{ href: "/c/", name: "" }]);
    expect(loaded.state.calendars["/c/"]).toEqual({
      ctag: null,
      uids: ["a"],
      keys: [],
      syncedAt: "",
    });
    expect(loaded.ignoredUids).toEqual([]);
    expect(loaded.refreshMinutes).toBe(0);
    expect(loaded.importOnLaunch).toBe(false);
  });

  it("keeps a preset automatic-import interval", () => {
    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.caldav.v1": JSON.stringify({ refreshMinutes: 60 }),
      }),
    );
    expect(loadCalDavSettings().refreshMinutes).toBe(60);
  });

  it("survives unreadable JSON", () => {
    vi.stubGlobal("localStorage", fakeStorage({ "daymark.caldav.v1": "{" }));
    expect(loadCalDavSettings()).toEqual(DEFAULT_CALDAV_SETTINGS);
  });
});
