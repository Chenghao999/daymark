import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { Document, Packer, Paragraph, TextRun } from "docx";
import type { ReportDocument } from "../src/domain/types";
import {
  MAX_TEMPLATE_BYTES,
  TemplateError,
  formatTemplateTimestamp,
  inspectTemplate,
  renderReportTemplate,
  templatePath,
} from "../src/features/reports/template";

const report: ReportDocument = {
  kind: "weekly",
  title: "Weekly report",
  periodLabel: "2026-11-02 ~ 2026-11-08",
  generatedAt: "2026-11-07T09:05:00.000Z",
  completedCount: 3,
  scheduledCount: 5,
  sections: [
    {
      categoryId: "project",
      categoryName: "项目开发",
      heading: "一、",
      items: [
        { taskId: "t1", text: "写周报", date: "2026-11-06", completed: true },
        { taskId: null, text: "Reviewed the template engine", date: null, completed: false },
      ],
    },
  ],
};

async function templateBytes(children: Paragraph[]): Promise<Uint8Array> {
  const document = new Document({ sections: [{ children }] });
  return new Uint8Array(await Packer.toBuffer(document));
}

async function documentXml(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("word/document.xml missing from the generated document");
  return file.async("string");
}

/** The visible text, joined across the runs Word splits a paragraph into. */
async function documentText(bytes: Uint8Array): Promise<string> {
  const xml = await documentXml(bytes);
  return Array.from(xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g), (match) => match[1]).join("");
}

describe("report templates", () => {
  it("addresses a language-specific file inside the data folder", () => {
    expect(templatePath("/data", "en")).toBe("/data/templates/report.en.docx");
    expect(templatePath("/data", "zh-CN")).toBe("/data/templates/report.zh-CN.docx");
  });

  it("formats the generation time as local wall-clock text", () => {
    expect(formatTemplateTimestamp(new Date(2026, 10, 7, 9, 5))).toBe("2026-11-07 09:05");
    expect(formatTemplateTimestamp(new Date(2026, 0, 2, 23, 59))).toBe("2026-01-02 23:59");
  });

  it("detects known and unknown placeholders before rendering", async () => {
    const bytes = await templateBytes([
      new Paragraph("{{title}}"),
      new Paragraph("{{unknown_thing}}"),
    ]);
    const inspection = await inspectTemplate(bytes);
    expect(inspection.placeholders).toEqual(expect.arrayContaining(["title", "unknown_thing"]));
    expect(inspection.unknown).toEqual(["unknown_thing"]);
    expect(inspection.missingRequired).toBe(true);
  });

  it("replaces document and inline placeholders, including runs split by Word", async () => {
    const bytes = await templateBytes([
      new Paragraph({ children: [new TextRun("{{ti"), new TextRun("tle}}")] }),
      new Paragraph("Period {{period}} — {{completed_count}} done / {{planned_count}} planned"),
      new Paragraph("Generated {{generated_at}}"),
      new Paragraph("{{sections}}"),
      new Paragraph("Tail stays"),
    ]);

    const rendered = await renderReportTemplate(bytes, {
      report,
      language: "en",
      generatedAt: new Date(2026, 10, 7, 9, 5),
    });
    expect(rendered.unknown).toEqual([]);
    expect(rendered.placeholders).toEqual(expect.arrayContaining(["sections", "title", "period"]));

    const xml = await documentXml(rendered.bytes);
    const text = await documentText(rendered.bytes);
    expect(text).toContain("Weekly report");
    expect(text).toContain("2026-11-02 ~ 2026-11-08");
    expect(text).toContain("3 done / 5 planned");
    expect(text).toContain("2026-11-07 09:05");
    expect(text).toContain("一、项目开发");
    expect(text).toContain("写周报");
    expect(text).toContain("Tail stays");
    expect(xml).not.toContain("{{title}}");
    expect(xml).not.toContain("{{sections}}");
  });

  it("leaves unknown placeholders as text and reports them", async () => {
    const bytes = await templateBytes([
      new Paragraph("{{title}}"),
      new Paragraph("{{sections}}"),
      new Paragraph("Colour: {{brand_colour}}"),
    ]);
    const rendered = await renderReportTemplate(bytes, { report, language: "en" });

    expect(rendered.unknown).toEqual(["brand_colour"]);
    const xml = await documentXml(rendered.bytes);
    expect(xml).toContain("{{brand_colour}}");
  });

  it("refuses a template without the sections placeholder", async () => {
    const bytes = await templateBytes([new Paragraph("{{title}}")]);
    await expect(renderReportTemplate(bytes, { report, language: "en" })).rejects.toBeInstanceOf(
      TemplateError,
    );
  });

  it("appends the reviewed AI text after the report sections", async () => {
    const bytes = await templateBytes([
      new Paragraph("{{title}}"),
      new Paragraph("{{sections}}"),
    ]);
    const rendered = await renderReportTemplate(bytes, {
      report,
      language: "en",
      aiText: "## Summary\n- Shipped templates",
    });

    const text = await documentText(rendered.bytes);
    expect(text).toContain("AI assistant");
    expect(text).toContain("Generated by AI");
    expect(text).toContain("Summary");
    expect(text).toContain("Shipped templates");
    // The appendix follows the report's own heading.
    expect(text.indexOf("一、项目开发")).toBeLessThan(text.indexOf("AI assistant"));
  });

  it("adds no appendix when there is no AI text", async () => {
    const bytes = await templateBytes([new Paragraph("{{sections}}")]);
    const rendered = await renderReportTemplate(bytes, { report, language: "en", aiText: "   " });
    expect(await documentXml(rendered.bytes)).not.toContain("AI assistant");
  });

  it("rejects an unreasonably large template before parsing it", async () => {
    const huge = new Uint8Array(MAX_TEMPLATE_BYTES + 1);
    await expect(inspectTemplate(huge)).rejects.toThrow(/20 MB/);
  });
});
