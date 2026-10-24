import type Anthropic from "@anthropic-ai/sdk";
import type { AiJsonSchema, AiPrompt, AiProvider, AiResult, AiUsage } from "../types";

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  maxTokens?: number;
}

/**
 * Anthropic implementation of `AiProvider`.
 *
 * The request runs in the WebView, so the SDK needs
 * `dangerouslyAllowBrowser`; the key is already device-local and the provider
 * receives it from settings. Streaming is used because a polished report can be
 * long enough to outlive a buffered request.
 */
export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic";
  private client: Anthropic | null = null;

  constructor(private readonly options: AnthropicProviderOptions) {}

  private async getClient(): Promise<Anthropic> {
    if (!this.client) {
      // Loaded on first use: the SDK is large and most sessions never ask the
      // assistant for anything.
      const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
      this.client = new AnthropicClient({
        apiKey: this.options.apiKey,
        dangerouslyAllowBrowser: true,
      });
    }
    return this.client;
  }

  async complete(prompt: AiPrompt): Promise<AiResult> {
    const stream = (await this.getClient()).messages.stream({
      model: this.options.model,
      max_tokens: this.options.maxTokens ?? 2048,
      thinking: { type: "adaptive" },
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });

    const message = await stream.finalMessage();
    return { text: textOf(message.content), model: message.model, usage: usageOf(message.usage) };
  }

  /**
   * Structured output for short results (task parsing). Non-streaming: the
   * answer is a small JSON document, and the schema removes the need for
   * "reply with JSON only" prompt hacks.
   */
  async completeJson(prompt: AiPrompt, schema: AiJsonSchema): Promise<AiResult> {
    const message = await (await this.getClient()).messages.create({
      model: this.options.model,
      max_tokens: 1500,
      output_config: { format: { type: "json_schema", schema } },
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
    return { text: textOf(message.content), model: message.model, usage: usageOf(message.usage) };
  }
}

type TextBlockLike = { type: string; text?: string };
type UsageLike = { input_tokens?: number; output_tokens?: number };

function usageOf(usage: UsageLike | undefined | null): AiUsage | null {
  if (!usage || typeof usage.input_tokens !== "number" || typeof usage.output_tokens !== "number") {
    return null;
  }
  return { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
}

function textOf(content: ReadonlyArray<TextBlockLike>): string {
  const text = content
    .flatMap((block) => (block.type === "text" && typeof block.text === "string" ? [block.text] : []))
    .join("\n")
    .trim();
  if (!text) throw new Error("The model returned no text.");
  return text;
}
