import type { AiConfig, AiProtocol } from "../ai/types";

const STORAGE_KEY = "daymark.ai.v1";

export const AI_PROTOCOLS: readonly AiProtocol[] = ["anthropic", "openai"];

/** Presets shown in the model datalist; any other non-empty name is accepted. */
export const AI_MODELS = [
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
  "gpt-4.1-mini",
  "deepseek-chat",
] as const;

export const DEFAULT_AI: AiConfig = {
  enabled: false,
  protocol: "anthropic",
  apiKey: "",
  model: "claude-opus-5-5",
  baseUrl: "",
};

/**
 * AI settings are device-local: the API key must never be written to
 * `_settings.md` or the data folder, where it would sync to every device and
 * every backup. The base URL is device-local for the same reason — it can
 * reveal an internal gateway address.
 */
export function loadAiSettings(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI };
    const parsed = JSON.parse(raw) as Partial<AiConfig>;
    return {
      enabled: parsed.enabled === true,
      protocol: normalizeProtocol(parsed.protocol),
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model: normalizeModel(parsed.model),
      baseUrl: normalizeBaseUrl(parsed.baseUrl),
    };
  } catch {
    return { ...DEFAULT_AI };
  }
}

export function saveAiSettings(config: AiConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // A failed write only means re-entering the key next launch.
  }
}

/** The AI panel is offered only when the user opted in and supplied a key. */
export function isAiConfigured(config: AiConfig): boolean {
  return config.enabled && config.apiKey.trim().length > 0;
}

export function normalizeProtocol(value: unknown): AiProtocol {
  return value === "openai" ? "openai" : "anthropic";
}

/** A free-form model name is required for relays that rename models. */
export function normalizeModel(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_AI.model;
  const model = value.trim().slice(0, 200);
  return model || DEFAULT_AI.model;
}

/**
 * Only absolute http(s) URLs are kept. A typo would otherwise fail later as an
 * opaque network error, so anything else falls back to the official endpoint.
 */
export function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const url = value.trim().replace(/\/+$/, "");
  if (!url) return "";
  if (!/^https?:\/\/[^\s/]+/i.test(url)) return "";
  return url.slice(0, 500);
}
