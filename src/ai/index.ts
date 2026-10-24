import { AnthropicProvider } from "./providers/anthropic";
import type { AiConfig, AiProvider } from "./types";

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
  AiProvider,
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
  return new AnthropicProvider({ apiKey, model: config.model });
}
