import type { AiConfig, AiProtocol, AiProviderId } from "./types";

/**
 * The vendors Daymark can reach without the user looking up an endpoint.
 * Anthropic speaks `/v1/messages`; every other preset speaks the
 * OpenAI-compatible `/chat/completions` format. The list is only a shortcut:
 * the endpoint and model stay editable, so a relay or a newer model name works
 * with the same code.
 */
export interface AiProviderPreset {
  id: Exclude<AiProviderId, "custom">;
  protocol: AiProtocol;
  /** Endpoint filled in when the preset is chosen; "" is the vendor's official one. */
  baseUrl: string;
  /** Suggestions only — the model field accepts any name. */
  models: readonly string[];
  defaultModel: string;
}

export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    id: "anthropic",
    protocol: "anthropic",
    baseUrl: "",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
    defaultModel: "claude-opus-5-5",
  },
  {
    id: "openai",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o3-mini"],
    defaultModel: "gpt-4.1-mini",
  },
  {
    id: "deepseek",
    protocol: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
  },
  {
    id: "qwen",
    protocol: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen-long"],
    defaultModel: "qwen-plus",
  },
  {
    id: "moonshot",
    protocol: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    defaultModel: "moonshot-v1-32k",
  },
  {
    id: "zhipu",
    protocol: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-plus", "glm-4-air", "glm-4-flash"],
    defaultModel: "glm-4-air",
  },
  {
    id: "gemini",
    protocol: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    defaultModel: "gemini-2.5-flash",
  },
  {
    id: "openrouter",
    protocol: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["openai/gpt-4.1-mini", "deepseek/deepseek-chat", "google/gemini-2.5-flash"],
    defaultModel: "openai/gpt-4.1-mini",
  },
];

const PRESET_IDS: readonly AiProviderId[] = [
  ...AI_PROVIDER_PRESETS.map((preset) => preset.id),
  "custom",
];

export function isProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && (PRESET_IDS as readonly string[]).includes(value);
}

export function findPreset(id: AiProviderId): AiProviderPreset | null {
  return AI_PROVIDER_PRESETS.find((preset) => preset.id === id) ?? null;
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Maps a stored or hand-edited configuration to the closest preset, so a
 * config saved before presets existed still shows the right vendor.
 */
export function inferProvider(protocol: AiProtocol, baseUrl: string): AiProviderId {
  const url = normalizeUrl(baseUrl);
  if (protocol === "anthropic") return url ? "custom" : "anthropic";
  if (!url) return "openai";
  const match = AI_PROVIDER_PRESETS.find(
    (preset) => preset.protocol === "openai" && normalizeUrl(preset.baseUrl) === url,
  );
  return match?.id ?? "custom";
}

export function normalizeProvider(
  value: unknown,
  protocol: AiProtocol,
  baseUrl: string,
): AiProviderId {
  return isProviderId(value) ? value : inferProvider(protocol, baseUrl);
}

/** A preset vendor's own protocol; a custom config keeps the supplied one. */
export function protocolFor(provider: AiProviderId, fallback: AiProtocol): AiProtocol {
  return findPreset(provider)?.protocol ?? fallback;
}

/**
 * The endpoint actually used. A typed base URL always wins; when it is empty
 * the preset's default applies, so a saved preset keeps working even if the
 * field was cleared.
 */
export function baseUrlFor(config: Pick<AiConfig, "provider" | "baseUrl">): string {
  const typed = config.baseUrl.trim().replace(/\/+$/, "");
  if (typed) return typed;
  return findPreset(config.provider)?.baseUrl ?? "";
}

export function modelsFor(provider: AiProviderId): readonly string[] {
  return findPreset(provider)?.models ?? [];
}

export function defaultModelFor(provider: AiProviderId): string {
  return findPreset(provider)?.defaultModel ?? "";
}
