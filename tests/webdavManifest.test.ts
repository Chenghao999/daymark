import { describe, expect, it } from "vitest";
import { localManifest, sha256, type ManifestIo } from "../src/sync/webdav/manifest";

const ROOT = "/data";

function fakeIo(files: Record<string, string>, directories: string[] = []): ManifestIo {
  const dirs = new Map<string, { name: string; isDirectory: boolean }[]>();
  dirs.set(ROOT, [
    ...Object.keys(files)
      .filter((path) => !path.includes("/"))
      .map((name) => ({ name, isDirectory: false })),
    ...directories.map((name) => ({ name, isDirectory: true })),
  ]);
  for (const directory of directories) {
    dirs.set(`${ROOT}/${directory}`, []);
  }
  for (const path of Object.keys(files)) {
    const slash = path.indexOf("/");
    if (slash < 0) continue;
    const directory = path.slice(0, slash);
    dirs.get(`${ROOT}/${directory}`)?.push({
      name: path.slice(slash + 1),
      isDirectory: false,
    });
  }

  return {
    async listDir(path) {
      return dirs.get(path) ?? [];
    },
    async readTextFile(path) {
      if (!path.startsWith(`${ROOT}/`)) return null;
      return files[path.slice(ROOT.length + 1)] ?? null;
    },
  };
}

describe("local WebDAV manifest", () => {
  it("includes only the three root files and valid day files", async () => {
    const manifest = await localManifest(
      ROOT,
      fakeIo(
        {
          "_settings.md": "s",
          "_categories.md": "c",
          "_backlog.md": "b",
          "_notes.md": "ignored",
          "README.md": "ignored",
          "2026-10/2026-10-22.md": "day",
          "2026-10/random.md": "ignored",
          "2026-10/2026-10-22 (conflict x).md": "ignored",
        },
        ["2026-10", "misc"],
      ),
    );
    expect([...manifest.hashes.keys()].sort()).toEqual([
      "2026-10/2026-10-22.md",
      "_backlog.md",
      "_categories.md",
      "_settings.md",
    ]);
    expect(manifest.texts.get("_backlog.md")).toBe("b");
  });

  it("hashes content, so any edit changes the value", async () => {
    const io = fakeIo({ "_backlog.md": "one" });
    const first = await localManifest(ROOT, io);
    const second = await localManifest(ROOT, fakeIo({ "_backlog.md": "two" }));
    expect(first.hashes.get("_backlog.md")).not.toBe(second.hashes.get("_backlog.md"));
    expect(first.hashes.get("_backlog.md")).toBe(await sha256("one"));
  });

  it("skips files that disappeared between listing and reading", async () => {
    const io: ManifestIo = {
      async listDir() {
        return [{ name: "_backlog.md", isDirectory: false }];
      },
      async readTextFile() {
        return null;
      },
    };
    expect((await localManifest(ROOT, io)).hashes.size).toBe(0);
  });
});
