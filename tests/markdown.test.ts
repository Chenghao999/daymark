import { describe, expect, it } from "vitest";
import type { Category } from "../src/domain/types";
import type { StoredTask } from "../src/storage/types";
import {
  parseCategoriesMarkdown,
  parseMarkdown,
  serializeCategoriesMarkdown,
  serializeMarkdown,
} from "../src/storage/markdown";

const categories: Category[] = [
  {
    id: "cat-work",
    nameEn: "Project work",
    nameZh: "项目开发",
    color: "#5b8def",
    sortOrder: 0,
    archived: false,
  },
  {
    id: "cat-meet",
    nameEn: "Meetings",
    nameZh: "会议沟通",
    color: "#e0a03a",
    sortOrder: 1,
    archived: false,
  },
];

function entry(overrides: Partial<StoredTask["task"]> = {}): StoredTask {
  return {
    task: {
      id: "task-1",
      title: "写周报",
      notes: "汇总本周进展",
      categoryId: "cat-work",
      status: "scheduled",
      startAt: "2026-10-22T09:00",
      endAt: "2026-10-22T10:00",
      dueAt: null,
      priority: 2,
      allDay: false,
      createdAt: "2026-10-20T08:00:00.000Z",
      updatedAt: "2026-10-21T08:00:00.000Z",
      deviceId: "device-a",
      rowVersion: 3,
      deleted: false,
      source: "local",
      externalUid: null,
      ...overrides,
    },
    completion: null,
    dateKey: "2026-10-22",
  };
}

describe("categories markdown", () => {
  it("round-trips categories with ids, colours and order", () => {
    const parsed = parseCategoriesMarkdown(serializeCategoriesMarkdown(categories));
    expect(parsed).toEqual(categories);
  });

  it("accepts a hand-written list without metadata", () => {
    const parsed = parseCategoriesMarkdown("- Learning / 学习成长\n- Meetings\n");
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ nameEn: "Learning", nameZh: "学习成长", archived: false });
    expect(parsed[1].nameZh).toBe("Meetings");
    expect(parsed[0].id).not.toBe(parsed[1].id);
  });
});

describe("day file markdown", () => {
  it("round-trips a scheduled task with notes and metadata", () => {
    const text = serializeMarkdown("2026-10-22", [entry()], categories, [], {
      updatedAt: "2026-10-22T12:00:00.000Z",
      deviceId: "device-a",
    });
    const parsed = parseMarkdown(text, "2026-10-22", categories);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0]).toEqual(entry());
    expect(parsed.extras).toEqual([]);
    expect(parsed.updatedAt).toBe("2026-10-22T12:00:00.000Z");
  });

  it("reads a hand-written task line with a time range and a note", () => {
    const text = [
      "# 2026-10-22",
      "",
      "## Project work · 项目开发",
      "",
      "- [ ] 09:00–10:00 写周报",
      "  > 汇总本周进展",
      "",
    ].join("\n");
    const parsed = parseMarkdown(text, "2026-10-22", categories);
    expect(parsed.tasks).toHaveLength(1);
    const task = parsed.tasks[0].task;
    expect(task.title).toBe("写周报");
    expect(task.notes).toBe("汇总本周进展");
    expect(task.startAt).toBe("2026-10-22T09:00");
    expect(task.endAt).toBe("2026-10-22T10:00");
    expect(task.categoryId).toBe("cat-work");
    expect(task.status).toBe("scheduled");
    expect(parsed.tasks[0].completion).toBeNull();
    // The generated id must be stable within one parse and usable for edits.
    expect(task.id).toMatch(/[0-9a-f-]{36}/);
  });

  it("turns a hand-checked box without metadata into a completion", () => {
    const parsed = parseMarkdown("# 2026-10-22\n- [x] 写周报\n", "2026-10-22", categories);
    expect(parsed.tasks[0].completion).not.toBeNull();
    expect(parsed.tasks[0].task.status).toBe("done");
    // Noon local time on the file's day, so reports land on the right date.
    const completed = new Date(parsed.tasks[0].completion?.completedAt ?? "");
    expect(completed.getFullYear()).toBe(2026);
    expect(completed.getMonth()).toBe(9);
    expect(completed.getDate()).toBe(22);
  });

  it("keeps backlog tasks without a date and classifies them as backlog", () => {
    const text = "- [ ] 整理书架\n";
    const parsed = parseMarkdown(text, null, categories);
    expect(parsed.tasks[0].task.startAt).toBeNull();
    expect(parsed.tasks[0].task.status).toBe("backlog");
    expect(parsed.tasks[0].dateKey).toBeNull();
  });

  it("preserves lines it does not understand and writes them back", () => {
    const text = [
      "# 2026-10-22",
      "",
      "## Project work · 项目开发",
      "",
      "- [ ] 写周报",
      "",
      "自由记录：今天很顺利。",
      "",
    ].join("\n");
    const parsed = parseMarkdown(text, "2026-10-22", categories);
    expect(parsed.extras).toEqual(["自由记录：今天很顺利。"]);

    const written = serializeMarkdown("2026-10-22", parsed.tasks, categories, parsed.extras, {
      updatedAt: "2026-10-22T12:00:00.000Z",
      deviceId: "device-a",
    });
    expect(written).toContain("自由记录：今天很顺利。");
    expect(parseMarkdown(written, "2026-10-22", categories).extras).toEqual(parsed.extras);
  });

  it("keeps edits made with a text editor: title and unknown section name", () => {
    const text = [
      "# 2026-10-22",
      "",
      "## 临时分组",
      "",
      "- [ ] 10:30 打电话",
      "",
    ].join("\n");
    const parsed = parseMarkdown(text, "2026-10-22", categories);
    const task = parsed.tasks[0].task;
    expect(task.title).toBe("打电话");
    expect(task.startAt).toBe("2026-10-22T10:30");
    // Unknown headings must not silently assign a category.
    expect(task.categoryId).toBeNull();
  });
});
