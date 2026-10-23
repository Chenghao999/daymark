import type { ReportDocument } from "../domain/types";

export interface AiContextSummary {
  sectionCount: number;
  itemCount: number;
  /** Characters of the outline that will actually be sent. */
  characters: number;
}

/**
 * The report as plain Markdown, which is what the model receives. It is built
 * from the derived report, so it contains only titles, dates, categories and
 * completion marks — never task ids, notes or the data folder path.
 */
export function reportOutline(report: ReportDocument): string {
  const lines = [
    `# ${report.title} · ${report.periodLabel}`,
    "",
    `Completed: ${report.completedCount} · Planned: ${report.scheduledCount}`,
  ];

  for (const section of report.sections) {
    lines.push("", `## ${section.heading}${section.categoryName}`);
    for (const item of section.items) {
      const box = item.completed ? "x" : " ";
      const date = item.date ? ` (${item.date})` : "";
      lines.push(`- [${box}] ${item.text}${date}`);
    }
  }

  return lines.join("\n").trim();
}

/** Numbers shown to the user before they agree to send anything. */
export function aiContextSummary(report: ReportDocument): AiContextSummary {
  const itemCount = report.sections.reduce((total, section) => total + section.items.length, 0);
  return {
    sectionCount: report.sections.length,
    itemCount,
    characters: reportOutline(report).length,
  };
}
