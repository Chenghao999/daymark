import { describe, expect, it } from "vitest";
import type { Category, Task } from "../src/domain/types";
import { DEFAULT_SETTINGS } from "../src/settings/store";
import { parseMarkdown, serializeMarkdown } from "../src/storage/markdown";
import {
  parseSettingsMarkdown,
  serializeSettingsMarkdown,
} from "../src/storage/settingsFile";
import { tombstoneLine } from "../src/storage/tombstone";
import type { StoredTask } from "../src/storage/types";
import { WebDavError } from "../src/sync/webdav/client";
import { syncWebDav } from "../src/sync/webdav/engine";
import { resolveConflict } from "../src/sync/webdav/resolve";
import type {
  Baseline,
  BaselineStore,
  RemoteClient,
  RemoteEntry,
  SyncIo,
  WebDavConfig,
} from "../src/sync/webdav/types";

const DAY = "2026-10-22";
const DAY_PATH = "2026-10/2026-10-22.md";
const ROOT = "/memory/daymark";
const SETTINGS_PATH = "_settings.md";
const BACKLOG_PATH = "_backlog.md";
const DEVICE = "device-a";

const config: WebDavConfig = {
  url: "https://dav.example.com/dav",
  remotePath: "daymark/",
  username: "user",
  password: "secret",
};

const categories: Category[] = [];

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Write report",
    notes: "",
    categoryId: null,
    status: "scheduled",
    startAt: `${DAY}T09:00`,
    endAt: `${DAY}T10:00`,
    dueAt: null,
    priority: 0,
    allDay: false,
    createdAt: `${DAY}T08:00:00.000Z`,
    updatedAt: `${DAY}T08:00:00.000Z`,
    deviceId: DEVICE,
    rowVersion: 1,
    deleted: false,
    source: "local",
    externalUid: null,
    ...overrides,
  };
}

function entry(value: Task): StoredTask {
  return { task: value, completion: null, dateKey: DAY };
}

function dayText(entries: StoredTask[], extras: string[] = []): string {
  return serializeMarkdown(DAY, entries, categories, extras, {
    updatedAt: "2026-10-29T00:00:00.000Z",
    deviceId: DEVICE,
  });
}

/** In-memory replacement for the Tauri file commands. */
class MemoryFolder implements SyncIo {
  readonly files = new Map<string, string>();

  async listDir(path: string): Promise<{ name: string; isDirectory: boolean }[]> {
    const prefix = `${path.replace(/\/+$/, "")}/`;
    const children = new Map<string, boolean>();
    for (const file of this.files.keys()) {
      if (!file.startsWith(prefix)) continue;
      const rest = file.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash < 0) children.set(rest, false);
      else children.set(rest.slice(0, slash), true);
    }
    return [...children].map(([name, isDirectory]) => ({ name, isDirectory }));
  }

  async readTextFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async writeTextFile(path: string, text: string): Promise<void> {
    this.files.set(path, text);
  }

  async pathExists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  read(relative: string): string {
    const text = this.files.get(`${ROOT}/${relative}`);
    if (text === undefined) throw new Error(`missing local file ${relative}`);
    return text;
  }

  write(relative: string, text: string): void {
    this.files.set(`${ROOT}/${relative}`, text);
  }
}

/** In-memory WebDAV server: one flat folder, PUT/MKCOL recorded. */
class MemoryRemote implements RemoteClient {
  readonly files = new Map<string, string>();
  readonly puts: string[] = [];
  rootExists = false;
  /** Path whose GET throws, to exercise the abort-before-write path. */
  failRead: string | null = null;

  async listTree(): Promise<RemoteEntry[]> {
    if (!this.rootExists) throw new WebDavError(404, "remote root missing");
    return [...this.files.keys()].map((path) => ({
      path,
      isDirectory: false,
      size: null,
      etag: null,
      lastModified: null,
    }));
  }

  async getText(path: string): Promise<string> {
    if (path === this.failRead) throw new WebDavError(500, `cannot read ${path}`);
    const text = this.files.get(path);
    if (text === undefined) throw new WebDavError(404, `missing ${path}`);
    return text;
  }

  async putText(path: string, contents: string): Promise<void> {
    this.files.set(path, contents);
    this.puts.push(path);
  }

  async mkcol(): Promise<void> {
    this.rootExists = true;
  }

  read(path: string): string {
    const text = this.files.get(path);
    if (text === undefined) throw new Error(`missing remote file ${path}`);
    return text;
  }
}

class MemoryBaseline implements BaselineStore {
  value: Baseline = {};

  load(): Baseline {
    return this.value;
  }

  save(baseline: Baseline): void {
    this.value = baseline;
  }
}

interface World {
  folder: MemoryFolder;
  remote: MemoryRemote;
  baseline: MemoryBaseline;
}

function world(): World {
  return { folder: new MemoryFolder(), remote: new MemoryRemote(), baseline: new MemoryBaseline() };
}

const now = new Date(2026, 9, 29, 12, 0, 0);

function sync(target: World) {
  return syncWebDav(config, ROOT, {
    client: target.remote,
    io: target.folder,
    baseline: target.baseline,
    device: DEVICE,
    now,
  });
}

function taskIds(text: string): string[] {
  return parseMarkdown(text, DAY, categories)
    .tasks.map((stored) => stored.task.id)
    .sort();
}

describe("WebDAV sync engine", () => {
  it("uploads everything on the first sync and records the baseline", async () => {
    const target = world();
    target.folder.write(
      BACKLOG_PATH,
      serializeMarkdown(null, [], categories, [], {
        updatedAt: "2026-10-29T00:00:00.000Z",
        deviceId: DEVICE,
      }),
    );
    target.folder.write(DAY_PATH, dayText([entry(task())]));
    target.remote.rootExists = false;

    const result = await sync(target);

    expect(result.errors).toEqual([]);
    expect(result.uploaded).toBe(2);
    expect(result.downloaded).toBe(0);
    expect(result.merged).toBe(0);
    expect(result.conflicts).toEqual([]);
    expect(target.remote.puts.sort()).toEqual([BACKLOG_PATH, DAY_PATH].sort());
    expect(target.baseline.value[DAY_PATH].local).toBe(target.baseline.value[DAY_PATH].remote);
  });

  it("downloads a file that only changed on the remote", async () => {
    const target = world();
    target.folder.write(DAY_PATH, dayText([entry(task())]));
    await sync(target);

    const updated = dayText([entry(task({ title: "Remote edit", rowVersion: 2 }))]);
    target.remote.files.set(DAY_PATH, updated);
    target.remote.puts.length = 0;

    const result = await sync(target);

    expect(result.downloaded).toBe(1);
    expect(result.uploaded).toBe(0);
    expect(target.folder.read(DAY_PATH)).toBe(updated);
    expect(target.remote.puts).toEqual([]);
  });

  it("merges different tasks added on both sides and uploads the result", async () => {
    const target = world();
    target.folder.write(DAY_PATH, dayText([entry(task())]));
    await sync(target);

    target.folder.write(
      DAY_PATH,
      dayText([entry(task()), entry(task({ id: "local-add", title: "Local task" }))]),
    );
    target.remote.files.set(
      DAY_PATH,
      dayText([entry(task()), entry(task({ id: "remote-add", title: "Remote task" }))]),
    );
    target.remote.puts.length = 0;

    const result = await sync(target);

    expect(result.merged).toBe(1);
    expect(result.conflicts).toEqual([]);
    expect(taskIds(target.folder.read(DAY_PATH))).toEqual(["local-add", "remote-add", "task-1"]);
    expect(target.remote.read(DAY_PATH)).toBe(target.folder.read(DAY_PATH));
    expect(target.baseline.value[DAY_PATH].local).toBe(target.baseline.value[DAY_PATH].remote);
  });

  it("keeps a same-version tie as a conflict copy and resolves it on request", async () => {
    const target = world();
    target.folder.write(DAY_PATH, dayText([entry(task())]));
    await sync(target);

    const sameVersion = { rowVersion: 2, updatedAt: `${DAY}T10:00:00.000Z` };
    const localText = dayText([entry(task({ title: "Local title", ...sameVersion }))]);
    const remoteText = dayText([entry(task({ title: "Remote title", ...sameVersion }))]);
    target.folder.write(DAY_PATH, localText);
    target.remote.files.set(DAY_PATH, remoteText);

    const result = await sync(target);

    expect(result.merged).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    const [conflict] = result.conflicts;
    expect(conflict.path).toBe(DAY_PATH);
    expect(conflict.kind).toBe("tasks");
    expect(conflict.copy).toBe(`2026-10/2026-10-22 (conflict ${DEVICE} 20261029-120000).md`);
    expect(result.conflicts[0].items).toHaveLength(1);
    expect(target.folder.read(conflict.copy as string)).toBe(remoteText);
    // The local canonical file is untouched and the remote is not overwritten.
    expect(target.folder.read(DAY_PATH)).toBe(localText);
    expect(target.remote.read(DAY_PATH)).toBe(remoteText);

    const resolved = await resolveConflict(
      config,
      ROOT,
      conflict,
      { "task-1": "remote" },
      { client: target.remote, io: target.folder, baseline: target.baseline, device: DEVICE, now },
    );

    expect(resolved).toEqual({ resolved: true, remaining: [], written: true });
    expect(target.folder.read(DAY_PATH)).toContain("Remote title");
    expect(target.remote.read(DAY_PATH)).toBe(target.folder.read(DAY_PATH));
    expect(target.baseline.value[DAY_PATH].local).toBe(target.baseline.value[DAY_PATH].remote);
  });

  it("leaves the answers open when a decision is still missing", async () => {
    const target = world();
    target.folder.write(DAY_PATH, dayText([entry(task())]));
    await sync(target);
    const sameVersion = { rowVersion: 2, updatedAt: `${DAY}T10:00:00.000Z` };
    target.folder.write(
      DAY_PATH,
      dayText([entry(task({ title: "Local title", ...sameVersion }))]),
    );
    target.remote.files.set(
      DAY_PATH,
      dayText([entry(task({ title: "Remote title", ...sameVersion }))]),
    );
    const result = await sync(target);

    const resolved = await resolveConflict(
      config,
      ROOT,
      result.conflicts[0],
      {},
      { client: target.remote, io: target.folder, baseline: target.baseline, device: DEVICE, now },
    );

    expect(resolved.resolved).toBe(false);
    expect(resolved.written).toBe(false);
    expect(resolved.remaining).toHaveLength(1);
    expect(target.folder.read(DAY_PATH)).toContain("Local title");
  });

  it("merges settings changed on different keys against the last synced text", async () => {
    const target = world();
    const base = { ...DEFAULT_SETTINGS, language: "en" as const, weekStartsOn: 1 as const };
    target.folder.write(SETTINGS_PATH, serializeSettingsMarkdown(base));
    await sync(target);

    target.folder.write(
      SETTINGS_PATH,
      serializeSettingsMarkdown({ ...base, weekStartsOn: 0 as const }),
    );
    target.remote.files.set(
      SETTINGS_PATH,
      serializeSettingsMarkdown({ ...base, numbering: "arabic" as const }),
    );

    const result = await sync(target);

    expect(result.merged).toBe(1);
    expect(result.conflicts).toEqual([]);
    expect(parseSettingsMarkdown(target.folder.read(SETTINGS_PATH))).toMatchObject({
      weekStartsOn: 0,
      numbering: "arabic",
    });
  });

  it("applies a deletion marker to a task only present on the other side", async () => {
    const target = world();
    target.folder.write(DAY_PATH, dayText([entry(task())]));
    await sync(target);

    const marker = tombstoneLine({
      id: "task-1",
      deletedAt: `${DAY}T12:00:00.000Z`,
      deviceId: DEVICE,
    });
    target.folder.write(DAY_PATH, dayText([], [marker]));
    target.remote.files.set(
      DAY_PATH,
      dayText([
        entry(task()),
        entry(task({ id: "remote-add", title: "Remote task", updatedAt: `${DAY}T09:00:00.000Z` })),
      ]),
    );

    const result = await sync(target);

    expect(result.merged).toBe(1);
    expect(result.conflicts).toEqual([]);
    const merged = target.folder.read(DAY_PATH);
    expect(taskIds(merged)).toEqual(["remote-add"]);
    expect(parseMarkdown(merged, DAY, categories).extras).toContain(marker);
    expect(target.remote.read(DAY_PATH)).toBe(merged);
  });

  it("aborts before writing when a remote file cannot be read", async () => {
    const target = world();
    target.folder.write(DAY_PATH, dayText([entry(task())]));
    await sync(target);

    target.folder.write("2026-10/2026-10-23.md", dayText([entry(task({ id: "task-2" }))]));
    target.remote.failRead = DAY_PATH;
    target.remote.puts.length = 0;
    const before = JSON.stringify(target.baseline.value);

    const result = await sync(target);

    expect(result.errors).toHaveLength(1);
    expect(result.uploaded).toBe(0);
    expect(result.downloaded).toBe(0);
    expect(target.remote.puts).toEqual([]);
    expect(JSON.stringify(target.baseline.value)).toBe(before);
  });
});
