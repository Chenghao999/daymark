import { describe, expect, it } from "vitest";
import { parseAiMarkdown } from "../src/features/reports/aiAppendix";

describe("AI appendix Markdown", () => {
  it("returns nothing for empty or whitespace-only text", () => {
    expect(parseAiMarkdown("")).toEqual([]);
    expect(parseAiMarkdown("  \n\n\t\n")).toEqual([]);
  });

  it("turns ATX headings into heading blocks and clamps deep levels", () => {
    expect(parseAiMarkdown("# Work\n### Details\n###### Deep")).toEqual([
      { kind: "heading", level: 1, text: "Work" },
      { kind: "heading", level: 3, text: "Details" },
      { kind: "heading", level: 3, text: "Deep" },
    ]);
  });

  it("recognises bullets and blockquotes", () => {
    expect(parseAiMarkdown("- one\n* two\n> note")).toEqual([
      { kind: "bullet", text: "one" },
      { kind: "bullet", text: "two" },
      { kind: "paragraph", text: "note" },
    ]);
  });

  it("removes inline emphasis, code and link syntax", () => {
    expect(
      parseAiMarkdown("**bold** and *italic* and `code` and [site](https://example.com)"),
    ).toEqual([
      {
        kind: "paragraph",
        text: "bold and italic and code and site (https://example.com)",
      },
    ]);
  });

  it("collapses blank lines and trims both ends", () => {
    expect(parseAiMarkdown("\n\n# A\n\n\nText\n\n")).toEqual([
      { kind: "heading", level: 1, text: "A" },
      { kind: "blank" },
      { kind: "paragraph", text: "Text" },
    ]);
  });

  it("does not treat a heading inside a code fence as a heading", () => {
    expect(parseAiMarkdown("```\n# not a heading\n```")).toEqual([
      { kind: "paragraph", text: "# not a heading" },
    ]);
  });

  it("drops horizontal rules", () => {
    expect(parseAiMarkdown("---\n***\n___")).toEqual([]);
  });
});
