import type { AiJsonSchema, AiPrompt, AiProvider, AiResult } from "./types";

export interface AiRetryInfo {
  /** The attempt that just failed, 1-based. */
  attempt: number;
  /** `retries + 1`: how many attempts will be made in total. */
  totalAttempts: number;
  delayMs: number;
  error: unknown;
}

export interface AiRetryOptions {
  /** Extra attempts after the first failure. Default 2 (three attempts in all). */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Overridable for tests; the default really waits. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (info: AiRetryInfo) => void;
}

/**
 * A retry is only worth making when the failure might not repeat. Rate limits,
 * timeouts, server errors and network failures qualify. Auth, bad-request and
 * not-found errors do not: retrying them spends time and tokens for nothing.
 */
export function isRetryableAiError(cause: unknown): boolean {
  const status = statusOf(cause);
  if (status !== null) return status === 408 || status === 429 || status >= 500;
  return cause instanceof Error;
}

function statusOf(cause: unknown): number | null {
  if (typeof cause !== "object" || cause === null) return null;
  const status = (cause as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

/**
 * Wraps any `AiProvider` with exponential backoff and jitter. Implemented above
 * the provider interface so Anthropic-compatible and OpenAI-compatible
 * endpoints get identical behaviour (the Anthropic SDK's own retries are
 * disabled to avoid multiplying attempts). `completeJson` is retried as a
 * whole; the provider's internal format fallback still runs first.
 */
export function withAiRetry(provider: AiProvider, options: AiRetryOptions = {}): AiProvider {
  const retries = Math.max(0, Math.floor(options.retries ?? 2));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 800);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 8000);
  const random = options.random ?? Math.random;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const totalAttempts = retries + 1;

  async function run<T>(call: () => Promise<T>): Promise<T> {
    let attempt = 1;
    for (;;) {
      try {
        return await call();
      } catch (cause) {
        if (attempt >= totalAttempts || !isRetryableAiError(cause)) throw cause;
        const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
        // ±20% jitter so several devices do not retry in lockstep after an
        // outage or a shared rate limit.
        const delayMs = Math.round(backoff * (0.8 + random() * 0.4));
        options.onRetry?.({ attempt, totalAttempts, delayMs, error: cause });
        if (delayMs > 0) await sleep(delayMs);
        attempt += 1;
      }
    }
  }

  return {
    id: provider.id,
    complete: (prompt: AiPrompt): Promise<AiResult> => run(() => provider.complete(prompt)),
    completeJson: (prompt: AiPrompt, schema: AiJsonSchema): Promise<AiResult> =>
      run(() => provider.completeJson(prompt, schema)),
  };
}
