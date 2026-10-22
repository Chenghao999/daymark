import type { AppLanguage, NumberingStyle } from "../domain/types";

/**
 * Preferences that describe the plan itself and are therefore written to
 * `_settings.md` inside the data folder. Keeping them in the synced folder is
 * what makes a report generated on one device match a report generated on
 * another.
 */
export interface SyncedSettings {
  language: AppLanguage;
  /** 0 = Sunday, 1 = Monday. Matches date-fns weekStartsOn. */
  weekStartsOn: 0 | 1;
  /** Day of month that starts an assessment month. 1 means the calendar month. */
  assessmentMonthStartDay: number;
  /** Month (1-12) that starts an assessment year. */
  assessmentYearStartMonth: number;
  numbering: NumberingStyle;
  scanIntervalSec: number;
  /** Reserved for report signatures and the future AI assistant. */
  userName: string;
}

export interface AppSettings extends SyncedSettings {
  /** Absolute path of the data folder. Device-local, never written to the file. */
  dataDir: string;
}

export const SYNCED_KEYS: (keyof SyncedSettings)[] = [
  "language",
  "weekStartsOn",
  "assessmentMonthStartDay",
  "assessmentYearStartMonth",
  "numbering",
  "scanIntervalSec",
  "userName",
];

const STORAGE_KEY = "daymark.settings.v1";

export const DEFAULT_SETTINGS: AppSettings = {
  language: "zh-CN",
  dataDir: "",
  weekStartsOn: 1,
  assessmentMonthStartDay: 1,
  assessmentYearStartMonth: 1,
  numbering: "chinese",
  scanIntervalSec: 60,
  userName: "",
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return sanitize({ ...DEFAULT_SETTINGS, ...parsed, dataDir: parsed.dataDir ?? "" });
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

/** Clamp values that come from a hand-edited settings file. */
export function sanitize(settings: AppSettings): AppSettings {
  const clamp = (value: number, min: number, max: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
  return {
    ...settings,
    weekStartsOn: settings.weekStartsOn === 0 ? 0 : 1,
    assessmentMonthStartDay: clamp(settings.assessmentMonthStartDay, 1, 28, 1),
    assessmentYearStartMonth: clamp(settings.assessmentYearStartMonth, 1, 12, 1),
    scanIntervalSec: clamp(settings.scanIntervalSec, 10, 3600, 60),
  };
}

export function syncedPart(settings: AppSettings): SyncedSettings {
  return {
    language: settings.language,
    weekStartsOn: settings.weekStartsOn,
    assessmentMonthStartDay: settings.assessmentMonthStartDay,
    assessmentYearStartMonth: settings.assessmentYearStartMonth,
    numbering: settings.numbering,
    scanIntervalSec: settings.scanIntervalSec,
    userName: settings.userName,
  };
}
