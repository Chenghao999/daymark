import {
  defaultModelFor,
  normalizeProvider,
  protocolFor,
} from "../ai/presets";
import type { AiConfig, AiProtocol } from "../ai/types";
import { localSecretOf, queueSecret, scrubStoredSecret } from "./secrets";

const STORAGE_KEY = "daymark.ai.v1";
const API_KEY_SECRET = "ai.apiKey";

export const AI_PROTOCOLS: readonly AiProtocol[] = ["anthropic", "openai"];

export const DEFAULT_AI: AiConfig = {
  enabled: false,
  provider: "anthropic",
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
    const storedProtocol = normalizeProtocol(parsed.protocol);
    const baseUrl = normalizeBaseUrl(parsed.baseUrl);
    // A config saved before provider presets existed is mapped to the vendor
    // its protocol and endpoint point at, so Settings shows the right preset.
    const provider = normalizeProvider(parsed.provider, storedProtocol, baseUrl);
    const protocol = protocolFor(provider, storedProtocol);
    const localKey = localSecretOf(API_KEY_SECRET);
    return {
      enabled: parsed.enabled === true,
      provider,
      protocol,
      // The dedicated secret slot wins, including an empty clear-tombstone;
      // the field is kept for installs saved before the keychain migration.
      apiKey:
        localKey ??
        (typeof parsed.apiKey === "string" ? parsed.apiKey : ""),
      model: normalizeModel(parsed.model, defaultModelFor(provider) || DEFAULT_AI.model),
      baseUrl,
    };
  } catch {
    return { ...DEFAULT_AI };
  }
}

export function saveAiSettings(config: AiConfig): void {
  try {
    // The API key lives in the OS credential store (or its dedicated local
    // fallback), never in the general settings object.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...config, apiKey: "" }),
    );
  } catch {
    // A failed write only means re-entering the key next launch.
  }
  queueSecret(API_KEY_SECRET, config.apiKey);
}

/** Called after hydration: old builds must no longer find the key here. */
export function scrubAiApiKey(): void {
  scrubStoredSecret(STORAGE_KEY, ["apiKey"]);
}

/** The AI panel is offered only when the user opted in and supplied a key. */
export function isAiConfigured(config: AiConfig): boolean {
  return config.enabled && config.apiKey.trim().length > 0;
}

export function normalizeProtocol(value: unknown): AiProtocol {
  return value === "openai" ? "openai" : "anthropic";
}

/** A free-form model name is required for relays that rename models. */
export function normalizeModel(value: unknown, fallback = DEFAULT_AI.model): string {
  if (typeof value !== "string") return fallback;
  const model = value.trim().slice(0, 200);
  return model || fallback;
}

/**
 * Only absolute http(s) URLs are kept. A typo would otherwise fail later as an
 * opaque network error, so anything else falls back to the provider default.
 */
export function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const url = value.trim().replace(/\/+$/, "");
  if (!url) return "";
  if (!/^https?:\/\/[^\s/]+/i.test(url)) return "";
  return url.slice(0, 500);
}
