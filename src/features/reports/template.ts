import { PatchType, Paragraph, TextRun, patchDetector, patchDocument } from "docx";
import type { ReportDocument } from "../../domain/types";
import { aiAppendixBlocks, sectionBlocks } from "./docxBlocks";

/**
 * Placeholders understood by the 0.1 template renderer. Everything is
 * block-level: inline placeholders keep the template's surrounding run
 * formatting, `{{sections}}` must stand in a paragraph of its own and is
 * replaced by the derived headings and bullets (plus the optional AI
 * appendix).
 */
export const TEMPLATE_PLACEHOLDERS = [
  "title",
  "period",
  "generated_at",
  "completed_count",
  "planned_count",
  "sections",
] as const;

export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];

/** A template without this placeholder would lose the whole report. */
export const REQUIRED_TEMPLATE_PLACEHOLDER = "sections";

/** A 20 MB cap keeps a mistaken binary from being loaded into memory. */
export const MAX_TEMPLATE_BYTES = 20 * 1024 * 1024;

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}

/**
 * Templates travel with the data folder and are language-specific, so an
 * English and a Chinese report can use different designs.
 */
export function templatePath(root: string, language: "en" | "zh-CN"): string {
  return `${root}/templates/report.${language}.docx`;
}

/** Local wall-clock timestamp; stable across time zones and easy to read. */
export function formatTemplateTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(" ");
}

export function isKnownTemplatePlaceholder(name: string): name is TemplatePlaceholder {
  return (TEMPLATE_PLACEHOLDERS as readonly string[]).includes(name);
}

export interface TemplateInspection {
  /** Every placeholder found in the document's XML parts. */
  placeholders: readonly string[];
  /** Placeholders 0.1 does not replace; they stay in the output as text. */
  unknown: readonly string[];
  missingRequired: boolean;
}

/**
 * Reads a template without rendering it. Malformed ZIP/OOXML throws, which the
 * exporter treats as "ignore the template and use the built-in layout".
 */
export async function inspectTemplate(bytes: Uint8Array): Promise<TemplateInspection> {
  if (bytes.byteLength > MAX_TEMPLATE_BYTES) {
    throw new TemplateError("The template is larger than 20 MB.");
  }
  const placeholders = await patchDetector({ data: bytes });
  return {
    placeholders,
    unknown: placeholders.filter((name) => !isKnownTemplatePlaceholder(name)),
    missingRequired: !placeholders.includes(REQUIRED_TEMPLATE_PLACEHOLDER),
  };
}

export interface TemplateRenderInput {
  report: ReportDocument;
  language: "en" | "zh-CN";
  /** Injectable for tests; defaults to now. */
  generatedAt?: Date;
  aiText?: string | null;
}

export interface TemplateRenderResult extends TemplateInspection {
  bytes: Uint8Array;
}

/**
 * Replaces the placeholders in a user template. The template's styles,
 * headers, footers, images and everything outside the placeholders are kept:
 * `patchDocument` edits the existing package instead of rebuilding it.
 */
export async function renderReportTemplate(
  template: Uint8Array,
  input: TemplateRenderInput,
): Promise<TemplateRenderResult> {
  const inspection = await inspectTemplate(template);
  if (inspection.missingRequired) {
    throw new TemplateError(`The template has no {{${REQUIRED_TEMPLATE_PLACEHOLDER}}} placeholder.`);
  }

  const { report, language } = input;
  const textPatch = (value: string) => ({
    type: PatchType.PARAGRAPH,
    children: [new TextRun(value)],
  });
  const sections = [
    ...sectionBlocks(report),
    ...aiAppendixBlocks(input.aiText, language),
  ];
  const patches = {
    title: textPatch(report.title),
    period: textPatch(report.periodLabel),
    generated_at: textPatch(formatTemplateTimestamp(input.generatedAt ?? new Date())),
    completed_count: textPatch(String(report.completedCount)),
    planned_count: textPatch(String(report.scheduledCount)),
    sections: {
      type: PatchType.DOCUMENT,
      // An empty report still needs one block so the placeholder paragraph is
      // replaced rather than left behind.
      children: sections.length > 0 ? sections : [new Paragraph({ text: "" })],
    },
  };

  const bytes = await patchDocument({
    outputType: "uint8array",
    data: template,
    patches,
  });
  return { ...inspection, bytes };
}
