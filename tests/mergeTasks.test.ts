import { describe, expect, it } from "vitest";
import type { Category, Completion, Task } from "../src/domain/types";
import { mergeTaskFile } from "../src/sync/merge";
import { mergeableDateKey } from "../src/sync/merge";
import { parseMarkdown, serializeMarkdown } from "../src/storage/markdown";
import type { StoredTask } from "../src/storage/types";

const DAY = "2026-10-22";

const categories: Category[] = [
  {
    id: "cat-1",
    nameEn: "Work",
    nameZh: "工作",
    color: "#6b7cff",
    sortOrder: 0,
    archived: false,
  },
];

const options = {
  dateKey: DAY,
  categories,
  deviceId: "device-local",
  updatedAt: "2026-10-29T00:00:00.000Z",
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Write report",
    notes: "",
    categoryId: "cat-1",
    status: "scheduled",
    startAt: `${DAY}T09:00`,
    endAt: `${DAY}T10:00`,
    dueAt: null,
    priority: 0,
    allDay: false,
    createdAt: `${DAY}T08:00:00.000Z`,
    updatedAt: `${DAY}T08:00:00.000Z`,
    deviceId: "device-a",
    rowVersion: 1,
    deleted: false,
    source: "local",
    externalUid: null,
    ...overrides,
  };
}

function completion(completedAt: string): Completion {
  return { id: "completion-1", taskId: "task-1", completedAt, deviceId: "device-a" };
}

function dayText(entries: StoredTask[], extras: string[] = [], dateKey: string | null = DAY): string {
  return serializeMarkdown(dateKey, entries, categories, extras, {
    updatedAt: "2026-10-22T09:00:00.000Z",
    deviceId: "device-a",
  });
}

function entry(value: Task, done: Completion | null = null, dateKey: string | null = DAY): StoredTask {
  return { task: value, completion: done, dateKey };
}

function taskIds(text: string): string[] {
  return parseMarkdown(text, DAY, categories)
    .tasks.map((item) => item.task.id)
    .sort();
}

describe("task-level merge", () => {
  it("combines tasks added on either side", () => {
    const local = dayText([entry(task({ id: "a", title: "Local task" }))]);
    const remote = dayText([entry(task({ id: "b", title: "Remote task" }))]);

    const outcome = mergeTaskFile(local, remote, options);

    expect(outcome.clean).toBe(true);
    expect(taskIds(outcome.text)).toEqual(["a", "b"]);
    expect(outcome.itemCount).toBe(2);
  });

  it("takes the higher rowVersion when both copies of a task changed", () => {
    const local = dayText([entry(task({ title: "Local edit", rowVersion: 2 }))]);
    const remote = dayText([entry(task({ title: "Remote edit", rowVersion: 3 }))]);

    const outcome = mergeTaskFile(local, remote, options);

    expect(outcome.clean).toBe(true);
    expect(outcome.text).toContain("Remote edit");
    expect(outcome.text).not.toContain("Local edit");
  });

  it("falls back to updatedAt when rowVersion is equal", () => {
    const local = dayText([
      entry(task({ title: "Local edit", rowVersion: 2, updatedAt: `${DAY}T10:00:00.000Z` })),
    ]);
    const remote = dayText([
      entry(task({ title: "Remote edit", rowVersion: 2, updatedAt: `${DAY}T11:00:00.000Z` })),
    ]);

    const outcome = mergeTaskFile(local, remote, options);

    expect(outcome.clean).toBe(true);
    expect(outcome.text).toContain("Remote edit");
  });

  it("keeps the local copy when it is the newer version", () => {
    const local = dayText([entry(task({ title: "Local edit", rowVersion: 5 }))]);
    const remote = dayText([entry(task({ title: "Remote edit", rowVersion: 4 }))]);

    const outcome = mergeTaskFile(local, remote, options);

    expect(outcome.clean).toBe(true);
    expect(outcome.text).toContain("Local edit");
  });

  it("lets a completion win over a later reopen", () => {
    const local = dayText([
      entry(task({ status: "done", rowVersion: 2 }), completion(`${DAY}T10:00:00.000Z`)),
    ]);
    const remote = dayText([entry(task({ rowVersion: 3, updatedAt: `${DAY}T11:00:00.000Z` }))]);

    const outcome = mergeTaskFile(local, remote, options);

    expect(outcome.clean).toBe(true);
    expect(outcome.text).toContain("- [x]");
  });

  it("reports an unresolvable tie and leaves the local text untouched", () => {
    const sameVersion = { rowVersion: 2, updatedAt: `${DAY}T10:00:00.000Z` };
    const local = dayText([entry(task({ title: "Local title", ...sameVersion }))]);
    const remote = dayText([entry(task({ title: "Remote title", ...sameVersion }))]);

    const outcome = mergeTaskFile(local, remote, options);

    expect(outcome.clean).toBe(false);
    expect(outcome.text).toBe(local);
    expect(outcome.conflicts).toEqual([
      { id: "task-1", label: "Local title", fields: ["title"] },
    ]);
  });

  it("keeps unmanaged lines from both sides", () => {
    const local = dayText([entry(task())], ["A hand-written local note"]);
    const remote = dayText([entry(task())], ["A hand-written remote note"]);

    const outcome = mergeTaskFile(local, remote, options);

    expect(outcome.clean).toBe(true);
    expect(outcome.text).toContain("A hand-written local note");
    expect(outcome.text).toContain("A hand-written remote note");
  });

  it("does not duplicate a hand-written task that both sides share", () => {
    const text = [
      `# ${DAY}`,
      "",
      '<!-- daymark file {"updatedAt":"2026-10-22T09:00:00.000Z","deviceId":"device-a"} -->',
      "",
      "## Uncategorized · 未分类",
      "",
      "- [ ] 09:00 Buy milk",
      "",
    ].join("\n");

    const outcome = mergeTaskFile(text, text, options);

    expect(outcome.clean).toBe(true);
    expect(outcome.itemCount).toBe(1);
  });

  it("merges backlog files with a null date key", () => {
    const backlog = (value: Task) =>
      serializeMarkdown(null, [entry(value, null, null)], categories, [], {
        updatedAt: "2026-10-22T09:00:00.000Z",
        deviceId: "device-a",
      });
    const local = backlog(task({ id: "a", title: "Local backlog", startAt: null, endAt: null }));
    const remote = backlog(task({ id: "b", title: "Remote backlog", startAt: null, endAt: null }));

    const outcome = mergeTaskFile(local, remote, { ...options, dateKey: null });

    expect(outcome.clean).toBe(true);
    expect(taskIds(outcome.text)).toEqual(["a", "b"]);
  });
});

describe("mergeableDateKey", () => {
  it("recognises day files, the backlog and nothing else", () => {
    expect(mergeableDateKey("2026-10/2026-10-22.md")).toBe("2026-10-22");
    expect(mergeableDateKey("_backlog.md")).toBeNull();
    expect(mergeableDateKey("_settings.md")).toBeUndefined();
    expect(mergeableDateKey("_categories.md")).toBeUndefined();
    expect(mergeableDateKey("2026-10/2026-11-01.md")).toBeUndefined();
  });
});
