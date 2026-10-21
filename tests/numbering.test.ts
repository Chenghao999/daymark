import { describe, expect, it } from "vitest";
import { alphaNumber, chineseNumber, formatHeading } from "../src/domain/numbering";

describe("chineseNumber", () => {
  it("handles single digits", () => {
    expect(chineseNumber(1)).toBe("一");
    expect(chineseNumber(9)).toBe("九");
  });

  it("handles the ten boundary", () => {
    expect(chineseNumber(10)).toBe("十");
    expect(chineseNumber(11)).toBe("十一");
    expect(chineseNumber(20)).toBe("二十");
    expect(chineseNumber(21)).toBe("二十一");
    expect(chineseNumber(99)).toBe("九十九");
  });

  it("falls back to digits beyond the supported range", () => {
    expect(chineseNumber(120)).toBe("120");
  });
});

describe("alphaNumber", () => {
  it("rolls over past Z", () => {
    expect(alphaNumber(1)).toBe("A");
    expect(alphaNumber(26)).toBe("Z");
    expect(alphaNumber(27)).toBe("AA");
    expect(alphaNumber(28)).toBe("AB");
  });
});

describe("formatHeading", () => {
  it("uses the configured numbering style", () => {
    expect(formatHeading(0, "chinese")).toBe("一、");
    expect(formatHeading(1, "arabic")).toBe("2. ");
    expect(formatHeading(2, "alpha")).toBe("C. ");
  });
});
