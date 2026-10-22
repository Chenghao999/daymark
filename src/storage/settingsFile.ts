import {
  DEFAULT_SETTINGS,
  sanitize,
  syncedPart,
  type AppSettings,
  type SyncedSettings,
} from "../settings/store";
import { readTextFile, writeTextFile } from "./fs";
import { settingsPath } from "./paths";

const META_RE = /<!--\s*daymark settings\s+(\{[\s\S]*?\})\s*-->/;
const BULLET_RE = /^\s*-\s*([A-Za-z]+)\s*:\s*(.*?)\s*$/;
const KNOWN_KEYS: (keyof SyncedSettings)[] = [
  "language",
  "weekStartsOn",
  "assessmentMonthStartDay",
  "assessmentYearStartMonth",
  "numbering",
  "scanIntervalSec",
  "userName",
];

/**
 * `_settings.md` is part of the data folder, so it syncs with the Markdown
 * files. The bullet list is the human-readable copy; the HTML comment carries
 * the machine-readable values. Editing either one works, with the JSON block
 * taking precedence when both are present.
 */
export function serializeSettingsMarkdown(settings: AppSettings): string {
  const synced = syncedPart(settings);
  const bullets = KNOWN_KEYS.map((key) => `- ${key}: ${formatValue(synced[key])}`);
  return [
    "# Daymark settings / Daymark 设置",
    "",
    ...bullets,
    "",
    `<!-- daymark settings ${JSON.stringify(synced)} -->`,
    "",
  ].join("\n");
}

export function parseSettingsMarkdown(text: string): SyncedSettings {
  const raw: Record<string, unknown> = {};

  const meta = META_RE.exec(text);
  if (meta) {
    try {
      Object.assign(raw, JSON.parse(meta[1]) as Record<string, unknown>);
    } catch {
      // Fall through to the bullet list; a broken JSON comment must not make
      // the whole settings file unusable.
    }
  }

  for (const line of text.split("\n")) {
    const match = BULLET_RE.exec(line);
    if (!match) continue;
    const key = match[1] as keyof SyncedSettings;
    if (!KNOWN_KEYS.includes(key) || key in raw) continue;
    raw[key] = parseValue(key, match[2]);
  }

  return syncedPart(sanitize({ ...DEFAULT_SETTINGS, ...(raw as Partial<AppSettings>) }));
}

export async function loadSyncedSettings(root: string): Promise<SyncedSettings | null> {
  const text = await readTextFile(settingsPath(root));
  if (text === null) return null;
  return parseSettingsMarkdown(text);
}

export async function saveSyncedSettings(root: string, settings: AppSettings): Promise<void> {
  await writeTextFile(settingsPath(root), serializeSettingsMarkdown(settings));
}

function parseValue(key: keyof SyncedSettings, value: string): unknown {
  if (key === "weekStartsOn" || key === "assessmentMonthStartDay" || key === "assessmentYearStartMonth" || key === "scanIntervalSec") {
    return Number(value);
  }
  return value;
}

function formatValue(value: string | number): string {
  return String(value);
}
