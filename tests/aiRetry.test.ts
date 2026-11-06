import { describe, expect, it, vi } from "vitest";
import { isRetryableAiError, withAiRetry } from "../src/ai/retry";
import type { AiJsonSchema, AiPrompt, AiProvider, AiResult } from "../src/ai/types";

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
  }
}

const prompt: AiPrompt = { system: "s", user: "u" };
const schema: AiJsonSchema = { type: "object" };
const answer: AiResult = { text: "ok", model: "m", usage: { inputTokens: 1, outputTokens: 1 } };

function fakeProvider(complete: () => Promise<AiResult>, completeJson?: () => Promise<AiResult>): AiProvider {
  return {
    id: "fake",
    complete: vi.fn(complete),
    completeJson: vi.fn(completeJson ?? complete),
  };
}

function harness(options: Parameters<typeof withAiRetry>[1] = {}) {
  const delays: number[] = [];
  const sleep = vi.fn(async (ms: number) => {
    delays.push(ms);
  });
  return { delays, sleep, options: { sleep, random: () => 0.5, ...options } };
}

describe("AI retry", () => {
  it("does not wait after a successful request", async () => {
    const call = vi.fn(async () => answer);
    const { delays, options } = harness();
    const provider = withAiRetry(fakeProvider(call), options);

    await expect(provider.complete(prompt)).resolves.toEqual(answer);
    expect(call).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it("retries server errors with exponential backoff and succeeds", async () => {
    const call = vi
      .fn<() => Promise<AiResult>>()
      .mockRejectedValueOnce(new HttpError(500))
      .mockRejectedValueOnce(new HttpError(429))
      .mockResolvedValueOnce(answer);
    const { delays, options } = harness();
    const provider = withAiRetry(fakeProvider(call), options);

    await expect(provider.complete(prompt)).resolves.toEqual(answer);
    expect(call).toHaveBeenCalledTimes(3);
    // random() = 0.5 removes jitter: 800 ms, then 1600 ms.
    expect(delays).toEqual([800, 1600]);
  });

  it("retries a network failure, which arrives as a plain Error", async () => {
    const call = vi
      .fn<() => Promise<AiResult>>()
      .mockRejectedValueOnce(new Error("Could not reach the AI endpoint."))
      .mockResolvedValueOnce(answer);
    const provider = withAiRetry(fakeProvider(call), harness().options);

    await expect(provider.complete(prompt)).resolves.toEqual(answer);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("does not retry auth or bad-request failures", async () => {
    for (const status of [400, 401, 403, 404, 422]) {
      const call = vi.fn<() => Promise<AiResult>>().mockRejectedValue(new HttpError(status));
      const { delays, options } = harness();
      const provider = withAiRetry(fakeProvider(call), options);

      await expect(provider.complete(prompt)).rejects.toThrow(`HTTP ${status}`);
      expect(call).toHaveBeenCalledTimes(1);
      expect(delays).toEqual([]);
    }
  });

  it("gives up after the configured number of retries and rethrows the last error", async () => {
    const call = vi.fn<() => Promise<AiResult>>().mockRejectedValue(new HttpError(503));
    const { delays, options } = harness({ retries: 2 });
    const provider = withAiRetry(fakeProvider(call), options);

    await expect(provider.complete(prompt)).rejects.toThrow("HTTP 503");
    expect(call).toHaveBeenCalledTimes(3);
    expect(delays).toHaveLength(2);
  });

  it("can be configured with no retries", async () => {
    const call = vi.fn<() => Promise<AiResult>>().mockRejectedValue(new HttpError(500));
    const { delays, options } = harness({ retries: 0 });
    const provider = withAiRetry(fakeProvider(call), options);

    await expect(provider.complete(prompt)).rejects.toThrow("HTTP 500");
    expect(call).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it("retries completeJson as a whole", async () => {
    const complete = vi.fn(async () => answer);
    const completeJson = vi
      .fn<() => Promise<AiResult>>()
      .mockRejectedValueOnce(new HttpError(502))
      .mockResolvedValueOnce(answer);
    const provider = withAiRetry(fakeProvider(complete, completeJson), harness().options);

    await expect(provider.completeJson(prompt, schema)).resolves.toEqual(answer);
    expect(complete).not.toHaveBeenCalled();
    expect(completeJson).toHaveBeenCalledTimes(2);
  });

  it("reports each retry so the UI can show progress", async () => {
    const call = vi
      .fn<() => Promise<AiResult>>()
      .mockRejectedValueOnce(new HttpError(500))
      .mockResolvedValueOnce(answer);
    const onRetry = vi.fn();
    const provider = withAiRetry(fakeProvider(call), { ...harness().options, onRetry });

    await provider.complete(prompt);
    expect(onRetry).toHaveBeenCalledWith({
      attempt: 1,
      totalAttempts: 3,
      delayMs: 800,
      error: expect.any(HttpError),
    });
  });

  it("caps the delay", async () => {
    const call = vi
      .fn<() => Promise<AiResult>>()
      .mockRejectedValueOnce(new HttpError(500))
      .mockRejectedValueOnce(new HttpError(500))
      .mockResolvedValueOnce(answer);
    const { delays, options } = harness({ retries: 2, maxDelayMs: 1000 });
    const provider = withAiRetry(fakeProvider(call), options);

    await provider.complete(prompt);
    expect(delays).toEqual([800, 1000]);
  });

  it("classifies retryable failures", () => {
    expect(isRetryableAiError(new HttpError(408))).toBe(true);
    expect(isRetryableAiError(new HttpError(429))).toBe(true);
    expect(isRetryableAiError(new HttpError(500))).toBe(true);
    expect(isRetryableAiError(new HttpError(400))).toBe(false);
    expect(isRetryableAiError(new HttpError(401))).toBe(false);
    expect(isRetryableAiError(new HttpError(422))).toBe(false);
    expect(isRetryableAiError(new Error("network"))).toBe(true);
    expect(isRetryableAiError("not an error")).toBe(false);
  });
});
