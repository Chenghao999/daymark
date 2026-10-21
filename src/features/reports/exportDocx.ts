import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { ReportDocument } from "../../domain/types";

/**
 * Renders a derived report into a .docx. The document intentionally keeps to
 * Word's built-in heading and bullet styles so users can restyle it from a
 * template later without Daymark owning the visual design.
 */
export async function exportReportDocx(report: ReportDocument, language: "en" | "zh-CN"): Promise<string | null> {
  const summary =
    language === "zh-CN"
      ? `已完成 ${report.completedCount} 项，已排期 ${report.scheduledCount} 项`
      : `${report.completedCount} completed, ${report.scheduledCount} planned`;

  const children: Paragraph[] = [
    new Paragraph({ text: report.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: report.periodLabel, heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ children: [new TextRun({ text: summary, italics: true })] }),
    new Paragraph({ text: "" }),
  ];

  for (const section of report.sections) {
    children.push(
      new Paragraph({
        text: `${section.heading}${section.categoryName}`,
        heading: HeadingLevel.HEADING_1,
      }),
    );
    for (const item of section.items) {
      children.push(
        new Paragraph({
          text: item.text,
          bullet: { level: 0 },
        }),
      );
    }
  }

  const document = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(document);
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const safeName = `${report.title}-${report.periodLabel}`.replace(/[\\/:*?"<>|]/g, "-");
  const target = await save({
    defaultPath: `${safeName}.docx`,
    filters: [{ name: "Word", extensions: ["docx"] }],
  });
  if (!target) return null;

  await invoke("write_file_bytes", { path: target, contents: Array.from(bytes) });
  return target;
}
