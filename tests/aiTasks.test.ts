import { describe, expect, it } from "vitest";
import { buildTaskPrompt, MAX_SUGGESTIONS, parseTaskResponse } from "../src/ai";

const now = new Date(2026, 9, 24, 15, 30); // Saturday 2026-10-24 15:30 local

const categories = [
  { id: "cat-work", name: "Work" },
  { id: "cat-life", name: "生活" },
];

function answer(...tasks: Record<string, unknown>[]): string {
  return JSON.stringify({ tasks });
}

function task(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Lunch with Ana",
    categoryId: "cat-work",
    startAt: "2026-10-27T12:00",
    endAt: "2026-10-27T13:00",
    dueAt: "",
    allDay: false,
    priority: 0,
    notes: "",
    ...overrides,
  };
}

describe("task prompt", () => {
  it("carries the local wall-clock time, weekday and language", () => {
    const prompt = buildTaskPrompt({ text: "Lunch next Tuesday", now, language: "en", categories });
    expect(prompt.user).toContain("Current local time: 2026-10-24T15:30 (Saturday)");
    expect(prompt.user).toContain("Language: English");
    expect(prompt.system).toContain("Write titles and notes in English.");
  });

  it("lists only the supplied categories and keeps them id → name", () => {
    const prompt = buildTaskPrompt({ text: "Lunch", now, language: "en", categories });
    expect(prompt.user).toContain("- cat-work → Work");
    expect(prompt.user).toContain("- cat-life → 生活");
    expect(prompt.user).toContain("Sentence:\nLunch");
    expect(prompt.system).toContain("Only use a categoryId from the supplied list");
  });

  it("says there are no categories instead of leaving the list empty", () => {
    const prompt = buildTaskPrompt({ text: "Lunch", now, language: "zh-CN", categories: [] });
    expect(prompt.user).toContain("Categories (id → name):\n- (none)");
    expect(prompt.user).toContain("Language: Simplified Chinese");
    expect(prompt.user).toContain("(周六)");
  });
});

describe("task parsing", () => {
  it("reads a complete task", () => {
    const [parsed] = parseTaskResponse(answer(task()), ["cat-work"]);
    expect(parsed).toEqual({
      title: "Lunch with Ana",
      notes: "",
      categoryId: "cat-work",
      startAt: "2026-10-27T12:00",
      endAt: "2026-10-27T13:00",
      dueAt: null,
      priority: 0,
      allDay: false,
    });
  });

  it("drops a category id the model invented", () => {
    const [parsed] = parseTaskResponse(answer(task({ categoryId: "cat-ghost" })), ["cat-work"]);
    expect(parsed.categoryId).toBeNull();
  });

  it("drops impossible dates and out-of-range times", () => {
    const [parsed] = parseTaskResponse(
      answer(task({ startAt: "2026-02-30T09:00", endAt: "2026-10-27T25:00", dueAt: "2026-13-01" })),
      ["cat-work"],
    );
    expect(parsed.startAt).toBeNull();
    expect(parsed.endAt).toBeNull();
    expect(parsed.dueAt).toBeNull();
  });

  it("keeps an end only when it is after the start", () => {
    const [backwards] = parseTaskResponse(
      answer(task({ startAt: "2026-10-27T13:00", endAt: "2026-10-27T12:00" })),
      [],
    );
    expect(backwards.endAt).toBeNull();

    const [noStart] = parseTaskResponse(answer(task({ startAt: "", endAt: "2026-10-27T12:00" })), []);
    expect(noStart.endAt).toBeNull();
  });

  it("turns an all-day task into a plain date and drops its end", () => {
    const [parsed] = parseTaskResponse(
      answer(task({ allDay: true, startAt: "2026-10-27T12:00", endAt: "2026-10-27T13:00" })),
      [],
    );
    expect(parsed.allDay).toBe(true);
    expect(parsed.startAt).toBe("2026-10-27");
    expect(parsed.endAt).toBeNull();
  });

  it("treats a date-only start as all-day even if the model said otherwise", () => {
    const [parsed] = parseTaskResponse(
      answer(task({ allDay: false, startAt: "2026-10-27", endAt: "2026-10-27T13:00" })),
      [],
    );
    expect(parsed.allDay).toBe(true);
    expect(parsed.startAt).toBe("2026-10-27");
    expect(parsed.endAt).toBeNull();
  });

  it("normalises space-separated times, seconds and date-only dues", () => {
    const [parsed] = parseTaskResponse(
      answer(task({ startAt: "2026-10-27 09:05:30", endAt: "", dueAt: "2026-10-30T18:00" })),
      [],
    );
    expect(parsed.startAt).toBe("2026-10-27T09:05");
    expect(parsed.dueAt).toBe("2026-10-30");
  });

  it("coerces unknown priorities to normal and trims notes", () => {
    const [high] = parseTaskResponse(answer(task({ priority: 2, notes: "  bring files  " })), []);
    expect(high.priority).toBe(2);
    expect(high.notes).toBe("bring files");

    const [odd] = parseTaskResponse(answer(task({ priority: 7 })), []);
    expect(odd.priority).toBe(0);
  });

  it("returns several tasks in order and skips empty titles", () => {
    const parsed = parseTaskResponse(
      answer(task({ title: "First" }), task({ title: "   " }), task({ title: "Second" })),
      [],
    );
    expect(parsed.map((suggestion) => suggestion.title)).toEqual(["First", "Second"]);
  });

  it("caps the list at the maximum", () => {
    const many = Array.from({ length: MAX_SUGGESTIONS + 5 }, (_, index) =>
      task({ title: `Task ${index}` }),
    );
    expect(parseTaskResponse(answer(...many), [])).toHaveLength(MAX_SUGGESTIONS);
  });

  it("returns an empty list when the model found nothing", () => {
    expect(parseTaskResponse(answer(), [])).toEqual([]);
  });

  it("accepts JSON wrapped in Markdown fences", () => {
    const parsed = parseTaskResponse("```json\n" + answer(task()) + "\n```", ["cat-work"]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("Lunch with Ana");
  });

  it("rejects malformed JSON and a wrongly shaped answer", () => {
    expect(() => parseTaskResponse("not json", [])).toThrow(/valid JSON/);
    expect(() => parseTaskResponse(JSON.stringify({ items: [] }), [])).toThrow(/task list/);
    expect(() => parseTaskResponse(JSON.stringify([]), [])).toThrow(/task list/);
  });
});
