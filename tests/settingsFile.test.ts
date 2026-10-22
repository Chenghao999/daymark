import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/settings/store";
import { parseSettingsMarkdown, serializeSettingsMarkdown } from "../src/storage/settingsFile";

describe("settings markdown", () => {
  it("round-trips every synced field", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      language: "en" as const,
      weekStartsOn: 0 as const,
      assessmentMonthStartDay: 26,
      assessmentYearStartMonth: 4,
      numbering: "arabic" as const,
      scanIntervalSec: 300,
      userName: "Chenghao Li",
      // Device-local and never written to the shared file.
      dataDir: "/Users/someone/Daymark",
    };
    const parsed = parseSettingsMarkdown(serializeSettingsMarkdown(settings));
    expect(parsed).toEqual({
      language: "en",
      weekStartsOn: 0,
      assessmentMonthStartDay: 26,
      assessmentYearStartMonth: 4,
      numbering: "arabic",
      scanIntervalSec: 300,
      userName: "Chenghao Li",
    });
  });

  it("reads a hand-written bullet list without the JSON comment", () => {
    const text = [
      "# Daymark settings",
      "",
      "- language: en",
      "- weekStartsOn: 0",
      "- assessmentMonthStartDay: 26",
      "- assessmentYearStartMonth: 4",
      "- numbering: alpha",
      "- scanIntervalSec: 300",
      "- userName: Chenghao",
    ].join("\n");
    expect(parseSettingsMarkdown(text)).toMatchObject({
      language: "en",
      weekStartsOn: 0,
      assessmentMonthStartDay: 26,
      assessmentYearStartMonth: 4,
      numbering: "alpha",
      scanIntervalSec: 300,
      userName: "Chenghao",
    });
  });

  it("prefers the JSON comment when both copies disagree", () => {
    const text = [
      "- weekStartsOn: 0",
      '<!-- daymark settings {"weekStartsOn":1,"assessmentMonthStartDay":2} -->',
    ].join("\n");
    expect(parseSettingsMarkdown(text).weekStartsOn).toBe(1);
    expect(parseSettingsMarkdown(text).assessmentMonthStartDay).toBe(2);
  });

  it("falls back to defaults and clamps out-of-range values", () => {
    const parsed = parseSettingsMarkdown(
      '- weekStartsOn: 9\n- assessmentMonthStartDay: 31\n- assessmentYearStartMonth: 13\n- scanIntervalSec: 2\n',
    );
    expect(parsed.weekStartsOn).toBe(1);
    expect(parsed.assessmentMonthStartDay).toBe(28);
    expect(parsed.assessmentYearStartMonth).toBe(12);
    expect(parsed.scanIntervalSec).toBe(10);
    expect(parsed.language).toBe(DEFAULT_SETTINGS.language);
  });

  it("uses English as the default language for a file without one", () => {
    expect(parseSettingsMarkdown("# Daymark settings\n")).toMatchObject({
      language: "en",
      weekStartsOn: 1,
    });
  });

  it("survives a broken JSON comment by using readable bullets", () => {
    const text = '- weekStartsOn: 0\n<!-- daymark settings {not json} -->\n';
    expect(parseSettingsMarkdown(text).weekStartsOn).toBe(0);
  });
});
