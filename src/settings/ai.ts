import type { AiConfig } from "../ai/types";

const STORAGE_KEY = "daymark.ai.v1";

export const AI_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;

export const DEFAULT_AI: AiConfig = {
  enabled: false,
  apiKey: "",
  model: "claude-opus-5-5",
};

/**
 * AI settings are device-local: the API key must never be written to
 * `_settings.md` or the data folder, where it would sync to every device and
 * every backup.
 */
export function loadAiSettings(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI };
    const parsed = JSON.parse(raw) as Partial<AiConfig>;
    const model =
      typeof parsed.model === "string" && (AI_MODELS as readonly string[]).includes(parsed.model)
        ? parsed.model
        : DEFAULT_AI.model;
    return {
      enabled: parsed.enabled === true,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model,
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
