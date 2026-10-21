import type { NumberingStyle } from "./types";

const CHINESE_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/**
 * Chinese ordinal for 1-99. Reports rarely exceed 99 sections, and a fallback
 * to Arabic digits keeps the function total rather than throwing mid-export.
 */
export function chineseNumber(value: number): string {
  if (!Number.isInteger(value) || value < 1) return String(value);
  if (value < 10) return CHINESE_DIGITS[value];
  if (value < 20) return value === 10 ? "十" : `十${CHINESE_DIGITS[value - 10]}`;
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return ones === 0 ? `${CHINESE_DIGITS[tens]}十` : `${CHINESE_DIGITS[tens]}十${CHINESE_DIGITS[ones]}`;
  }
  return String(value);
}

export function alphaNumber(value: number): string {
  if (!Number.isInteger(value) || value < 1) return String(value);
  let n = value;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Returns the prefix for the index-th (0-based) section. */
export function formatHeading(index: number, style: NumberingStyle): string {
  const value = index + 1;
  switch (style) {
    case "chinese":
      return `${chineseNumber(value)}、`;
    case "alpha":
      return `${alphaNumber(value)}. `;
    case "arabic":
    default:
      return `${value}. `;
  }
}
