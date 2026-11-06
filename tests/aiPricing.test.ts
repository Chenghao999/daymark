import { describe, expect, it } from "vitest";
import { costOf, formatCost, formatMoney, normalizePricing } from "../src/ai/pricing";

describe("AI pricing", () => {
  it("accepts a complete price pair and defaults the currency", () => {
    expect(normalizePricing({ inputPerMillion: 3, outputPerMillion: 15 })).toEqual({
      inputPerMillion: 3,
      outputPerMillion: 15,
      currency: "USD",
    });
    expect(
      normalizePricing({ inputPerMillion: 0, outputPerMillion: 0, currency: "  CNY  " }),
    ).toEqual({ inputPerMillion: 0, outputPerMillion: 0, currency: "CNY" });
  });

  it("caps the currency label", () => {
    expect(
      normalizePricing({ inputPerMillion: 1, outputPerMillion: 2, currency: "ABCDEFGHIJK" })
        ?.currency,
    ).toBe("ABCDEFGH");
  });

  it("rejects malformed, negative and out-of-range prices instead of pricing at zero", () => {
    expect(normalizePricing(undefined)).toBeNull();
    expect(normalizePricing(null)).toBeNull();
    expect(normalizePricing("3")).toBeNull();
    expect(normalizePricing({})).toBeNull();
    expect(normalizePricing({ inputPerMillion: 3 })).toBeNull();
    expect(normalizePricing({ inputPerMillion: -1, outputPerMillion: 2 })).toBeNull();
    expect(normalizePricing({ inputPerMillion: Number.NaN, outputPerMillion: 2 })).toBeNull();
    expect(normalizePricing({ inputPerMillion: 2, outputPerMillion: Infinity })).toBeNull();
    expect(normalizePricing({ inputPerMillion: 2, outputPerMillion: 1_000_001 })).toBeNull();
  });

  it("computes input, output and total cost from reported usage", () => {
    const cost = costOf(
      { inputTokens: 1_000, outputTokens: 2_000 },
      { inputPerMillion: 5, outputPerMillion: 15, currency: "USD" },
    );
    expect(cost).not.toBeNull();
    expect(cost?.input).toBeCloseTo(0.005, 10);
    expect(cost?.output).toBeCloseTo(0.03, 10);
    expect(cost?.total).toBeCloseTo(0.035, 10);
    expect(cost?.currency).toBe("USD");
    // No usage (a fake provider or an old log) means no estimate.
    expect(costOf(null, { inputPerMillion: 1, outputPerMillion: 1, currency: "USD" })).toBeNull();
    expect(costOf({ inputTokens: 1, outputTokens: 1 }, null)).toBeNull();
  });

  it("formats small calls with enough significant digits to be visible", () => {
    const usd = { currency: "USD" };
    expect(formatCost({ input: 0.005, output: 0.03, total: 0.035, ...usd })).toBe("USD 0.035");
    expect(formatCost({ input: 0, output: 0, total: 0.0075, ...usd })).toBe("USD 0.0075");
    expect(formatCost({ input: 0, output: 0, total: 0.00001, ...usd })).toBe("USD 0.00001");
    expect(formatCost({ input: 0, output: 0, total: 0.5, ...usd })).toBe("USD 0.50");
    expect(formatCost({ input: 0, output: 0, total: 12.5, ...usd })).toBe("USD 12.50");
    expect(formatCost({ input: 0, output: 0, total: 0, ...usd })).toBe("USD 0.00");
  });

  it("formats one side of the call and tolerates junk amounts", () => {
    expect(formatMoney(0.005, "USD")).toBe("USD 0.005");
    expect(formatMoney(0, "CNY")).toBe("CNY 0.00");
    expect(formatMoney(Number.NaN, "USD")).toBe("USD 0.00");
    expect(formatMoney(-1, "USD")).toBe("USD 0.00");
    expect(formatMoney(1.5, "")).toBe("1.50");
  });
});
