import { baseUrlFor } from "./presets";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAiProvider } from "./providers/openai";
import { withAiRetry, type AiRetryOptions } from "./retry";
import type { AiConfig, AiProvider } from "./types";

export { baseUrlFor, AI_PROVIDER_PRESETS, findPreset, modelsFor } from "./presets";
export type { AiProviderPreset } from "./presets";
export { aiContextSummary, reportOutline } from "./context";
export { buildPrompt } from "./prompts";
export { aiOutputPath, saveAiOutput } from "./output";
export { estimatePrompt, estimateTokens } from "./usage";
export type { PromptEstimate } from "./usage";
export { costOf, formatCost, formatMoney, normalizePricing } from "./pricing";
export type { AiCost, AiPricing } from "./pricing";
export { isRetryableAiError, withAiRetry } from "./retry";
export type { AiRetryInfo, AiRetryOptions } from "./retry";
export {
  buildTaskPrompt,
  parseTaskResponse,
  MAX_SUGGESTIONS,
  TASK_SUGGESTION_SCHEMA,
} from "./tasks";
export type { TaskPromptInput, TaskSuggestion } from "./tasks";
export type {
  AiConfig,
  AiFeature,
  AiJsonSchema,
  AiPrompt,
  AiProtocol,
  AiProvider,
  AiProviderId,
  AiRequest,
  AiResult,
  AiUsage,
} from "./types";

/**
 * The only place that knows which provider is used. Adding a local or
 * enterprise provider means adding a branch here, not touching the UI.
 *
 * Every provider is wrapped in the shared retry policy: transient failures
 * (408/429/5xx and network errors) are retried twice with exponential backoff,
 * while auth and bad-request errors surface immediately.
 */
export function createAiProvider(config: AiConfig, retry: AiRetryOptions = {}): AiProvider {
  if (!config.enabled) throw new Error("The AI assistant is disabled.");
  const apiKey = config.apiKey.trim();
  if (!apiKey) throw new Error("An API key is required.");
  // A chosen preset supplies its endpoint when the field is empty; a typed
  // relay URL always wins (`presets.ts`).
  const options = { apiKey, model: config.model, baseUrl: baseUrlFor(config) };
  const provider =
    config.protocol === "openai" ? new OpenAiProvider(options) : new AnthropicProvider(options);
  return withAiRetry(provider, retry);
}
