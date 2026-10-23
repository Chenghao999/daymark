import type { ReportKind } from "../domain/types";
import { writeTextFile } from "../storage/fs";

const PAD = (value: number) => String(value).padStart(2, "0");

export function aiOutputPath(root: string, kind: ReportKind, date: Date): string {
  const day = `${date.getFullYear()}-${PAD(date.getMonth() + 1)}-${PAD(date.getDate())}`;
  const time = `${PAD(date.getHours())}${PAD(date.getMinutes())}${PAD(date.getSeconds())}`;
  // The timestamp makes every run a new file: an earlier answer is never
  // silently replaced.
  return `${root}/_ai/${day}-${kind}-${time}.md`;
}

/**
 * Writes an AI answer as a normal Markdown file inside the data folder. It is
 * not a task, a report or a setting; it is a note the user can keep, edit or
 * delete with any editor.
 */
export async function saveAiOutput(
  root: string,
  kind: ReportKind,
  text: string,
  date = new Date(),
): Promise<string> {
  const path = aiOutputPath(root, kind, date);
  const stamp = `${date.getFullYear()}-${PAD(date.getMonth() + 1)}-${PAD(date.getDate())} ${PAD(date.getHours())}:${PAD(date.getMinutes())}`;
  await writeTextFile(path, `# AI ${kind} · ${stamp}\n\n${text.trim()}\n`);
  return path;
}
