import type { Task, TaskStatus } from "./types";

export interface NewTaskInput {
  title: string;
  notes?: string;
  categoryId?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  dueAt?: string | null;
  priority?: number;
  allDay?: boolean;
}

export function hasSchedule(task: Pick<Task, "startAt" | "dueAt">): boolean {
  return Boolean(task.startAt || task.dueAt);
}

/**
 * The state machine has one invariant: a task with no date cannot be
 * `scheduled`, and a completed task keeps its dates so reports can still
 * attribute it to a period.
 */
export function normalizeStatus(task: Task): TaskStatus {
  if (task.status === "done") return "done";
  return hasSchedule(task) ? "scheduled" : "backlog";
}

export function scheduleTask(task: Task, startAt: string, endAt: string | null): Task {
  return normalize({
    ...task,
    startAt,
    endAt,
    status: "scheduled",
    updatedAt: nowIso(),
    rowVersion: task.rowVersion + 1,
  });
}

export function unscheduleTask(task: Task): Task {
  return normalize({
    ...task,
    startAt: null,
    endAt: null,
    dueAt: null,
    status: "backlog",
    updatedAt: nowIso(),
    rowVersion: task.rowVersion + 1,
  });
}

export function completeTask(task: Task, completedAt = nowIso()): Task {
  return normalize({
    ...task,
    status: "done",
    updatedAt: completedAt,
    rowVersion: task.rowVersion + 1,
  });
}

export function reopenTask(task: Task): Task {
  return normalize({
    ...task,
    status: hasSchedule(task) ? "scheduled" : "backlog",
    updatedAt: nowIso(),
    rowVersion: task.rowVersion + 1,
  });
}

function normalize(task: Task): Task {
  return { ...task, status: normalizeStatus(task) };
}

function nowIso(): string {
  return new Date().toISOString();
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (b.status === "done" && a.status !== "done") return -1;
    const aKey = a.startAt ?? a.dueAt ?? "";
    const bKey = b.startAt ?? b.dueAt ?? "";
    if (aKey !== bKey) return aKey.localeCompare(bKey);
    return b.priority - a.priority;
  });
}
