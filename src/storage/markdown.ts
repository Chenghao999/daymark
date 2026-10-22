import type { Category, Completion, Task } from "../domain/types";
import type { StoredTask } from "./types";

const FILE_META_RE = /^\s*<!--\s*daymark file\s+(\{.*\})\s*-->\s*$/;
const TASK_META_RE = /^\s*<!--\s*daymark task\s+(\{.*\})\s*-->\s*$/;
const CATEGORY_META_RE = /^\s*<!--\s*daymark\s+(\{.*\})\s*-->\s*$/;
const TASK_LINE_RE = /^- \[([ xX])\]\s+(.*)$/;
const NOTE_LINE_RE = /^\s*>\s?(.*)$/;
const SECTION_RE = /^##\s+(.+?)\s*$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?:\s*[–—-]\s*(\d{1,2}):(\d{2}))?\s+(.+)$/;

interface TaskMeta {
  id?: string;
  categoryId?: string | null;
  priority?: number;
  startAt?: string | null;
  endAt?: string | null;
  dueAt?: string | null;
  allDay?: boolean;
  createdAt?: string;
  updatedAt?: string;
  deviceId?: string;
  rowVersion?: number;
  source?: "local" | "caldav";
  externalUid?: string | null;
  completedAt?: string | null;
  completionId?: string | null;
}

interface FileMeta {
  updatedAt?: string;
  deviceId?: string;
}

interface PendingTask {
  checked: boolean;
  title: string;
  timeStart: string | null;
  timeEnd: string | null;
  notes: string[];
  meta: TaskMeta | null;
}

export interface ParsedMarkdown {
  tasks: StoredTask[];
  /** Lines Daymark does not understand, preserved on the next write. */
  extras: string[];
  updatedAt: string | null;
  deviceId: string | null;
}

export function parseCategoriesMarkdown(text: string): Category[] {
  const categories: Category[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("- ")) continue;
    const commentIndex = line.indexOf("<!--");
    const label = (commentIndex >= 0 ? line.slice(2, commentIndex) : line.slice(2)).trim();
    if (!label) continue;
    const meta = readJson<{ id?: string; color?: string; sortOrder?: number; archived?: boolean }>(
      commentIndex >= 0 ? line.slice(commentIndex) : "",
      CATEGORY_META_RE,
    );
    const slash = label.indexOf(" / ");
    const nameEn = (slash >= 0 ? label.slice(0, slash) : label).trim();
    const nameZh = (slash >= 0 ? label.slice(slash + 3) : label).trim();
    if (!nameEn && !nameZh) continue;
    categories.push({
      id: meta?.id ?? crypto.randomUUID(),
      nameEn: nameEn || nameZh,
      nameZh: nameZh || nameEn,
      color: /^#[0-9a-fA-F]{6}$/.test(meta?.color ?? "") ? (meta?.color as string) : "#6b7cff",
      sortOrder: typeof meta?.sortOrder === "number" ? meta.sortOrder : categories.length,
      archived: meta?.archived === true,
    });
  }
  return categories;
}

export function serializeCategoriesMarkdown(categories: Category[]): string {
  const lines = [
    "# Categories · 分类",
    "",
    "<!-- Daymark reads the JSON metadata on each line. Names, colours and order may be edited by hand. -->",
    "",
  ];
  for (const category of [...categories].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const meta = {
      id: category.id,
      color: category.color,
      sortOrder: category.sortOrder,
      archived: category.archived,
    };
    lines.push(
      `- ${category.nameEn} / ${category.nameZh} <!-- daymark ${JSON.stringify(meta)} -->`,
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function parseMarkdown(
  text: string,
  dateKey: string | null,
  categories: Category[],
): ParsedMarkdown {
  const tasks: StoredTask[] = [];
  const extras: string[] = [];
  let fileMeta: FileMeta = {};
  let currentSection: string | null = null;
  let pending: PendingTask | null = null;
  const headingToCategory = buildHeadingMap(categories);

  const finalize = () => {
    if (!pending) return;
    if (pending.meta === null && !pending.checked && !pending.title.trim()) {
      pending = null;
      return;
    }
    tasks.push(toStoredTask(pending, dateKey, currentSection, headingToCategory, fileMeta));
    pending = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");

    const fileMetaMatch = FILE_META_RE.exec(line);
    if (fileMetaMatch) {
      fileMeta = parseJson<FileMeta>(fileMetaMatch[1]) ?? fileMeta;
      continue;
    }

    const taskMatch = TASK_LINE_RE.exec(line);
    if (taskMatch) {
      finalize();
      pending = createPending(taskMatch[1].toLowerCase() === "x", taskMatch[2], dateKey);
      continue;
    }

    const taskMetaMatch = TASK_META_RE.exec(line);
    if (taskMetaMatch) {
      if (pending) {
        pending.meta = parseJson<TaskMeta>(taskMetaMatch[1]);
        finalize();
      }
      continue;
    }

    if (pending) {
      const noteMatch = NOTE_LINE_RE.exec(line);
      if (noteMatch) {
        pending.notes.push(noteMatch[1]);
        continue;
      }
    }

    const sectionMatch = SECTION_RE.exec(line);
    if (sectionMatch) {
      finalize();
      currentSection = sectionMatch[1].trim();
      continue;
    }

    if (/^#\s+/.test(line) && !/^##/.test(line)) {
      // Regenerated file title; not user content.
      continue;
    }

    if (!line.trim()) continue;

    finalize();
    extras.push(line);
  }

  finalize();
  return {
    tasks,
    extras,
    updatedAt: fileMeta.updatedAt ?? null,
    deviceId: fileMeta.deviceId ?? null,
  };
}

export function serializeMarkdown(
  dateKey: string | null,
  entries: StoredTask[],
  categories: Category[],
  extras: string[],
  meta: { updatedAt: string; deviceId: string },
): string {
  const lines = [
    dateKey ? `# ${dateKey}` : "# Backlog · 待办",
    "",
    `<!-- daymark file ${JSON.stringify({ updatedAt: meta.updatedAt, deviceId: meta.deviceId })} -->`,
    "",
  ];

  const groups = groupByCategory(entries, categories);
  for (const group of groups) {
    lines.push(`## ${group.heading}`, "");
    for (const entry of group.entries) {
      lines.push(...serializeEntry(entry), "");
    }
  }

  if (extras.length > 0) {
    lines.push(...extras, "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function createPending(checked: boolean, rest: string, dateKey: string | null): PendingTask {
  let title = rest.trim();
  let timeStart: string | null = null;
  let timeEnd: string | null = null;
  if (dateKey) {
    const timeMatch = TIME_RE.exec(title);
    if (timeMatch) {
      const startHour = Number(timeMatch[1]);
      const startMinute = Number(timeMatch[2]);
      const endHour = timeMatch[3] === undefined ? null : Number(timeMatch[3]);
      const endMinute = timeMatch[4] === undefined ? null : Number(timeMatch[4]);
      if (
        startHour < 24 &&
        startMinute < 60 &&
        (endHour === null || (endHour < 24 && (endMinute ?? 0) < 60))
      ) {
        timeStart = `${pad(startHour)}:${pad(startMinute)}`;
        if (endHour !== null && endMinute !== null) {
          timeEnd = `${pad(endHour)}:${pad(endMinute)}`;
        }
        title = timeMatch[5].trim();
      }
    }
  }
  return { checked, title, timeStart, timeEnd, notes: [], meta: null };
}

function toStoredTask(
  pending: PendingTask,
  dateKey: string | null,
  section: string | null,
  headingToCategory: Map<string, string>,
  fileMeta: FileMeta,
): StoredTask {
  const meta = pending.meta;
  const id = meta?.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const updatedAt = meta?.updatedAt ?? fileMeta.updatedAt ?? now;
  const deviceId = meta?.deviceId ?? fileMeta.deviceId ?? "unknown-device";

  let startAt: string | null;
  let endAt: string | null;
  if (pending.timeStart && dateKey) {
    startAt = `${dateKey}T${pending.timeStart}`;
    if (pending.timeEnd) {
      endAt = `${dateKey}T${pending.timeEnd}`;
    } else if (meta?.endAt && meta.endAt.slice(0, 10) !== dateKey) {
      endAt = meta.endAt;
    } else {
      endAt = null;
    }
  } else if (meta) {
    startAt = meta.startAt ?? null;
    endAt = meta.endAt ?? null;
  } else {
    startAt = dateKey;
    endAt = null;
  }

  const dueAt = meta?.dueAt ?? null;
  const categoryId =
    meta && "categoryId" in meta
      ? (meta.categoryId ?? null)
      : section
        ? (headingToCategory.get(section) ?? null)
        : null;

  let completion: Completion | null = null;
  if (meta?.completedAt) {
    completion = {
      id: meta.completionId ?? crypto.randomUUID(),
      taskId: id,
      completedAt: meta.completedAt,
      deviceId: meta.deviceId ?? deviceId,
    };
  } else if (pending.checked) {
    const completedAt = dateKey
      ? new Date(`${dateKey}T12:00:00`).toISOString()
      : new Date().toISOString();
    completion = {
      id: crypto.randomUUID(),
      taskId: id,
      completedAt,
      deviceId,
    };
  }

  const task: Task = {
    id,
    title: pending.title.trim() || "Untitled",
    notes: pending.notes.join("\n"),
    categoryId,
    status: completion ? "done" : startAt || dueAt ? "scheduled" : "backlog",
    startAt,
    endAt,
    dueAt,
    priority: typeof meta?.priority === "number" ? meta.priority : 0,
    allDay: meta?.allDay ?? (startAt !== null && startAt.length === 10),
    createdAt: meta?.createdAt ?? updatedAt,
    updatedAt,
    deviceId,
    rowVersion: typeof meta?.rowVersion === "number" ? meta.rowVersion : 1,
    deleted: false,
    source: meta?.source === "caldav" ? "caldav" : "local",
    externalUid: meta?.externalUid ?? null,
  };

  return { task, completion, dateKey };
}

function serializeEntry(entry: StoredTask): string[] {
  const { task, completion } = entry;
  const box = completion ? "x" : " ";
  const time = timeLabel(task);
  const title = task.title.replace(/\s*\n+\s*/g, " ");
  const lines = [`- [${box}] ${time ? `${time} ` : ""}${title}`];

  if (task.notes) {
    for (const note of task.notes.split("\n")) {
      lines.push(note ? `  > ${note}` : "  >");
    }
  }

  const meta = {
    id: task.id,
    categoryId: task.categoryId,
    priority: task.priority,
    startAt: task.startAt,
    endAt: task.endAt,
    dueAt: task.dueAt,
    allDay: task.allDay,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deviceId: task.deviceId,
    rowVersion: task.rowVersion,
    source: task.source,
    externalUid: task.externalUid,
    completedAt: completion?.completedAt ?? null,
    completionId: completion?.id ?? null,
  };
  lines.push(`  <!-- daymark task ${JSON.stringify(meta)} -->`);
  return lines;
}

function timeLabel(task: Task): string | null {
  if (!task.startAt || task.startAt.length <= 10) return null;
  const start = task.startAt.slice(11, 16);
  if (
    task.endAt &&
    task.endAt.length > 10 &&
    task.endAt.slice(0, 10) === task.startAt.slice(0, 10)
  ) {
    return `${start}–${task.endAt.slice(11, 16)}`;
  }
  return start;
}

function groupByCategory(
  entries: StoredTask[],
  categories: Category[],
): Array<{ heading: string; entries: StoredTask[] }> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const groups = new Map<string | null, StoredTask[]>();
  for (const entry of entries) {
    const key = entry.task.categoryId ?? null;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  const ordered = [...groups.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    const ca = byId.get(a);
    const cb = byId.get(b);
    if (!ca) return cb ? 1 : a.localeCompare(b);
    if (!cb) return -1;
    return ca.sortOrder - cb.sortOrder;
  });

  return ordered.map((key) => ({
    heading: key === null ? UNCATEGORIZED_HEADING : headingFor(byId.get(key)),
    entries: (groups.get(key) ?? []).sort(compareEntries),
  }));
}

function compareEntries(a: StoredTask, b: StoredTask): number {
  const aKey = a.task.startAt ?? a.task.dueAt ?? "";
  const bKey = b.task.startAt ?? b.task.dueAt ?? "";
  if (aKey !== bKey) return aKey.localeCompare(bKey);
  if (a.task.priority !== b.task.priority) return b.task.priority - a.task.priority;
  return a.task.createdAt.localeCompare(b.task.createdAt);
}

const UNCATEGORIZED_HEADING = "Uncategorized · 未分类";

function headingFor(category: Category | undefined): string {
  return category ? `${category.nameEn} · ${category.nameZh}` : UNCATEGORIZED_HEADING;
}

function buildHeadingMap(categories: Category[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const category of categories) {
    map.set(`${category.nameEn} · ${category.nameZh}`, category.id);
    map.set(category.nameEn, category.id);
    map.set(category.nameZh, category.id);
  }
  return map;
}

function readJson<T>(line: string, pattern: RegExp): T | null {
  const match = pattern.exec(line);
  return match ? parseJson<T>(match[1]) : null;
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
