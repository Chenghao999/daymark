import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { ReportDocument } from "../../domain/types";
import { pathExists, readFileBytes } from "../../storage/fs";
import { aiAppendixBlocks, sectionBlocks } from "./docxBlocks";
import { renderReportTemplate, templatePath, type TemplateRenderResult } from "./template";

export interface ReportExportResult {
  /** The saved file, or `null` when the user cancelled the save dialog. */
  path: string | null;
  /** Whether a user template was found, used, or existed but was not usable. */
  template: "none" | "used" | "ignored";
  /** Unknown template placeholders left as text; empty for the built-in layout. */
  unknownPlaceholders: readonly string[];
}

/**
 * Renders a derived report into a .docx. The built-in document intentionally
 * keeps to Word's built-in heading and bullet styles so users can restyle it
 * later; if `<dataDir>/templates/report.<language>.docx` exists and contains a
 * `{{sections}}` placeholder, that template is patched instead.
 *
 * `aiText` is the reviewed text from the AI assistant. It is appended as a
 * separate, labelled section so the structured report remains the source of
 * truth and an AI answer is never presented as if Daymark had verified it.
 */
export async function exportReportDocx(
  report: ReportDocument,
  language: "en" | "zh-CN",
  aiText?: string | null,
  dataDir?: string,
): Promise<ReportExportResult> {
  const rendered = await renderBytes(report, language, aiText, dataDir);
  const bytes = rendered.bytes;

  const safeName = `${report.title}-${report.periodLabel}`.replace(/[\\/:*?"<>|]/g, "-");
  const target = await save({
    defaultPath: `${safeName}.docx`,
    filters: [{ name: "Word", extensions: ["docx"] }],
  });
  if (!target) {
    return {
      path: null,
      template: rendered.template,
      unknownPlaceholders: rendered.unknown,
    };
  }

  await invoke("write_file_bytes", { path: target, contents: Array.from(bytes) });
  return {
    path: target,
    template: rendered.template,
    unknownPlaceholders: rendered.unknown,
  };
}

interface RenderedBytes {
  bytes: Uint8Array;
  template: ReportExportResult["template"];
  unknown: readonly string[];
}

/**
 * A template is a convenience, never a requirement: an absent, unreadable or
 * invalid one silently falls back to the built-in layout, and the caller
 * reports that fallback in the status line.
 */
async function renderBytes(
  report: ReportDocument,
  language: "en" | "zh-CN",
  aiText: string | null | undefined,
  dataDir: string | undefined,
): Promise<RenderedBytes> {
  const builtIn = async (template: ReportExportResult["template"]): Promise<RenderedBytes> => ({
    bytes: await builtInBytes(report, language, aiText),
    template,
    unknown: [],
  });

  if (!dataDir || !isTauri()) return builtIn("none");

  const path = templatePath(dataDir, language);
  let templateBytes: Uint8Array;
  try {
    if (!(await pathExists(path))) return builtIn("none");
    templateBytes = new Uint8Array(await readFileBytes(path));
  } catch {
    return builtIn("ignored");
  }

  try {
    const rendered: TemplateRenderResult = await renderReportTemplate(templateBytes, {
      report,
      language,
      aiText,
    });
    return { bytes: rendered.bytes, template: "used", unknown: rendered.unknown };
  } catch {
    return builtIn("ignored");
  }
}

async function builtInBytes(
  report: ReportDocument,
  language: "en" | "zh-CN",
  aiText: string | null | undefined,
): Promise<Uint8Array> {
  const summary =
    language === "zh-CN"
      ? `已完成 ${report.completedCount} 项，已排期 ${report.scheduledCount} 项`
      : `${report.completedCount} completed, ${report.scheduledCount} planned`;

  const children: Paragraph[] = [
    new Paragraph({ text: report.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: report.periodLabel, heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ children: [new TextRun({ text: summary, italics: true })] }),
    new Paragraph({ text: "" }),
    ...sectionBlocks(report),
    ...aiAppendixBlocks(aiText, language),
  ];

  const document = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(document);
  return new Uint8Array(await blob.arrayBuffer());
}
