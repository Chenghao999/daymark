import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiProvider } from "../src/ai";
import { OpenAiProvider } from "../src/ai/providers/openai";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const answer = {
  model: "relay-model",
  choices: [{ message: { content: "hello" } }],
  usage: { prompt_tokens: 12, completion_tokens: 3 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAI-compatible provider", () => {
  it("posts to {baseUrl}/chat/completions with a bearer key", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(answer));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiProvider({
      apiKey: "sk-test",
      model: "relay-model",
      baseUrl: "https://relay.example.com/v1/",
    });
    const result = await provider.complete({ system: "be brief", user: "hi" });

    expect(result).toEqual({
      text: "hello",
      model: "relay-model",
      usage: { inputTokens: 12, outputTokens: 3 },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://relay.example.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("relay-model");
    expect(body.messages).toEqual([
      { role: "system", content: "be brief" },
      { role: "user", content: "hi" },
    ]);
    expect(body.response_format).toBeUndefined();
  });

  it("retries without json_schema when the relay rejects the field", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: "unknown field response_format" } }, 400))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '{"tasks":[]}' } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiProvider({
      apiKey: "k",
      model: "m",
      baseUrl: "https://relay.example.com/v1",
    });
    const result = await provider.completeJson(
      { system: "parse", user: "sentence" },
      { type: "object" },
    );

    expect(result.text).toBe('{"tasks":[]}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    const second = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(first.response_format.type).toBe("json_schema");
    expect(second.response_format.type).toBe("json_object");
    expect(second.messages[0].content).toContain("JSON Schema");
  });

  it("uses the provider preset endpoint when no base URL is typed", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(answer));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createAiProvider({
      enabled: true,
      provider: "deepseek",
      protocol: "openai",
      apiKey: "k",
      model: "deepseek-chat",
      baseUrl: "",
      pricing: null,
    });
    await provider.complete({ system: "s", user: "u" });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
  });

  it("can use an injected transport (the app's Rust path)", async () => {
    const transport = vi.fn(async () => ({
      status: 200,
      body: JSON.stringify(answer),
    }));
    const provider = new OpenAiProvider({
      apiKey: "k",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
      transport,
    });

    const result = await provider.complete({ system: "s", user: "u" });

    expect(result.text).toBe("hello");
    expect(transport).toHaveBeenCalledWith({
      url: "https://api.deepseek.com/v1/chat/completions",
      headers: {
        Authorization: "Bearer k",
        "Content-Type": "application/json",
      },
      body: expect.any(String),
    });
  });

  it("retries with max_completion_tokens when the model rejects max_tokens", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message:
                "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
            },
          },
          400,
        ),
      )
      .mockResolvedValueOnce(jsonResponse(answer));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiProvider({ apiKey: "k", model: "o3-mini" });
    const result = await provider.complete({ system: "s", user: "u" });

    expect(result.text).toBe("hello");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    const second = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(first.max_tokens).toBe(2048);
    expect(second.max_completion_tokens).toBe(2048);
    expect(second.max_tokens).toBeUndefined();
  });

  it("surfaces HTTP failures with their status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { message: "bad key" } }, 401)));
    const provider = new OpenAiProvider({ apiKey: "k", model: "m" });
    await expect(provider.complete({ system: "s", user: "u" })).rejects.toThrow(/HTTP 401: bad key/);
  });

  it("rejects an empty answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ choices: [{ message: { content: "  " } }] })));
    const provider = new OpenAiProvider({ apiKey: "k", model: "m" });
    await expect(provider.complete({ system: "s", user: "u" })).rejects.toThrow(/no text/);
  });
});
