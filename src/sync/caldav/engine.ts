import { applyExternalImport, listCategories, listTasks } from "../../storage/repository";
import { CalDavClient } from "./client";
import { planCalendarImport } from "./import";
import { parseCalendarData } from "./ics";
import type { CalDavSettings, CalDavState, CalDavSyncResult } from "./types";

export interface CalDavSyncOptions {
  /** In-memory client for tests; otherwise one is built from the config. */
  client?: Pick<CalDavClient, "ctag" | "events">;
  /** Injectable clock for the recurrence window. */
  now?: Date;
  onProgress?: (done: number, total: number, calendar: string) => void;
}

/**
 * Manual, read-only import of every selected calendar.
 *
 * The cursor is `getctag`: when it matches the previous run the calendar is
 * skipped entirely. Servers without it fall back to a full REPORT. Each
 * calendar is independent — one failing account or calendar is reported and
 * the others still import. Nothing is ever written back to the server.
 */
export async function syncCalDav(
  settings: CalDavSettings,
  options: CalDavSyncOptions = {},
): Promise<CalDavSyncResult> {
  const now = options.now ?? new Date();
  const client = options.client ?? new CalDavClient(settings.config);
  const calendars = settings.config.calendars;
  const nextState: CalDavState = { calendars: { ...settings.state.calendars } };
  const result: CalDavSyncResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
    calendars: calendars.length,
    errors: [],
    nextState,
  };

  for (const [index, calendar] of calendars.entries()) {
    options.onProgress?.(index, calendars.length, calendar.name);
    const previous = settings.state.calendars[calendar.href];
    try {
      const ctag = await client.ctag(calendar.href);
      if (ctag !== null && previous && previous.ctag === ctag) {
        nextState.calendars[calendar.href] = { ...previous, syncedAt: now.toISOString() };
        continue;
      }

      const objects = await client.events(calendar.href);
      const events = objects.flatMap((object) => parseCalendarData(object.data, { now }));
      const [tasks, categories] = await Promise.all([listTasks(), listCategories(true)]);
      const plan = planCalendarImport({
        events,
        tasks,
        categories,
        previousUids: previous?.uids ?? [],
        previousKeys: previous?.keys ?? [],
        ignoredUids: settings.ignoredUids,
      });
      await applyExternalImport(plan);

      result.created += plan.creates.length;
      result.updated += plan.updates.length;
      result.deleted += plan.deletes.length;
      result.unchanged += plan.unchanged;
      nextState.calendars[calendar.href] = {
        ctag: ctag ?? null,
        uids: [...new Set(events.filter((event) => !event.cancelled).map((event) => event.uid))],
        keys: [...new Set(events.filter((event) => !event.cancelled).map((event) => event.key))],
        syncedAt: now.toISOString(),
      };
    } catch (cause) {
      result.errors.push(`${calendar.name}: ${message(cause)}`);
    }
  }

  options.onProgress?.(calendars.length, calendars.length, "");
  return result;
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
