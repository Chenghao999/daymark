import type { AppLanguage, ReportDocument } from "../domain/types";

/**
 * Device-local AI configuration. Like the WebDAV password, the API key never
 * enters `_settings.md` or the data folder.
 */
export interface AiConfig {
  enabled: boolean;
  apiKey: string;
  model: string;
}

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

export interface AiResult {
  text: string;
  model: string;
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
