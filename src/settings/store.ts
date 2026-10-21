import type { AppLanguage, NumberingStyle } from "../domain/types";

export interface AppSettings {
  language: AppLanguage;
  /** Absolute path of the folder that holds daymark.db. Empty until onboarding. */
  dataDir: string;
  dbFileName: string;
  scanIntervalSec: number;
  numbering: NumberingStyle;
  userName: string;
}

const STORAGE_KEY = "daymark.settings.v1";

export const DEFAULT_SETTINGS: AppSettings = {
  language: "zh-CN",
  dataDir: "",
  dbFileName: "daymark.db",
  scanIntervalSec: 60,
  numbering: "chinese",
  userName: "",
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Settings are device-local convenience state; failing to persist them
    // must not take the app down.
  }
}

export function databasePath(settings: AppSettings): string {
  const dir = settings.dataDir.replace(/\/+$/, "");
  return `${dir}/${settings.dbFileName}`;
}
