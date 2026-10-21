import { describe, expect, it } from "vitest";
import { generateReport, reportPeriod } from "../src/domain/reports";
import type { Category, Completion, Task } from "../src/domain/types";

const categories: Category[] = [
  { id: "cat-work", nameEn: "Project work", nameZh: "项目开发", color: "#000", sortOrder: 0, archived: false },
  { id: "cat-meet", nameEn: "Meetings", nameZh: "会议沟通", color: "#000", sortOrder: 1, archived: false },
];

function task(overrides: Partial<Task>): Task {
  return {
    id: crypto.randomUUID(),
    title: "Task",
    notes: "",
    categoryId: "cat-work",
    status: "scheduled",
    startAt: null,
    endAt: null,
    dueAt: null,
    priority: 0,
    allDay: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    deviceId: "test",
    rowVersion: 1,
    deleted: false,
    source: "local",
    externalUid: null,
    ...overrides,
  };
}

function completion(taskId: string, completedAt: string): Completion {
  return { id: crypto.randomUUID(), taskId, completedAt, deviceId: "test" };
}

const periodStart = new Date("2026-10-19T00:00:00");
const periodEnd = new Date("2026-10-25T23:59:59");

describe("reportPeriod", () => {
  it("spans the whole local day for a daily report", () => {
    const { start, end } = reportPeriod("daily", new Date(2026, 9, 21, 15, 30));
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
    expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59]);
    expect(end.getDate()).toBe(21);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it("starts weeks on Monday", () => {
    // 2026-10-21 is a Wednesday.
    const { start, end } = reportPeriod("weekly", new Date(2026, 9, 21));
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(19);
    expect(end.getDate()).toBe(25);
  });

  it("spans the calendar month", () => {
    const { start, end } = reportPeriod("monthly", new Date(2026, 1, 10));
    expect(start.getMonth()).toBe(1);
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(1);
    expect(end.getDate()).toBe(28);
  });
});

describe("generateReport", () => {
  it("derives completed and planned work, grouped by category order", () => {
    const done = task({ title: "Ship importer", categoryId: "cat-work" });
    const planned = task({
      title: "Sprint review",
      categoryId: "cat-meet",
      startAt: "2026-10-21T10:00",
    });

    const report = generateReport({
      kind: "weekly",
      language: "en",
      periodLabel: "2026-10-19 ~ 2026-10-25",
      periodStart,
      periodEnd,
      numbering: "chinese",
      categories,
      tasks: [done, planned],
      completions: [completion(done.id, "2026-10-20T16:00:00")],
    });

    expect(report.completedCount).toBe(1);
    expect(report.scheduledCount).toBe(1);
    expect(report.sections.map((section) => section.categoryName)).toEqual(["Project work", "Meetings"]);
    expect(report.sections[0].heading).toBe("一、");
    expect(report.sections[0].items[0]).toMatchObject({ text: "Ship importer", completed: true });
    expect(report.sections[1].items[0]).toMatchObject({ text: "Sprint review", completed: false });
  });

  it("excludes completions and schedules outside the period", () => {
    const oldDone = task({ title: "Old work" });
    const future = task({ title: "Future work", startAt: "2026-11-05T09:00" });

    const report = generateReport({
      kind: "weekly",
      language: "en",
      periodLabel: "2026-10-19 ~ 2026-10-25",
      periodStart,
      periodEnd,
      numbering: "arabic",
      categories,
      tasks: [oldDone, future],
      completions: [completion(oldDone.id, "2026-10-10T12:00:00")],
    });

    expect(report.sections).toHaveLength(0);
    expect(report.completedCount).toBe(0);
    expect(report.scheduledCount).toBe(0);
  });

  it("puts uncategorized tasks in a trailing section", () => {
    const loose = task({ title: "Loose end", categoryId: null, startAt: "2026-10-22T09:00" });

    const report = generateReport({
      kind: "daily",
      language: "zh-CN",
      periodLabel: "2026-10-22",
      periodStart: new Date("2026-10-22T00:00:00"),
      periodEnd: new Date("2026-10-22T23:59:59"),
      numbering: "chinese",
      categories,
      tasks: [loose],
      completions: [],
    });

    expect(report.sections).toHaveLength(1);
    expect(report.sections[0].categoryName).toBe("未分类");
    expect(report.title).toBe("日报");
  });

  it("treats a date-only due value as a local calendar day", () => {
    const due = task({ title: "File expenses", dueAt: "2026-10-21" });
    const report = generateReport({
      kind: "daily",
      language: "en",
      periodLabel: "2026-10-21",
      periodStart: new Date(2026, 9, 21),
      periodEnd: new Date(2026, 9, 21),
      numbering: "arabic",
      categories,
      tasks: [due],
      completions: [],
    });

    expect(report.scheduledCount).toBe(1);
    expect(report.sections[0].items[0]).toMatchObject({ text: "File expenses", completed: false });
  });

  it("does not count a completed task twice", () => {
    const done = task({ title: "Done", startAt: "2026-10-20T09:00" });
    const report = generateReport({
      kind: "weekly",
      language: "en",
      periodLabel: "week",
      periodStart,
      periodEnd,
      numbering: "arabic",
      categories,
      tasks: [done],
      completions: [completion(done.id, "2026-10-20T18:00:00")],
    });

    expect(report.completedCount).toBe(1);
    expect(report.scheduledCount).toBe(0);
    expect(report.sections[0].items).toHaveLength(1);
  });
});
