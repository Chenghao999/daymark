import { afterEach, describe, expect, it, vi } from "vitest";
import { aiOutputPath } from "../src/ai";
import {
  DEFAULT_AI,
  isAiConfigured,
  loadAiSettings,
  saveAiSettings,
} from "../src/settings/ai";

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

describe("AI settings", () => {
  it("uses disabled defaults when nothing is stored", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(loadAiSettings()).toEqual(DEFAULT_AI);
    expect(DEFAULT_AI.enabled).toBe(false);
  });

  it("round-trips a saved configuration", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    const config = { enabled: true, apiKey: "sk-ant-test", model: "claude-sonnet-5-5" };
    saveAiSettings(config);
    expect(loadAiSettings()).toEqual(config);
  });

  it("rejects an unknown model and malformed JSON", () => {
    vi.stubGlobal(
      "localStorage",
      fakeStorage({ "daymark.ai.v1": JSON.stringify({ enabled: true, apiKey: "k", model: "gpt" }) }),
    );
    expect(loadAiSettings().model).toBe(DEFAULT_AI.model);

    vi.stubGlobal("localStorage", fakeStorage({ "daymark.ai.v1": "{not json" }));
    expect(loadAiSettings()).toEqual(DEFAULT_AI);
  });

  it("requires both opt-in and a key before the AI panel is offered", () => {
    expect(isAiConfigured({ enabled: false, apiKey: "k", model: DEFAULT_AI.model })).toBe(false);
    expect(isAiConfigured({ enabled: true, apiKey: "  ", model: DEFAULT_AI.model })).toBe(false);
    expect(isAiConfigured({ enabled: true, apiKey: " k ", model: DEFAULT_AI.model })).toBe(true);
  });
});

describe("AI output path", () => {
  it("uses the local date and time so two runs never overwrite each other", () => {
    expect(aiOutputPath("/data", "weekly", new Date(2026, 9, 23, 9, 5, 7))).toBe(
      "/data/_ai/2026-10-23-weekly-090507.md",
    );
    expect(aiOutputPath("/data", "daily", new Date(2026, 9, 23, 9, 5, 8))).not.toBe(
      aiOutputPath("/data", "daily", new Date(2026, 9, 23, 9, 5, 7)),
    );
  });
});
