import type { AppLanguage, ReportDocument } from "../domain/types";
import type { AiPricing } from "./pricing";

/**
 * Device-local AI configuration. Like the WebDAV password, the API key never
 * enters `_settings.md` or the data folder.
 */
export interface AiConfig {
  enabled: boolean;
  /**
   * Vendor preset chosen in Settings. It fills the protocol, endpoint and
   * model suggestions; `custom` keeps whatever the user typed.
   */
  provider: AiProviderId;
  /** Wire protocol the endpoint speaks. */
  protocol: AiProtocol;
  apiKey: string;
  model: string;
  /**
   * Empty means the provider's official endpoint; otherwise a relay/proxy.
   * A non-empty value always wins over the preset default.
   */
  baseUrl: string;
  /**
   * User-supplied token prices (per million tokens) used only to show an
   * estimate after a call. `null` hides cost estimates entirely.
   */
  pricing: AiPricing | null;
}

/**
 * `anthropic` is `/v1/messages` (also used by Anthropic-compatible relays);
 * `openai` is `/v1/chat/completions` (OpenAI and most compatible vendors).
 */
export type AiProtocol = "anthropic" | "openai";

/**
 * Vendors offered in Settings. Every preset except Anthropic speaks the
 * OpenAI-compatible wire format; `custom` lets the user point at a relay or an
 * enterprise gateway.
 */
export type AiProviderId =
  | "anthropic"
  | "openai"
  | "deepseek"
  | "qwen"
  | "moonshot"
  | "zhipu"
  | "gemini"
  | "openrouter"
  | "custom";

/** What the assistant is asked to produce. */
export type AiFeature = "polish" | "review";

/** Everything a prompt needs; built from the derived report, never from files. */
export interface AiRequest {
  feature: AiFeature;
  language: AppLanguage;
  report: ReportDocument;
  userName: string;
}

/** A provider-agnostic prompt. Providers only transport these two strings. */
export interface AiPrompt {
  system: string;
  user: string;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiResult {
  text: string;
  model: string;
  /** Reported by the provider when it returns usage; absent for fakes/old logs. */
  usage?: AiUsage | null;
}

/** A JSON Schema handed to a provider that supports structured outputs. */
export type AiJsonSchema = Record<string, unknown>;

/**
 * The interface every AI provider implements. The UI and the report code only
 * depend on this type, so adding a local model later does not touch them.
 */
export interface AiProvider {
  readonly id: string;
  complete(prompt: AiPrompt): Promise<AiResult>;
  /** Structured output: `result.text` is guaranteed to be JSON matching the schema. */
  completeJson(prompt: AiPrompt, schema: AiJsonSchema): Promise<AiResult>;
}
