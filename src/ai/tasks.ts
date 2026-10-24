import type { AppLanguage } from "../domain/types";
import type { AiJsonSchema, AiPrompt } from "./types";

/** Form-shaped suggestion; the editor fills its fields, nothing is saved. */
export interface TaskSuggestion {
  title: string;
  notes: string;
  categoryId: string | null;
  /** `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`, local time. */
  startAt: string | null;
  endAt: string | null;
  dueAt: string | null;
  priority: 0 | 1 | 2 | 3;
  allDay: boolean;
}

export interface TaskPromptInput {
  text: string;
  now: Date;
  language: AppLanguage;
  /** Ids and already-localised names; the model may only pick from these. */
  categories: { id: string; name: string }[];
}

export const MAX_SUGGESTIONS = 10;

const WEEKDAYS: Record<AppLanguage, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  "zh-CN": ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
};

/**
 * The schema is given to the provider, not written into the prompt: the API
 * validates the shape, and `parseTaskResponse` only has to check the values.
 * Empty strings mean "not specified" so the schema avoids nullable unions.
 */
export const TASK_SUGGESTION_SCHEMA: AiJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tasks"],
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "categoryId",
          "startAt",
          "endAt",
          "dueAt",
          "allDay",
          "priority",
          "notes",
        ],
        properties: {
          title: { type: "string", description: "Short task title in the user's language." },
          categoryId: {
            type: "string",
            description: "One id from the supplied category list, or an empty string.",
          },
          startAt: {
            type: "string",
            description:
              "Local start as YYYY-MM-DDTHH:mm, YYYY-MM-DD for an all-day task, or an empty string.",
          },
          endAt: {
            type: "string",
            description: "Local end as YYYY-MM-DDTHH:mm, or an empty string.",
          },
          dueAt: {
            type: "string",
            description: "Local due date as YYYY-MM-DD, or an empty string.",
          },
          allDay: { type: "boolean" },
          priority: { type: "integer", enum: [0, 1, 2, 3] },
          notes: { type: "string", description: "Any detail worth keeping, or an empty string." },
        },
      },
    },
  },
};

export function buildTaskPrompt(input: TaskPromptInput): AiPrompt {
  const { text, now, language, categories } = input;
  const languageName = language === "zh-CN" ? "Simplified Chinese" : "English";
  const stamp = localStamp(now);
  const categoryLines =
    categories.length > 0
      ? categories.map((category) => `- ${category.id} → ${category.name}`).join("\n")
      : "- (none)";

  return {
    system: [
      "You turn one sentence into calendar tasks for a personal planner.",
      "Rules:",
      "- Resolve relative dates and times against the supplied current local time.",
      "- Use the user's local wall-clock time; never add a timezone offset.",
      "- Only use a categoryId from the supplied list; use an empty string otherwise.",
      "- Use an empty string for absent fields. Set allDay true for date-only tasks.",
      "- End must not be earlier than start. Do not invent tasks the sentence does not ask for.",
      `- Write titles and notes in ${languageName}.`,
    ].join("\n"),
    user: [
      `Current local time: ${stamp} (${WEEKDAYS[language][now.getDay()]})`,
      `Language: ${languageName}`,
      "Categories (id → name):",
      categoryLines,
      "",
      "Sentence:",
      text,
    ].join("\n"),
  };
}

/**
 * Validates the structured answer. Anything the model invented (an unknown
 * category id, an impossible date) is corrected or dropped here; a task is
 * never created from this function.
 */
export function parseTaskResponse(text: string, knownCategoryIds: Iterable<string>): TaskSuggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    throw new Error("The model did not return valid JSON.");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.tasks)) {
    throw new Error("The model did not return a task list.");
  }

  const known = new Set(knownCategoryIds);
  const suggestions: TaskSuggestion[] = [];

  for (const raw of parsed.tasks.slice(0, MAX_SUGGESTIONS)) {
    if (!isRecord(raw)) continue;
    const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 300) : "";
    if (!title) continue;

    const start = normalizeDateTime(raw.startAt);
    const end = normalizeDateTime(raw.endAt);
    const due = normalizeDate(raw.dueAt);

    // A date-only start with `allDay: false` contradicts itself; the editor's
    // date input cannot represent it, so treat it as an all-day task.
    const allDay = raw.allDay === true || (start !== null && start.length === 10);
    const startAt = start ? (allDay ? start.slice(0, 10) : start) : null;
    const endAt = !allDay && startAt && end && end > startAt ? end : null;
    const categoryId =
      typeof raw.categoryId === "string" && known.has(raw.categoryId) ? raw.categoryId : null;
    const priority = normalizePriority(raw.priority);

    suggestions.push({
      title,
      notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, 4000) : "",
      categoryId,
      startAt,
      endAt,
      dueAt: due,
      priority,
      allDay,
    });
  }

  return suggestions;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/;

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = DATE_RE.exec(value.trim()) ?? DATETIME_RE.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  if (!isRealDate(Number(year), Number(month), Number(day))) return null;
  return `${year}-${month}-${day}`;
}

function normalizeDateTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = DATETIME_RE.exec(trimmed);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    if (!isRealDate(Number(year), Number(month), Number(day))) return null;
    if (Number(hour) > 23 || Number(minute) > 59) return null;
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }
  return normalizeDate(trimmed);
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

function normalizePriority(value: unknown): 0 | 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3 ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Some OpenAI-compatible servers still wrap JSON in Markdown fences. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

function localStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
