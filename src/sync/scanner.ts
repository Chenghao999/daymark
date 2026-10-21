import { invoke } from "@tauri-apps/api/core";

export interface FileScannerOptions {
  filePath: string;
  intervalMs: number;
  /** Called when the file's mtime changed without Daymark writing it. */
  onExternalChange: (mtimeMs: number) => void;
}

export interface FileScanner {
  stop(): void;
  /** Re-baseline after Daymark itself wrote to the database. */
  touch(): Promise<void>;
}

/**
 * Polls the database file's mtime. This is deliberately simple: the desktop
 * app only needs to notice that a sync client dropped a new version, and the
 * merge step is handled by the caller.
 */
export function startFileScanner(options: FileScannerOptions): FileScanner {
  let baseline: number | null = null;
  let inFlight = false;
  let stopped = false;

  async function readMtime(): Promise<number | null> {
    try {
      return await invoke<number | null>("file_mtime_ms", { path: options.filePath });
    } catch {
      return null;
    }
  }

  async function tick(): Promise<void> {
    if (inFlight || stopped) return;
    inFlight = true;
    try {
      const mtime = await readMtime();
      if (mtime === null) return;
      if (baseline === null) {
        baseline = mtime;
        return;
      }
      if (mtime !== baseline) {
        baseline = mtime;
        options.onExternalChange(mtime);
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
      const mtime = await readMtime();
      if (mtime !== null) baseline = mtime;
    },
  };
}
