/**
 * Recognises common cloud-sync folders from the chosen data-folder path, so
 * Settings can show a short compatibility note (PRD F-11). This is a pure
 * string heuristic: it never touches the file system, and a wrong guess only
 * shows a hint, never changes where data is stored.
 */

export type SyncFolderId =
  | "icloud"
  | "dropbox"
  | "onedrive"
  | "googleDrive"
  | "nutstore"
  | "syncthing";

export interface SyncFolder {
  id: SyncFolderId;
  /** Brand name, shown as-is in both languages. */
  name: string;
}

const PROVIDERS: SyncFolder[] = [
  { id: "icloud", name: "iCloud Drive" },
  { id: "onedrive", name: "OneDrive" },
  { id: "googleDrive", name: "Google Drive" },
  { id: "dropbox", name: "Dropbox" },
  { id: "nutstore", name: "Nutstore" },
  { id: "syncthing", name: "Syncthing" },
];

function matches(id: SyncFolderId, normalized: string): boolean {
  const segments = normalized.split(/[\\/]+/).filter(Boolean);
  switch (id) {
    case "icloud":
      // macOS: ~/Library/Mobile Documents/com~apple~CloudDocs/<folder>
      return segments.includes("com~apple~clouddocs");
    case "onedrive":
      // "OneDrive", "OneDrive - Contoso", macOS "OneDrive-Personal".
      return segments.some(
        (segment) =>
          segment === "onedrive" ||
          segment.startsWith("onedrive -") ||
          segment.startsWith("onedrive-"),
      );
    case "googleDrive":
      // "Google Drive", "Google Drive/My Drive", macOS "GoogleDrive-email".
      return segments.some(
        (segment) =>
          segment === "google drive" ||
          segment === "googledrive" ||
          segment.startsWith("googledrive-"),
      );
    case "dropbox":
      // "Dropbox", "Dropbox (Team)".
      return segments.some(
        (segment) => segment === "dropbox" || segment.startsWith("dropbox ("),
      );
    case "nutstore":
      return segments.some((segment) => segment === "nutstore" || segment.includes("坚果云"));
    case "syncthing":
      return segments.includes("syncthing");
  }
}

/** The cloud-sync provider this path sits in, or null for a plain folder. */
export function detectSyncFolder(path: string): SyncFolder | null {
  const normalized = path.trim().replace(/\\/g, "/").toLowerCase();
  if (!normalized) return null;
  return PROVIDERS.find((provider) => matches(provider.id, normalized)) ?? null;
}
