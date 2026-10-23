import { describe, expect, it } from "vitest";
import { aiContextSummary, buildPrompt, reportOutline } from "../src/ai";
import type { ReportDocument } from "../src/domain/types";

const report: ReportDocument = {
  kind: "weekly",
  title: "Weekly report",
  periodLabel: "2026-10-19 ~ 2026-10-25",
  generatedAt: "2026-10-25T12:00:00.000Z",
  completedCount: 2,
  scheduledCount: 1,
  sections: [
    {
      categoryId: "cat-1",
      categoryName: "Development",
      heading: "一、",
      items: [
        { taskId: "t1", text: "Ship the Markdown store", date: "2026-10-20", completed: true },
        { taskId: "t2", text: "Write the sync docs", date: "2026-10-21", completed: false },
      ],
    },
    {
      categoryId: null,
      categoryName: "Uncategorized",
      heading: "二、",
      items: [{ taskId: "t3", text: "Review the draft", date: null, completed: true }],
    },
  ],
};

const empty: ReportDocument = {
  kind: "daily",
  title: "Daily report",
  periodLabel: "2026-10-22",
  generatedAt: "2026-10-22T12:00:00.000Z",
  completedCount: 0,
  scheduledCount: 0,
  sections: [],
};

describe("report outline", () => {
  it("renders headings, checked and unchecked items, dates", () => {
    expect(reportOutline(report)).toBe(
      [
        "# Weekly report · 2026-10-19 ~ 2026-10-25",
        "",
        "Completed: 2 · Planned: 1",
        "",
        "## 一、Development",
        "- [x] Ship the Markdown store (2026-10-20)",
        "- [ ] Write the sync docs (2026-10-21)",
        "",
        "## 二、Uncategorized",
        "- [x] Review the draft",
      ].join("\n"),
    );
  });

  it("still returns the header for an empty report", () => {
    expect(reportOutline(empty)).toContain("# Daily report · 2026-10-22");
    expect(reportOutline(empty)).toContain("Completed: 0 · Planned: 0");
  });

  it("counts sections, items and the characters that will be sent", () => {
    const summary = aiContextSummary(report);
    expect(summary.sectionCount).toBe(2);
    expect(summary.itemCount).toBe(3);
    expect(summary.characters).toBe(reportOutline(report).length);
  });
});

describe("prompt construction", () => {
  it("uses the polish instructions by default and names the language", () => {
    const prompt = buildPrompt({ feature: "polish", language: "en", report, userName: "" });
    expect(prompt.system).toContain("careful editor");
    expect(prompt.system).toContain("Reply in English.");
    expect(prompt.user).toContain("Task: Rewrite this report as finished prose");
    expect(prompt.user).toContain("- [x] Ship the Markdown store (2026-10-20)");
  });

  it("switches instructions and language for a retrospective", () => {
    const prompt = buildPrompt({ feature: "review", language: "zh-CN", report, userName: "" });
    expect(prompt.system).toContain("retrospective coach");
    expect(prompt.system).toContain("Reply in Simplified Chinese.");
    expect(prompt.user).toContain("Task: Write the retrospective for this period.");
  });

  it("includes the author only when one is set", () => {
    expect(buildPrompt({ feature: "polish", language: "en", report, userName: "" }).user).not.toContain("Author:");
    expect(
      buildPrompt({ feature: "polish", language: "en", report, userName: "  Lin  " }).user,
    ).toContain("Author: Lin");
  });

  it("contains no task ids or data-folder paths", () => {
    const prompt = buildPrompt({ feature: "polish", language: "en", report, userName: "" });
    expect(prompt.user).not.toContain("t1");
    expect(prompt.system).not.toContain("/Users/");
  });
});
