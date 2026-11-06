import { afterEach, describe, expect, it, vi } from "vitest";
import { aiOutputPath } from "../src/ai";
import { baseUrlFor, findPreset, modelsFor } from "../src/ai/presets";
import {
  DEFAULT_AI,
  isAiConfigured,
  loadAiSettings,
  normalizeBaseUrl,
  saveAiSettings,
  scrubAiApiKey,
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
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    const config = {
      enabled: true,
      provider: "deepseek" as const,
      protocol: "openai" as const,
      apiKey: "sk-test",
      model: "deepseek-chat",
      baseUrl: "https://ai.example.com/v1",
      pricing: { inputPerMillion: 0.27, outputPerMillion: 1.1, currency: "USD" },
    };
    saveAiSettings(config);
    expect(loadAiSettings()).toEqual(config);
    // The API key has its own slot and never sits in the general config.
    expect(JSON.parse(storage.getItem("daymark.ai.v1") ?? "{}").apiKey).toBe(
      "",
    );
    expect(storage.getItem("daymark.secret.ai.apiKey")).toBe("sk-test");
  });

  it("normalizes stored pricing and ignores malformed prices", () => {
    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.ai.v1": JSON.stringify({
          provider: "openai",
          pricing: { inputPerMillion: 0.27, outputPerMillion: 1.1, currency: " cny " },
        }),
      }),
    );
    expect(loadAiSettings().pricing).toEqual({
      inputPerMillion: 0.27,
      outputPerMillion: 1.1,
      currency: "cny",
    });

    // A bad price disables estimates; it never silently becomes zero.
    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.ai.v1": JSON.stringify({
          pricing: { inputPerMillion: -1, outputPerMillion: 1.1 },
        }),
      }),
    );
    expect(loadAiSettings().pricing).toBeNull();

    // Configs saved before pricing existed simply have none.
    vi.stubGlobal(
      "localStorage",
      fakeStorage({ "daymark.ai.v1": JSON.stringify({ provider: "openai" }) }),
    );
    expect(loadAiSettings().pricing).toBeNull();
  });

  it("scrubs an API key saved by an older build after hydration", () => {
    const storage = fakeStorage({
      "daymark.ai.v1": JSON.stringify({
        enabled: true,
        protocol: "openai",
        apiKey: "sk-old",
        baseUrl: "https://api.deepseek.com/v1",
      }),
    });
    vi.stubGlobal("localStorage", storage);
    expect(loadAiSettings().apiKey).toBe("sk-old");
    scrubAiApiKey();
    const stored = JSON.parse(storage.getItem("daymark.ai.v1") ?? "{}");
    expect(stored.apiKey).toBe("");
    expect(stored.baseUrl).toBe("https://api.deepseek.com/v1");
  });

  it("does not resurrect a legacy key after the user cleared it", () => {
    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.ai.v1": JSON.stringify({ apiKey: "sk-old" }),
        "daymark.secret.ai.apiKey": "",
      }),
    );
    expect(loadAiSettings().apiKey).toBe("");
  });

  it("maps a configuration saved before presets to the right provider", () => {
    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.ai.v1": JSON.stringify({
          enabled: true,
          apiKey: "k",
          protocol: "openai",
          model: "deepseek-chat",
          baseUrl: "https://api.deepseek.com/v1",
        }),
      }),
    );
    expect(loadAiSettings().provider).toBe("deepseek");

    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.ai.v1": JSON.stringify({
          enabled: true,
          apiKey: "k",
          protocol: "openai",
          model: "gpt-4.1-mini",
          baseUrl: "",
        }),
      }),
    );
    expect(loadAiSettings().provider).toBe("openai");

    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.ai.v1": JSON.stringify({
          enabled: true,
          apiKey: "k",
          protocol: "anthropic",
          model: "claude-opus-5-5",
          baseUrl: "https://relay.example.com",
        }),
      }),
    );
    expect(loadAiSettings().provider).toBe("custom");
  });

  it("keeps a stored provider and its protocol in step", () => {
    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "daymark.ai.v1": JSON.stringify({
          enabled: true,
          provider: "qwen",
          protocol: "anthropic",
          apiKey: "k",
          model: "qwen-plus",
          baseUrl: "",
        }),
      }),
    );
    const loaded = loadAiSettings();
    expect(loaded.provider).toBe("qwen");
    expect(loaded.protocol).toBe("openai");
    expect(baseUrlFor(loaded)).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
  });

  it("resolves the endpoint from the preset and lets a typed URL win", () => {
    expect(baseUrlFor({ provider: "deepseek", baseUrl: "" })).toBe("https://api.deepseek.com/v1");
    expect(baseUrlFor({ provider: "deepseek", baseUrl: "https://relay.example.com/v1/" })).toBe(
      "https://relay.example.com/v1",
    );
    expect(baseUrlFor({ provider: "anthropic", baseUrl: "" })).toBe("");
    expect(findPreset("qwen")?.defaultModel).toBe("qwen-plus");
    expect(modelsFor("qwen")).toContain("qwen-max");
    expect(modelsFor("custom")).toEqual([]);
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
    const base = {
      provider: "anthropic" as const,
      protocol: "anthropic" as const,
      baseUrl: "",
      model: DEFAULT_AI.model,
      pricing: null,
    };
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
