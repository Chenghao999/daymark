import { describe, expect, it } from "vitest";
import type { Category } from "../src/domain/types";
import { mergeCategoriesFile, mergeSettingsFile } from "../src/sync/merge";
import { DEFAULT_SETTINGS, type AppSettings } from "../src/settings/store";
import { serializeCategoriesMarkdown } from "../src/storage/markdown";
import { parseSettingsMarkdown, serializeSettingsMarkdown } from "../src/storage/settingsFile";

const settingsText = (overrides: Partial<AppSettings> = {}) =>
  serializeSettingsMarkdown({ ...DEFAULT_SETTINGS, ...overrides });

const BASE_SETTINGS = settingsText();

const category = (
  id: string,
  nameEn: string,
  nameZh: string,
  color = "#111111",
  sortOrder = 0,
): Category => ({ id, nameEn, nameZh, color, sortOrder, archived: false });

const BASE_CATEGORIES = [category("a", "Work", "工作", "#111111", 0), category("b", "Life", "生活", "#222222", 1)];
const categoriesText = (categories: Category[]) => serializeCategoriesMarkdown(categories);

describe("settings merge", () => {
  it("takes each side's change when they touch different keys", () => {
    const local = settingsText({ language: "zh-CN" });
    const remote = settingsText({ weekStartsOn: 0 });

    const outcome = mergeSettingsFile(local, remote, BASE_SETTINGS);

    expect(outcome.clean).toBe(true);
    const merged = parseSettingsMarkdown(outcome.text);
    expect(merged.language).toBe("zh-CN");
    expect(merged.weekStartsOn).toBe(0);
    expect(outcome.itemCount).toBe(7);
  });

  it("reports a conflict when both sides set the same key differently", () => {
    const local = settingsText({ numbering: "arabic" });
    const remote = settingsText({ numbering: "alpha" });

    const outcome = mergeSettingsFile(local, remote, BASE_SETTINGS);

    expect(outcome.clean).toBe(false);
    expect(outcome.text).toBe(local);
    expect(outcome.conflicts).toEqual([
      { id: "numbering", label: "numbering", fields: ["value"] },
    ]);
  });

  it("merges identical edits without a base", () => {
    const text = settingsText({ userName: "Chenghao" });

    const outcome = mergeSettingsFile(text, text, null);

    expect(outcome.clean).toBe(true);
    expect(parseSettingsMarkdown(outcome.text).userName).toBe("Chenghao");
  });

  it("treats any difference as a conflict without a base", () => {
    const local = settingsText({ language: "zh-CN" });

    const outcome = mergeSettingsFile(local, BASE_SETTINGS, null);

    expect(outcome.clean).toBe(false);
    expect(outcome.conflicts).toHaveLength(1);
  });
});

describe("categories merge", () => {
  it("combines edits to different categories", () => {
    const local = categoriesText([category("a", "Work", "工作", "#abcdef", 0), BASE_CATEGORIES[1]!]);
    const remote = categoriesText([BASE_CATEGORIES[0]!, category("b", "Home", "家庭", "#222222", 1)]);

    const outcome = mergeCategoriesFile(local, remote, categoriesText(BASE_CATEGORIES));

    expect(outcome.clean).toBe(true);
    expect(outcome.text).toContain("#abcdef");
    expect(outcome.text).toContain("Home / 家庭");
    expect(outcome.itemCount).toBe(2);
  });

  it("reports a conflict when both sides change the same field", () => {
    const local = categoriesText([category("a", "Work", "工作", "#aaaaaa", 0), BASE_CATEGORIES[1]!]);
    const remote = categoriesText([category("a", "Work", "工作", "#bbbbbb", 0), BASE_CATEGORIES[1]!]);

    const outcome = mergeCategoriesFile(local, remote, categoriesText(BASE_CATEGORIES));

    expect(outcome.clean).toBe(false);
    expect(outcome.conflicts).toEqual([
      { id: "a", label: "Work / 工作", fields: ["value"] },
    ]);
    expect(outcome.text).toBe(local);
  });

  it("keeps a category added on one side", () => {
    const local = categoriesText([...BASE_CATEGORIES, category("c", "Study", "学习", "#333333", 2)]);

    const outcome = mergeCategoriesFile(local, categoriesText(BASE_CATEGORIES), categoriesText(BASE_CATEGORIES));

    expect(outcome.clean).toBe(true);
    expect(outcome.text).toContain("Study / 学习");
  });

  it("accepts a deletion of a category the other side did not touch", () => {
    const local = categoriesText([BASE_CATEGORIES[0]!]);

    const outcome = mergeCategoriesFile(local, categoriesText(BASE_CATEGORIES), categoriesText(BASE_CATEGORIES));

    expect(outcome.clean).toBe(true);
    expect(outcome.text).not.toContain("Life / 生活");
  });

  it("keeps an edited category that was deleted on the other side", () => {
    const local = categoriesText([BASE_CATEGORIES[0]!]);
    const remote = categoriesText([BASE_CATEGORIES[0]!, category("b", "Life", "生活", "#eeeeee", 1)]);

    const outcome = mergeCategoriesFile(local, remote, categoriesText(BASE_CATEGORIES));

    expect(outcome.clean).toBe(true);
    expect(outcome.text).toContain("Life / 生活");
    expect(outcome.text).toContain("#eeeeee");
  });
});
