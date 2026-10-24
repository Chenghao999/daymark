import type { AiPrompt } from "./types";

export interface PromptEstimate {
  /** System + user characters that will be sent. */
  characters: number;
  /** Rough input-token estimate; see `estimateTokens`. */
  inputTokens: number;
}

const CJK_RE =
  /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/;

/**
 * Rough token estimate used only to warn before sending. Latin text averages
 * about 4 characters per token, CJK about 1.5. It is deliberately
 * conservative (rounds up) and is never presented as a bill.
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const character of text) {
    if (CJK_RE.test(character)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk / 1.5 + other / 4);
}

export function estimatePrompt(prompt: AiPrompt): PromptEstimate {
  return {
    characters: prompt.system.length + prompt.user.length,
    inputTokens: estimateTokens(prompt.system) + estimateTokens(prompt.user),
  };
}
