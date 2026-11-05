/**
 * AI answers are Markdown (the prompts ask for headings and plain prose), but
 * the DOCX exporter uses Word styles rather than Markdown. This parser turns
 * the answer into a small, presentation-neutral block list so the preview and
 * the DOCX use exactly the same structure.
 */
export type AiAppendixBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "blank" };

const HEADING = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*(?:```|~~~)/;

/** Drop inline markers that Word would otherwise print literally. */
function inline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
}

export function parseAiMarkdown(text: string): AiAppendixBlock[] {
  const blocks: AiAppendixBlock[] = [];
  let inFence = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (FENCE.test(line)) {
      // Fence markers are formatting, not content; the code itself stays.
      inFence = !inFence;
      blocks.push({ kind: "blank" });
      continue;
    }
    if (inFence) {
      blocks.push(
        line.trim()
          ? { kind: "paragraph", text: line.trim() }
          : { kind: "blank" },
      );
      continue;
    }
    if (!line.trim() || RULE.test(line)) {
      blocks.push({ kind: "blank" });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ kind: "heading", level, text: inline(heading[2]) });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      blocks.push({ kind: "bullet", text: inline(bullet[1]) });
      continue;
    }
    const quote = QUOTE.exec(line);
    if (quote) {
      blocks.push({ kind: "paragraph", text: inline(quote[1]) });
      continue;
    }
    blocks.push({ kind: "paragraph", text: inline(line.trim()) });
  }

  // No leading/trailing blank space, and at most one blank between blocks.
  const cleaned: AiAppendixBlock[] = [];
  for (const block of blocks) {
    if (
      block.kind === "blank" &&
      (cleaned.length === 0 || cleaned[cleaned.length - 1].kind === "blank")
    ) {
      continue;
    }
    cleaned.push(block);
  }
  while (
    cleaned.length > 0 &&
    cleaned[cleaned.length - 1].kind === "blank"
  ) {
    cleaned.pop();
  }
  return cleaned;
}
