import { describe, expect, it } from "vitest";
import { planSync } from "../src/sync/webdav/plan";
import type { Baseline } from "../src/sync/webdav/types";

const local = (entries: Record<string, string>) => new Map(Object.entries(entries));
const remote = (entries: Record<string, string>) => new Map(Object.entries(entries));

function baseline(entries: Record<string, { local: string; remote: string }>): Baseline {
  return entries;
}

describe("WebDAV sync plan", () => {
  it("uploads a file that only exists locally", () => {
    const plan = planSync(local({ "2026-10/a.md": "L" }), remote({}), {});
    expect(plan.uploads).toEqual([{ kind: "upload", path: "2026-10/a.md" }]);
    expect(plan.downloads).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  it("downloads a file that only exists remotely", () => {
    const plan = planSync(local({}), remote({ "2026-10/a.md": "R" }), {});
    expect(plan.downloads).toEqual([{ kind: "download", path: "2026-10/a.md" }]);
    expect(plan.uploads).toEqual([]);
  });

  it("leaves identical files alone", () => {
    const plan = planSync(local({ a: "same" }), remote({ a: "same" }), {});
    expect(plan.unchanged).toEqual(["a"]);
    expect(plan.uploads).toEqual([]);
    expect(plan.downloads).toEqual([]);
  });

  it("uploads when only the local side changed since the baseline", () => {
    const plan = planSync(
      local({ a: "new-local" }),
      remote({ a: "old" }),
      baseline({ a: { local: "old", remote: "old" } }),
    );
    expect(plan.uploads).toEqual([{ kind: "upload", path: "a" }]);
  });

  it("downloads when only the remote side changed since the baseline", () => {
    const plan = planSync(
      local({ a: "old" }),
      remote({ a: "new-remote" }),
      baseline({ a: { local: "old", remote: "old" } }),
    );
    expect(plan.downloads).toEqual([{ kind: "download", path: "a" }]);
  });

  it("reports a conflict when both sides changed", () => {
    const plan = planSync(
      local({ a: "local-edit" }),
      remote({ a: "remote-edit" }),
      baseline({ a: { local: "old", remote: "old" } }),
    );
    expect(plan.conflicts).toEqual(["a"]);
    expect(plan.uploads).toEqual([]);
    expect(plan.downloads).toEqual([]);
  });

  it("reports a conflict on the first sync when differing files already exist", () => {
    const plan = planSync(local({ a: "local" }), remote({ a: "remote" }), {});
    expect(plan.conflicts).toEqual(["a"]);
  });

  it("treats a stale baseline as a conflict rather than guessing", () => {
    const plan = planSync(
      local({ a: "local" }),
      remote({ a: "remote" }),
      baseline({ a: { local: "unknown-1", remote: "unknown-2" } }),
    );
    expect(plan.conflicts).toEqual(["a"]);
  });

  it("never plans deletions", () => {
    const plan = planSync(
      local({ keep: "same" }),
      remote({}),
      baseline({ gone: { local: "x", remote: "x" } }),
    );
    expect(plan.uploads).toEqual([{ kind: "upload", path: "keep" }]);
    expect(JSON.stringify(plan)).not.toContain("delete");
  });

  it("is deterministic regardless of map insertion order", () => {
    const a = planSync(local({ b: "1", a: "1" }), remote({}), {});
    const b = planSync(local({ a: "1", b: "1" }), remote({}), {});
    expect(a).toEqual(b);
    expect(a.uploads.map((operation) => operation.path)).toEqual(["a", "b"]);
  });
});
