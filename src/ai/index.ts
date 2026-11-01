import { baseUrlFor } from "./presets";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAiProvider } from "./providers/openai";
import type { AiConfig, AiProvider } from "./types";

export { baseUrlFor, AI_PROVIDER_PRESETS, findPreset, modelsFor } from "./presets";
export type { AiProviderPreset } from "./presets";
export { aiContextSummary, reportOutline } from "./context";
export { buildPrompt } from "./prompts";
export { aiOutputPath, saveAiOutput } from "./output";
export { estimatePrompt, estimateTokens } from "./usage";
export type { PromptEstimate } from "./usage";
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
 */
export function createAiProvider(config: AiConfig): AiProvider {
  if (!config.enabled) throw new Error("The AI assistant is disabled.");
  const apiKey = config.apiKey.trim();
  if (!apiKey) throw new Error("An API key is required.");
  // A chosen preset supplies its endpoint when the field is empty; a typed
  // relay URL always wins (`presets.ts`).
  const options = { apiKey, model: config.model, baseUrl: baseUrlFor(config) };
  return config.protocol === "openai" ? new OpenAiProvider(options) : new AnthropicProvider(options);
}
