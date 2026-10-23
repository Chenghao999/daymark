import { reportOutline } from "./context";
import type { AiFeature, AiPrompt, AiRequest } from "./types";

const LANGUAGE_NAME: Record<AiRequest["language"], string> = {
  en: "English",
  "zh-CN": "Simplified Chinese",
};

const SYSTEM: Record<AiFeature, string> = {
  polish: [
    "You are a careful editor for a personal work report.",
    "Rewrite the supplied outline as clear, professional prose.",
    "Rules: keep every category and every item; never add, remove or invent work;",
    "never invent dates, people, metrics or outcomes; use Markdown headings that",
    "mirror the existing categories; do not add a preface, explanation or closing",
    "offer; return only the finished report.",
  ].join(" "),
  review: [
    "You are a concise retrospective coach.",
    "Given a work-report outline, summarise what was completed, what stayed",
    "planned, and the most plausible reason for the gap. Finish with one or two",
    "concrete suggestions for the next period.",
    "Do not invent facts; if the outline is thin, say so briefly. Use Markdown,",
    "keep it under 300 words, and return only the retrospective.",
  ].join(" "),
};

const TASK: Record<AiFeature, string> = {
  polish: "Rewrite this report as finished prose, keeping the category structure.",
  review: "Write the retrospective for this period.",
};

/**
 * Builds the exact text sent to the provider. Pure, so the UI can show the
 * same string as a preview before the user confirms.
 */
export function buildPrompt(request: AiRequest): AiPrompt {
  const { report, feature, language } = request;
  const author = request.userName.trim();
  const header = [
    `Report: ${report.title}`,
    `Period: ${report.periodLabel}`,
    `Completed: ${report.completedCount} · Planned: ${report.scheduledCount}`,
    ...(author ? [`Author: ${author}`] : []),
  ].join("\n");

  return {
    system: `${SYSTEM[feature]} Reply in ${LANGUAGE_NAME[language]}.`,
    user: [
      header,
      "",
      "Outline (a checked box means completed):",
      "",
      reportOutline(report),
      "",
      `Task: ${TASK[feature]}`,
    ].join("\n"),
  };
}
