import type { AiJsonSchema, AiPrompt, AiProvider, AiResult, AiUsage } from "../types";

export interface OpenAiProviderOptions {
  apiKey: string;
  model: string;
  /** Empty uses the official endpoint; otherwise `/chat/completions` is appended. */
  baseUrl?: string;
  maxTokens?: number;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

/**
 * OpenAI-compatible provider (`POST {baseUrl}/chat/completions`).
 *
 * Used for relays and vendors that expose the OpenAI wire format (DeepSeek,
 * Kimi, GLM, OpenRouter, most enterprise gateways). No SDK: one endpoint and
 * one response shape are all this app needs, and `fetch` keeps the startup
 * bundle small.
 */
export class OpenAiProvider implements AiProvider {
  readonly id = "openai";

  constructor(private readonly options: OpenAiProviderOptions) {}

  async complete(prompt: AiPrompt): Promise<AiResult> {
    return this.request(prompt, null);
  }

  /**
   * Structured output is requested with `json_schema` where the server
   * supports it; relays that reject the field get one retry in plain
   * `json_object` mode. The prompt carries the schema either way, and
   * `parseTaskResponse` validates the values, so a weaker server degrades to
   * "usually right" instead of failing.
   */
  async completeJson(prompt: AiPrompt, schema: AiJsonSchema): Promise<AiResult> {
    const guarded: AiPrompt = {
      system: [
        prompt.system,
        "Reply with a single JSON object that matches this JSON Schema exactly.",
        "No prose, no code fences.",
        JSON.stringify(schema),
      ].join("\n"),
      user: prompt.user,
    };

    try {
      return await this.request(guarded, {
        type: "json_schema",
        json_schema: { name: "daymark_tasks", strict: true, schema },
      });
    } catch (cause) {
      // Only "this server does not know response_format" is worth a retry.
      if (!(cause instanceof AiHttpError) || (cause.status !== 400 && cause.status !== 422)) {
        throw cause;
      }
      return this.request(guarded, { type: "json_object" });
    }
  }

  private async request(prompt: AiPrompt, format: unknown): Promise<AiResult> {
    const body: Record<string, unknown> = {
      model: this.options.model,
      max_tokens: this.options.maxTokens ?? 2048,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    };
    if (format) body.response_format = format;

    let response: Response;
    try {
      response = await fetch(`${trimBase(this.options.baseUrl)}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new Error(
        `Could not reach the AI endpoint. Check the base URL and your connection. (${messageOf(cause)})`,
      );
    }

    if (!response.ok) throw new AiHttpError(response.status, await errorText(response));

    const data = (await response.json()) as OpenAiResponse;
    const text = textOf(data);
    return {
      text,
      model: typeof data.model === "string" ? data.model : this.options.model,
      usage: usageOf(data.usage),
    };
  }
}

/** Carries the HTTP status so `completeJson` can decide whether to retry. */
export class AiHttpError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`AI endpoint returned HTTP ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "AiHttpError";
  }
}

interface OpenAiResponse {
  model?: unknown;
  choices?: { message?: { content?: unknown } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function textOf(data: OpenAiResponse): string {
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) throw new Error("The model returned no text.");
  return text;
}

function usageOf(usage: OpenAiResponse["usage"]): AiUsage | null {
  if (!usage || typeof usage.prompt_tokens !== "number" || typeof usage.completion_tokens !== "number") {
    return null;
  }
  return { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens };
}

async function errorText(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim();
    if (!text) return "";
    try {
      const parsed = JSON.parse(text) as { error?: { message?: unknown } };
      const message = parsed.error?.message;
      if (typeof message === "string") return message.slice(0, 300);
    } catch {
      // Not JSON; the raw body is still useful.
    }
    return text.slice(0, 300);
  } catch {
    return "";
  }
}

function trimBase(baseUrl: string | undefined): string {
  const url = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return url;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
