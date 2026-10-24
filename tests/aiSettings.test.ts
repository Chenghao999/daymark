import { afterEach, describe, expect, it, vi } from "vitest";
import { aiOutputPath } from "../src/ai";
import {
  DEFAULT_AI,
  isAiConfigured,
  loadAiSettings,
  normalizeBaseUrl,
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
    const config = {
      enabled: true,
      protocol: "openai" as const,
      apiKey: "sk-test",
      model: "deepseek-chat",
      baseUrl: "https://ai.example.com/v1",
    };
    saveAiSettings(config);
    expect(loadAiSettings()).toEqual(config);
  });

  it("accepts a custom model name and protocol, and falls back on junk", () => {
    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.ai.v1": JSON.stringify({
          enabled: true,
          apiKey: "k",
          model: "oppo-ai-large",
          protocol: "openai",
          baseUrl: "https://relay.example.com/",
        }),
      }),
    );
    const loaded = loadAiSettings();
    expect(loaded.model).toBe("oppo-ai-large");
    expect(loaded.protocol).toBe("openai");
    expect(loaded.baseUrl).toBe("https://relay.example.com");

    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.ai.v1": JSON.stringify({
          protocol: "carrier-pigeon",
          model: "   ",
          baseUrl: "not a url",
        }),
      }),
    );
    const fallback = loadAiSettings();
    expect(fallback.protocol).toBe("anthropic");
    expect(fallback.model).toBe(DEFAULT_AI.model);
    expect(fallback.baseUrl).toBe("");

    vi.stubGlobal("localStorage", fakeStorage({ "daymark.ai.v1": "{not json" }));
    expect(loadAiSettings()).toEqual(DEFAULT_AI);
  });

  it("only keeps absolute http(s) base URLs", () => {
    expect(normalizeBaseUrl(" https://relay.example.com/v1/ ")).toBe("https://relay.example.com/v1");
    expect(normalizeBaseUrl("http://localhost:8080")).toBe("http://localhost:8080");
    expect(normalizeBaseUrl("relay.example.com")).toBe("");
    expect(normalizeBaseUrl("ftp://relay.example.com")).toBe("");
    expect(normalizeBaseUrl("   ")).toBe("");
  });

  it("requires both opt-in and a key before the AI panel is offered", () => {
    const base = { protocol: "anthropic" as const, baseUrl: "", model: DEFAULT_AI.model };
    expect(isAiConfigured({ ...base, enabled: false, apiKey: "k" })).toBe(false);
    expect(isAiConfigured({ ...base, enabled: true, apiKey: "  " })).toBe(false);
    expect(isAiConfigured({ ...base, enabled: true, apiKey: " k " })).toBe(true);
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
