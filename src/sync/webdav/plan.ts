import type { Baseline, SyncPlan } from "./types";

/**
 * Three-way decision for a manual sync.
 *
 * The baseline is the pair of content hashes recorded at the end of the last
 * successful sync. Without it, "both sides differ from each other" cannot be
 * told apart from "only one side changed".
 *
 * Deletions are not propagated in this version: a file missing on one side is
 * copied back rather than deleted, which is the safe direction for a personal
 * planner. Conflicts are never resolved automatically.
 */
export function planSync(
  local: Map<string, string>,
  remote: Map<string, string>,
  baseline: Baseline,
): SyncPlan {
  const plan: SyncPlan = { uploads: [], downloads: [], conflicts: [], unchanged: [] };
  const paths = [...new Set([...local.keys(), ...remote.keys()])].sort();

  for (const path of paths) {
    const localHash = local.get(path);
    const remoteHash = remote.get(path);

    if (localHash !== undefined && remoteHash !== undefined) {
      if (localHash === remoteHash) {
        plan.unchanged.push(path);
        continue;
      }
      const base = baseline[path];
      const localChanged = !base || localHash !== base.local;
      const remoteChanged = !base || remoteHash !== base.remote;

      if (localChanged && !remoteChanged) plan.uploads.push({ kind: "upload", path });
      else if (remoteChanged && !localChanged) plan.downloads.push({ kind: "download", path });
      // Both changed, or neither changed while the hashes disagree (a stale
      // baseline): a human decides. Keeping both copies is the only safe move.
      else plan.conflicts.push(path);
      continue;
    }

    if (localHash !== undefined) {
      plan.uploads.push({ kind: "upload", path });
    } else if (remoteHash !== undefined) {
      plan.downloads.push({ kind: "download", path });
    }
  }

  return plan;
}
