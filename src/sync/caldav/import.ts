import type { Category, Task } from "../../domain/types";
import type { ExternalImportPlan, ExternalTaskDraft } from "../../storage/types";
import type { CalDavEvent } from "./types";

export interface CalendarImportInput {
  /** Expanded occurrences from one calendar listing. */
  events: CalDavEvent[];
  /** Every task currently in the store. */
  tasks: Task[];
  categories: Category[];
  /** UIDs seen in this calendar at the previous sync. */
  previousUids: string[];
  /** Series the user detached; they must not be re-imported. */
  ignoredUids?: string[];
}

/** `uid#occ=…` → `uid`; single events have no suffix. */
export function seriesUidOf(externalUid: string | null): string | null {
  if (!externalUid) return null;
  return externalUid.split("#occ=")[0];
}

/**
 * Compares a calendar listing with the local tasks.
 *
 * Imported tasks are authoritative copies of the remote events, so a changed
 * event produces an update and an event that disappeared produces a delete.
 * Detached events are local tasks with no `externalUid`; their series UID is
 * in `ignoredUids`, so the next sync neither recreates nor removes them.
 */
export function planCalendarImport(input: CalendarImportInput): ExternalImportPlan {
  const ignored = new Set(input.ignoredUids ?? []);
  const categories = input.categories;
  const existing = new Map<string, Task>();
  for (const task of input.tasks) {
    if (task.source === "caldav" && task.externalUid) existing.set(task.externalUid, task);
  }

  const currentUids = new Set(
    input.events.filter((event) => !event.cancelled).map((event) => event.uid),
  );
  const removedUids = new Set(
    input.previousUids.filter((uid) => !currentUids.has(uid)),
  );
  for (const event of input.events) {
    if (event.cancelled) removedUids.add(event.uid);
  }

  const creates: ExternalTaskDraft[] = [];
  const updates: Array<ExternalTaskDraft & { id: string }> = [];
  const deletes: string[] = [];
  const deleted = new Set<string>();
  let unchanged = 0;
  const handled = new Set<string>();

  for (const event of input.events) {
    if (event.cancelled || ignored.has(event.uid) || handled.has(event.key)) continue;
    handled.add(event.key);
    const draft: ExternalTaskDraft = {
      externalUid: event.key,
      title: event.title,
      notes: event.notes,
      categoryId: matchCategory(categories, event.categories),
      startAt: event.startAt,
      endAt: event.endAt,
      allDay: event.allDay,
    };
    const task = existing.get(event.key);
    if (!task) {
      creates.push(draft);
    } else if (differs(task, draft)) {
      updates.push({ ...draft, id: task.id });
    } else {
      unchanged += 1;
    }
  }

  for (const task of input.tasks) {
    if (task.source !== "caldav" || deleted.has(task.id)) continue;
    const series = seriesUidOf(task.externalUid);
    if (!series || ignored.has(series)) continue;
    if (removedUids.has(series)) {
      deletes.push(task.id);
      deleted.add(task.id);
    }
  }

  return { creates, updates, deletes, unchanged };
}

function matchCategory(categories: Category[], names: string[]): string | null {
  for (const name of names) {
    const target = name.trim().toLowerCase();
    if (!target) continue;
    const match = categories.find(
      (category) =>
        category.nameEn.trim().toLowerCase() === target ||
        category.nameZh.trim().toLowerCase() === target,
    );
    if (match) return match.id;
  }
  return null;
}

function differs(task: Task, draft: ExternalTaskDraft): boolean {
  return (
    task.title !== draft.title ||
    task.notes !== draft.notes ||
    task.categoryId !== draft.categoryId ||
    task.startAt !== draft.startAt ||
    (task.endAt ?? null) !== draft.endAt ||
    task.allDay !== draft.allDay
  );
}
