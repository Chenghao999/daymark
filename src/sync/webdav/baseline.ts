import { normalizeRemotePath } from "./client";
import type { Baseline, WebDavConfig } from "./types";

const STORAGE_KEY = "daymark.webdav.baseline.v1";

/**
 * The baseline is device-local. It records the hashes both sides had after the
 * last successful sync, which is what makes "changed here" different from
 * "changed there".
 */
export function loadBaseline(config: Pick<WebDavConfig, "url" | "remotePath">): Baseline {
  const all = readAll();
  return all[baselineKey(config)] ?? {};
}

export function saveBaseline(
  config: Pick<WebDavConfig, "url" | "remotePath">,
  baseline: Baseline,
): void {
  const all = readAll();
  all[baselineKey(config)] = baseline;
  writeAll(all);
}

export function clearBaseline(config: Pick<WebDavConfig, "url" | "remotePath">): void {
  const all = readAll();
  delete all[baselineKey(config)];
  writeAll(all);
}

export function baselineKey(config: Pick<WebDavConfig, "url" | "remotePath">): string {
  return `${config.url.trim().replace(/\/+$/, "")}|${normalizeRemotePath(config.remotePath)}`;
}

function readAll(): Record<string, Baseline> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Baseline>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Baseline>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // A full disk must not break the sync itself; the next run simply treats
    // every differing file as changed on both sides.
  }
}
