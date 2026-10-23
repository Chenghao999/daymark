import type Anthropic from "@anthropic-ai/sdk";
import type { AiPrompt, AiProvider, AiResult } from "../types";

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
    const text = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim();

    if (!text) throw new Error("The model returned no text.");
    return { text, model: message.model };
  }
}
