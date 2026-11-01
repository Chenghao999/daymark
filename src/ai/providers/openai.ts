import type { AiJsonSchema, AiPrompt, AiProvider, AiResult, AiUsage } from "../types";
import { defaultTransport, type HttpTransport } from "../transport";

export interface OpenAiProviderOptions {
  apiKey: string;
  model: string;
  /** Empty uses the official endpoint; otherwise `/chat/completions` is appended. */
  baseUrl?: string;
  maxTokens?: number;
  /** Overrides the Tauri/fetch choice; tests inject a fake. */
  transport?: HttpTransport;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

/**
 * OpenAI-compatible provider (`POST {baseUrl}/chat/completions`).
 *
 * Used for relays and vendors that expose the OpenAI wire format (DeepSeek,
 * Qwen, Kimi, GLM, Gemini, OpenRouter, most enterprise gateways). No SDK: one
 * endpoint and one response shape are all this app needs. In the app the
 * request goes through the Rust `ai_request` command, because those vendors do
 * not send CORS headers a WebView `fetch` requires.
 */
export class OpenAiProvider implements AiProvider {
  readonly id = "openai";
  private readonly transport: HttpTransport;

  constructor(private readonly options: OpenAiProviderOptions) {
    this.transport = options.transport ?? defaultTransport();
  }

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

    let response = await this.post(body);
    if (!isOk(response.status)) {
      const detail = errorText(response.body);
      // Newer OpenAI reasoning models reject `max_tokens` and want
      // `max_completion_tokens`. Every other compatible vendor still accepts
      // `max_tokens`, so the field is only swapped when the server says so.
      if (response.status === 400 && /max_tokens|max_completion_tokens/i.test(detail)) {
        const retryBody: Record<string, unknown> = {
          ...body,
          max_completion_tokens: body.max_tokens,
        };
        delete retryBody.max_tokens;
        response = await this.post(retryBody);
        if (!isOk(response.status)) throw new AiHttpError(response.status, errorText(response.body));
      } else {
        throw new AiHttpError(response.status, detail);
      }
    }

    const data = parseResponse(response.body);
    const text = textOf(data);
    return {
      text,
      model: typeof data.model === "string" ? data.model : this.options.model,
      usage: usageOf(data.usage),
    };
  }

  private async post(body: Record<string, unknown>): Promise<{ status: number; body: string }> {
    try {
      return await this.transport({
        url: `${trimBase(this.options.baseUrl)}/chat/completions`,
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

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

function parseResponse(body: string): OpenAiResponse {
  try {
    return JSON.parse(body) as OpenAiResponse;
  } catch {
    throw new Error("The AI endpoint returned a response that is not JSON.");
  }
}

function errorText(body: string): string {
  const text = body.trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } };
    const message = parsed.error?.message;
    if (typeof message === "string") return message.slice(0, 300);
  } catch {
    // Not JSON; the raw body is still useful.
  }
  return text.slice(0, 300);
}

function trimBase(baseUrl: string | undefined): string {
  const url = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return url;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
