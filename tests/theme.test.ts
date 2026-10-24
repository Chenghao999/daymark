import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  normalizeTheme,
  sanitize,
  syncedPart,
} from "../src/settings/store";

describe("theme preference", () => {
  it("accepts light and dark and falls back to system", () => {
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("dark")).toBe("dark");
    expect(normalizeTheme("system")).toBe("system");
    expect(normalizeTheme("sepia")).toBe("system");
    expect(normalizeTheme(undefined)).toBe("system");
  });

  it("keeps the theme through sanitize and starts on system", () => {
    expect(DEFAULT_SETTINGS.theme).toBe("system");
    expect(sanitize({ ...DEFAULT_SETTINGS, theme: "dark" }).theme).toBe("dark");
    expect(
      sanitize({ ...DEFAULT_SETTINGS, theme: "neon" as unknown as "dark" }).theme,
    ).toBe("system");
  });

  it("does not write the theme or the data folder to _settings.md", () => {
    const synced = syncedPart({ ...DEFAULT_SETTINGS, theme: "dark", dataDir: "/data" });
    expect(synced).not.toHaveProperty("theme");
    expect(synced).not.toHaveProperty("dataDir");
    expect(Object.keys(synced).sort()).toEqual(
      [
        "assessmentMonthStartDay",
        "assessmentYearStartMonth",
        "language",
        "numbering",
        "scanIntervalSec",
        "userName",
        "weekStartsOn",
      ].sort(),
    );
  });
});
