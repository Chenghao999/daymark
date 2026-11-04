import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}));

import {
  hydrateSecret,
  queueSecret,
  readLocalSecret,
  readSecret,
  scrubStoredSecret,
  writeSecret,
} from "../src/settings/secrets";

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

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.isTauri.mockReset();
  mocks.isTauri.mockReturnValue(false);
  vi.stubGlobal("localStorage", fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("device-local secrets", () => {
  it("stores and reads a local copy without a keychain", async () => {
    expect(await writeSecret("webdav.password", "app-password")).toBe(true);
    expect(readLocalSecret("webdav.password")).toBe("app-password");
    expect(await readSecret("webdav.password")).toEqual({
      value: "app-password",
      source: "local",
    });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("reads an existing keychain entry when no local copy exists", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue("keychain-password");
    expect(await readSecret("caldav.password")).toEqual({
      value: "keychain-password",
      source: "keychain",
    });
    expect(mocks.invoke).toHaveBeenCalledWith("secret_get", {
      account: "caldav.password",
    });
  });

  it("treats an empty local copy as a clear, hiding a stale keychain item", async () => {
    mocks.isTauri.mockReturnValue(true);
    vi.stubGlobal(
      "localStorage",
      fakeStorage({ "daymark.secret.ai.apiKey": "" }),
    );
    mocks.invoke.mockResolvedValue("old-key");
    expect(await readSecret("ai.apiKey")).toEqual({ value: "", source: "none" });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("falls back to no secret when the keychain is unavailable", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockRejectedValue(new Error("keychain locked"));
    expect(await readSecret("webdav.password")).toEqual({
      value: "",
      source: "none",
    });
  });

  it("clears the local copy only after the keychain accepts it", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue(undefined);
    expect(await writeSecret("ai.apiKey", "sk-test")).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith("secret_set", {
      account: "ai.apiKey",
      value: "sk-test",
    });
    expect(readLocalSecret("ai.apiKey")).toBe("");

    mocks.invoke.mockRejectedValue(new Error("denied"));
    expect(await writeSecret("ai.apiKey", "sk-new")).toBe(false);
    expect(readLocalSecret("ai.apiKey")).toBe("sk-new");
  });

  it("migrates a legacy value into the keychain at hydration", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue(null);
    expect(await hydrateSecret("webdav.password", "legacy-password")).toBe(
      "legacy-password",
    );
    expect(mocks.invoke).toHaveBeenCalledWith("secret_set", {
      account: "webdav.password",
      value: "legacy-password",
    });
    // The keychain accepted the value, so the local copy is gone.
    expect(readLocalSecret("webdav.password")).toBe("");
  });

  it("prefers the keychain and does not rewrite it at hydration", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue("stored-password");
    expect(await hydrateSecret("caldav.password", "legacy-password")).toBe(
      "stored-password",
    );
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("secret_get", {
      account: "caldav.password",
    });
  });

  it("debounces keychain writes while the user types", async () => {
    vi.useFakeTimers();
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue(undefined);
    queueSecret("ai.apiKey", "sk-a");
    queueSecret("ai.apiKey", "sk-b");
    expect(readLocalSecret("ai.apiKey")).toBe("sk-b");
    expect(mocks.invoke).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("secret_set", {
      account: "ai.apiKey",
      value: "sk-b",
    });
    expect(readLocalSecret("ai.apiKey")).toBe("");
  });

  it("retries a keychain clear when hydration finds a local tombstone", async () => {
    mocks.isTauri.mockReturnValue(true);
    vi.stubGlobal(
      "localStorage",
      fakeStorage({ "daymark.secret.ai.apiKey": "" }),
    );
    mocks.invoke.mockResolvedValue(undefined);
    expect(await hydrateSecret("ai.apiKey", "")).toBe("");
    expect(mocks.invoke).toHaveBeenCalledWith("secret_set", {
      account: "ai.apiKey",
      value: "",
    });
  });

  it("scrubs only the secret from a stored settings object", () => {
    const storage = fakeStorage({
      "daymark.caldav.v1": JSON.stringify({
        config: { serverUrl: "https://caldav.example.com/", password: "pw" },
        refreshMinutes: 30,
      }),
    });
    vi.stubGlobal("localStorage", storage);
    scrubStoredSecret("daymark.caldav.v1", ["config", "password"]);
    expect(JSON.parse(storage.getItem("daymark.caldav.v1") ?? "{}")).toEqual({
      config: { serverUrl: "https://caldav.example.com/", password: "" },
      refreshMinutes: 30,
    });
  });
});
