import { describe, expect, it } from "vitest";
import type { Task } from "../src/domain/types";
import {
  isTombstoneLine,
  isTombstoned,
  parseTombstone,
  tombstoneLine,
  tombstoneMap,
  tombstonesFromExtras,
  withoutTombstoned,
} from "../src/storage/tombstone";
import type { StoredTask } from "../src/storage/types";

const DAY = "2026-10-22";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Write report",
    notes: "",
    categoryId: null,
    status: "backlog",
    startAt: null,
    endAt: null,
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

function entry(value: Task, dateKey: string | null = DAY): StoredTask {
  return { task: value, completion: null, dateKey };
}

describe("tombstone markers", () => {
  it("round-trips through the line format", () => {
    const tombstone = { id: "task-1", deletedAt: `${DAY}T12:00:00.000Z`, deviceId: "device-a" };

    const line = tombstoneLine(tombstone);

    expect(isTombstoneLine(line)).toBe(true);
    expect(parseTombstone(line)).toEqual(tombstone);
  });

  it("ignores other comments and malformed markers", () => {
    expect(parseTombstone('<!-- daymark task {"id":"task-1"} -->')).toBeNull();
    expect(parseTombstone("<!-- daymark deleted not-json -->")).toBeNull();
    expect(parseTombstone('<!-- daymark deleted {"deletedAt":"x"} -->')).toBeNull();
    expect(isTombstoneLine("A hand-written note")).toBe(false);
  });

  it("collects only well-formed markers from a file's extras", () => {
    const first = tombstoneLine({
      id: "a",
      deletedAt: `${DAY}T10:00:00.000Z`,
      deviceId: "device-a",
    });
    const second = tombstoneLine({
      id: "b",
      deletedAt: `${DAY}T11:00:00.000Z`,
      deviceId: "device-a",
    });

    const found = tombstonesFromExtras([first, "A note", "<!-- daymark deleted nope -->", second]);

    expect(found.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("keeps the later deletion when two devices deleted the same task", () => {
    const map = tombstoneMap([
      { id: "task-1", deletedAt: `${DAY}T11:00:00.000Z`, deviceId: "device-b" },
      { id: "task-1", deletedAt: `${DAY}T12:00:00.000Z`, deviceId: "device-a" },
    ]);

    expect(map.get("task-1")).toEqual({
      id: "task-1",
      deletedAt: `${DAY}T12:00:00.000Z`,
      deviceId: "device-a",
    });
  });

  it("deletes a task unless an edit is newer than the deletion", () => {
    const map = tombstoneMap([
      { id: "task-1", deletedAt: `${DAY}T12:00:00.000Z`, deviceId: "device-a" },
    ]);

    expect(isTombstoned(`${DAY}T11:00:00.000Z`, map, "task-1")).toBe(true);
    expect(isTombstoned(`${DAY}T12:00:00.000Z`, map, "task-1")).toBe(true);
    expect(isTombstoned(`${DAY}T13:00:00.000Z`, map, "task-1")).toBe(false);
    expect(isTombstoned(`${DAY}T13:00:00.000Z`, map, "task-2")).toBe(false);
  });

  it("filters stored tasks by id", () => {
    const map = tombstoneMap([
      { id: "task-1", deletedAt: `${DAY}T12:00:00.000Z`, deviceId: "device-a" },
    ]);

    const kept = withoutTombstoned(
      [
        entry(task()),
        entry(task({ id: "task-2", updatedAt: `${DAY}T09:00:00.000Z` })),
        entry(task({ id: "task-1", updatedAt: `${DAY}T13:00:00.000Z`, rowVersion: 2 })),
      ],
      map,
    );

    expect(kept.map((item) => item.task.id)).toEqual(["task-2", "task-1"]);
  });

  it("returns the same list when there are no tombstones", () => {
    const tasks = [entry(task())];
    expect(withoutTombstoned(tasks, new Map())).toBe(tasks);
  });
});
