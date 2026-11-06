import type { AiUsage } from "./types";

/**
 * User-supplied token prices. Daymark never ships or refreshes vendor prices:
 * they change without notice and differ per plan, region and relay, so a stale
 * table would be worse than asking the user to copy the current numbers.
 * Prices are per 1,000,000 tokens, the unit every vendor's pricing page uses.
 */
export interface AiPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  /** Free-form display label such as `USD`, `CNY` or `$`; not a conversion. */
  currency: string;
}

export interface AiCost {
  input: number;
  output: number;
  total: number;
  currency: string;
}

const MAX_PRICE = 1_000_000;

/**
 * Reads a stored pricing object. Anything malformed disables estimates rather
 * than producing a wrong number, which is why a bad field returns `null`
 * instead of falling back to zero.
 */
export function normalizePricing(value: unknown): AiPricing | null {
  if (typeof value !== "object" || value === null) return null;
  const source = value as {
    inputPerMillion?: unknown;
    outputPerMillion?: unknown;
    currency?: unknown;
  };
  const inputPerMillion = normalizePrice(source.inputPerMillion);
  const outputPerMillion = normalizePrice(source.outputPerMillion);
  if (inputPerMillion === null || outputPerMillion === null) return null;
  const currency =
    typeof source.currency === "string" ? source.currency.trim().slice(0, 8) : "";
  return { inputPerMillion, outputPerMillion, currency: currency || "USD" };
}

function normalizePrice(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > MAX_PRICE) return null;
  return value;
}

/** Cost of one call, or `null` when usage or pricing is unavailable. */
export function costOf(
  usage: AiUsage | null | undefined,
  pricing: AiPricing | null | undefined,
): AiCost | null {
  if (!usage || !pricing) return null;
  const input = (usage.inputTokens / 1_000_000) * pricing.inputPerMillion;
  const output = (usage.outputTokens / 1_000_000) * pricing.outputPerMillion;
  return { input, output, total: input + output, currency: pricing.currency };
}

/** `USD 0.0075` — enough significant digits to see a small call, not more. */
export function formatCost(cost: AiCost): string {
  return formatMoney(cost.total, cost.currency);
}

export function formatMoney(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const text = formatAmount(safe);
  return currency ? `${currency} ${text}` : text;
}

function formatAmount(amount: number): string {
  if (amount === 0) return "0.00";
  if (amount >= 1) return amount.toFixed(2);
  // Two decimals below 1 would turn a normal call (a fraction of a cent) into
  // "0.00", so keep two significant digits, capped at six decimals.
  const digits = Math.min(6, Math.max(2, 2 - Math.floor(Math.log10(amount))));
  const fixed = amount.toFixed(digits);
  const dot = fixed.indexOf(".");
  const whole = fixed.slice(0, dot);
  const fraction = fixed.slice(dot + 1);
  const trimmed = fraction.replace(/0+$/, "");
  return `${whole}.${trimmed.length >= 2 ? trimmed : fraction.slice(0, 2)}`;
}
