import { describe, expect, it } from "vitest";
import type { Category, Task } from "../src/domain/types";
import { planCalendarImport, seriesUidOf } from "../src/sync/caldav/import";
import type { CalDavEvent } from "../src/sync/caldav/types";

const categories: Category[] = [
  {
    id: "cat-work",
    nameEn: "Work",
    nameZh: "工作",
    color: "#5b8def",
    sortOrder: 0,
    archived: false,
  },
];

function task(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    title: "Event",
    notes: "",
    categoryId: null,
    status: "scheduled",
    startAt: "2026-11-02T09:00",
    endAt: "2026-11-02T10:00",
    dueAt: null,
    priority: 0,
    allDay: false,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    deviceId: "device",
    rowVersion: 1,
    deleted: false,
    source: "caldav",
    externalUid: "event-1",
    ...overrides,
  };
}

function event(overrides: Partial<CalDavEvent>): CalDavEvent {
  return {
    uid: "event-1",
    key: "event-1",
    title: "Event",
    notes: "",
    categories: [],
    startAt: "2026-11-02T09:00",
    endAt: "2026-11-02T10:00",
    allDay: false,
    cancelled: false,
    ...overrides,
  };
}

describe("calendar import planning", () => {
  it("creates a task and matches a category by its Chinese name", () => {
    const plan = planCalendarImport({
      events: [event({ categories: ["工作"] })],
      tasks: [],
      categories,
      previousUids: [],
    });
    expect(plan.creates).toEqual([
      {
        externalUid: "event-1",
        title: "Event",
        notes: "",
        categoryId: "cat-work",
        startAt: "2026-11-02T09:00",
        endAt: "2026-11-02T10:00",
        allDay: false,
      },
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.unchanged).toBe(0);
  });

  it("updates a changed event and keeps its id", () => {
    const plan = planCalendarImport({
      events: [event({ title: "Renamed", startAt: "2026-11-02T11:00" })],
      tasks: [task({ id: "keep-me" })],
      categories,
      previousUids: ["event-1"],
    });
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({ id: "keep-me", title: "Renamed" });
    expect(plan.creates).toEqual([]);
  });

  it("counts an identical event as unchanged", () => {
    const plan = planCalendarImport({
      events: [event()],
      tasks: [task({})],
      categories,
      previousUids: ["event-1"],
    });
    expect(plan.unchanged).toBe(1);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
  });

  it("deletes tasks whose series disappeared from the server", () => {
    const plan = planCalendarImport({
      events: [],
      tasks: [task({ id: "gone-1", externalUid: "gone" })],
      categories,
      previousUids: ["gone"],
    });
    expect(plan.deletes).toEqual(["gone-1"]);
  });

  it("keeps older occurrences while their series still exists", () => {
    const plan = planCalendarImport({
      events: [event({ uid: "weekly", key: "weekly#occ=2026-11-02T09:00" })],
      tasks: [
        task({ id: "old", externalUid: "weekly#occ=2026-10-26T09:00" }),
        task({ id: "current", externalUid: "weekly#occ=2026-11-02T09:00" }),
      ],
      categories,
      previousUids: ["weekly"],
    });
    expect(plan.deletes).toEqual([]);
    expect(plan.creates).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("deletes every occurrence when a recurring series is removed", () => {
    const plan = planCalendarImport({
      events: [],
      tasks: [
        task({ id: "a", externalUid: "weekly#occ=2026-10-26T09:00" }),
        task({ id: "b", externalUid: "weekly#occ=2026-11-02T09:00" }),
      ],
      categories,
      previousUids: ["weekly"],
    });
    expect(plan.deletes.sort()).toEqual(["a", "b"]);
  });

  it("deletes the series of a cancelled event", () => {
    const plan = planCalendarImport({
      events: [event({ cancelled: true })],
      tasks: [task({ id: "cancelled-task" })],
      categories,
      previousUids: ["event-1"],
    });
    expect(plan.deletes).toEqual(["cancelled-task"]);
    expect(plan.creates).toEqual([]);
  });

  it("deletes only the cancelled occurrence of a recurring series", () => {
    const plan = planCalendarImport({
      events: [
        event({ key: "weekly#occ=2026-11-02T09:00", startAt: "2026-11-02T09:00" }),
        event({
          key: "weekly#occ=2026-11-09T09:00",
          startAt: "2026-11-09T09:00",
          cancelled: true,
        }),
      ],
      tasks: [
        task({ id: "keep", externalUid: "weekly#occ=2026-11-02T09:00" }),
        task({
          id: "remove",
          externalUid: "weekly#occ=2026-11-09T09:00",
          startAt: "2026-11-09T09:00",
        }),
      ],
      categories,
      previousUids: ["event-1"],
      previousKeys: ["weekly#occ=2026-11-02T09:00", "weekly#occ=2026-11-09T09:00"],
    });
    expect(plan.deletes).toEqual(["remove"]);
  });

  it("deletes an occurrence that disappeared from the listing", () => {
    const plan = planCalendarImport({
      events: [
        event({ key: "weekly#occ=2026-11-02T09:00", startAt: "2026-11-02T09:00" }),
      ],
      tasks: [
        task({ id: "keep", externalUid: "weekly#occ=2026-11-02T09:00" }),
        task({
          id: "excluded",
          externalUid: "weekly#occ=2026-11-09T09:00",
          startAt: "2026-11-09T09:00",
        }),
      ],
      categories,
      previousUids: ["event-1"],
      previousKeys: ["weekly#occ=2026-11-02T09:00", "weekly#occ=2026-11-09T09:00"],
    });
    expect(plan.deletes).toEqual(["excluded"]);
  });

  it("keeps an occurrence task when the listing has no previous-key cursor", () => {
    const plan = planCalendarImport({
      events: [
        event({ key: "weekly#occ=2026-11-02T09:00", startAt: "2026-11-02T09:00" }),
      ],
      tasks: [
        task({ id: "keep", externalUid: "weekly#occ=2026-11-02T09:00" }),
        task({
          id: "older",
          externalUid: "weekly#occ=2026-10-26T09:00",
          startAt: "2026-10-26T09:00",
        }),
      ],
      categories,
      previousUids: ["event-1"],
    });
    expect(plan.deletes).toEqual([]);
  });

  it("never re-imports an ignored (detached) series", () => {
    const plan = planCalendarImport({
      events: [event()],
      tasks: [],
      categories,
      previousUids: ["event-1"],
      ignoredUids: ["event-1"],
    });
    expect(plan.creates).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it("does not treat a detached local task as imported", () => {
    const plan = planCalendarImport({
      events: [event()],
      tasks: [
        task({
          id: "detached",
          source: "local",
          externalUid: null,
          title: "Edited locally",
        }),
      ],
      categories,
      previousUids: ["event-1"],
      ignoredUids: ["event-1"],
    });
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it("extracts the series UID from an occurrence key", () => {
    expect(seriesUidOf("abc")).toBe("abc");
    expect(seriesUidOf("abc#occ=2026-11-02T09:00")).toBe("abc");
    expect(seriesUidOf(null)).toBeNull();
  });
});
