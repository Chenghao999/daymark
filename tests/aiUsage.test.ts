import { describe, expect, it } from "vitest";
import { estimatePrompt, estimateTokens } from "../src/ai";

describe("token estimate", () => {
  it("uses about four characters per token for Latin text", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("uses about 1.5 characters per token for CJK text", () => {
    expect(estimateTokens("今天开会")).toBe(3);
    expect(estimateTokens("日本語")).toBe(2);
  });

  it("mixes both scripts and rounds up", () => {
    // 4 latin chars = 1 token; 3 CJK chars = 2 tokens.
    expect(estimateTokens("abcd今天开")).toBe(3);
  });

  it("counts both prompt parts", () => {
    const estimate = estimatePrompt({ system: "abcd", user: "efghijkl" });
    expect(estimate.characters).toBe(12);
    expect(estimate.inputTokens).toBe(3);
  });

  it("never returns a negative or fractional token count", () => {
    const estimate = estimateTokens("a".repeat(1001));
    expect(Number.isInteger(estimate)).toBe(true);
    expect(estimate).toBe(251);
  });
});
