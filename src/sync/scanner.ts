import { treeSignature } from "../storage/fs";

export interface FolderScannerOptions {
  /** Root folder that holds `_backlog.md`, `_categories.md` and month folders. */
  rootPath: string;
  intervalMs: number;
  /** Called when the folder changed without Daymark writing it. */
  onExternalChange: () => void;
}

export interface FolderScanner {
  stop(): void;
  /** Re-baseline after Daymark itself wrote to the store. */
  touch(): Promise<void>;
}

interface Signature {
  fileCount: number;
  latestMtimeMs: number | null;
  fingerprint: string;
}

/**
 * Polls a cheap signature of the data folder: how many Markdown files exist,
 * the newest mtime and a fingerprint over each file's path, size and mtime.
 * The fingerprint matters because sync clients may preserve mtimes when they
 * replace a file; the size still changes.
 */
export function startFolderScanner(options: FolderScannerOptions): FolderScanner {
  let baseline: Signature | null = null;
  let inFlight = false;
  let stopped = false;

  async function readSignature(): Promise<Signature | null> {
    try {
      return await treeSignature(options.rootPath);
    } catch {
      return null;
    }
  }

  function same(a: Signature, b: Signature): boolean {
    return a.fingerprint === b.fingerprint;
  }

  async function tick(): Promise<void> {
    if (inFlight || stopped) return;
    inFlight = true;
    try {
      const signature = await readSignature();
      if (signature === null) return;
      if (baseline === null) {
        baseline = signature;
        return;
      }
      if (!same(signature, baseline)) {
        baseline = signature;
        options.onExternalChange();
      }
    } finally {
      inFlight = false;
    }
  }

  const timer = window.setInterval(() => {
    void tick();
  }, options.intervalMs);

  void tick();

  return {
    stop() {
      stopped = true;
      window.clearInterval(timer);
    },
    async touch() {
      const signature = await readSignature();
      if (signature !== null) baseline = signature;
    },
  };
}
