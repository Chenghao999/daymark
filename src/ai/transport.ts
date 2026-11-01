import { invoke, isTauri } from "@tauri-apps/api/core";

export interface HttpRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface HttpResponse {
  status: number;
  body: string;
}

/**
 * How an OpenAI-compatible request reaches the network. The app passes nothing
 * and gets the Tauri transport; tests pass a fake, and a browser build (if any)
 * falls back to `fetch`.
 */
export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

/**
 * Browser path. Works for endpoints that send CORS headers, and is what the
 * unit tests exercise through a stubbed `fetch`.
 */
export const fetchTransport: HttpTransport = async ({ url, headers, body }) => {
  const response = await fetch(url, { method: "POST", headers, body });
  return { status: response.status, body: await response.text() };
};

/**
 * Production path: the Rust `ai_request` command. A WebView fetch is blocked by
 * CORS for vendors such as DeepSeek and Qwen, and the Rust client also allows a
 * longer timeout for reasoning models.
 */
export const tauriTransport: HttpTransport = ({ url, headers, body }) =>
  invoke<HttpResponse>("ai_request", { url, headers, body });

export function defaultTransport(): HttpTransport {
  return isTauri() ? tauriTransport : fetchTransport;
}
