import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * Credentials (WebDAV password, CalDAV password, AI API key) belong in the OS
 * credential store, not in `localStorage`, where other scripts and backups can
 * read them. Keychain calls are asynchronous while settings load
 * synchronously, so a device-local copy is kept as a crash-safe fallback:
 *
 * - A save writes the local copy first, then pushes to the keychain. The copy
 *   is removed only after the keychain confirms the write.
 * - A read prefers a local copy when one exists, because it is the newest
 *   value (a keychain push may still be pending or may have failed).
 * - An empty local copy is a tombstone: it hides an older keychain item after
 *   a clear, even if deleting that item failed.
 *
 * Nothing here is ever written to `_settings.md` or the data folder.
 */
export type SecretName = "webdav.password" | "caldav.password" | "ai.apiKey";

export type SecretSource = "keychain" | "local" | "none";

export interface ResolvedSecret {
  value: string;
  source: SecretSource;
}

const LOCAL_PREFIX = "daymark.secret.";
const KEYCHAIN_PUSH_DELAY_MS = 300;
const KEYCHAIN_READ_TIMEOUT_MS = 3000;

const pending = new Map<SecretName, string>();
const timers = new Map<SecretName, ReturnType<typeof setTimeout>>();

function localKey(name: SecretName): string {
  return `${LOCAL_PREFIX}${name}`;
}

/** `null` means "never saved on this device", `""` means "explicitly cleared". */
function rawLocal(name: SecretName): string | null {
  try {
    return localStorage.getItem(localKey(name));
  } catch {
    return null;
  }
}

function setLocal(name: SecretName, value: string): void {
  try {
    localStorage.setItem(localKey(name), value);
  } catch {
    // The keychain is still attempted; only a restart would need re-entry.
  }
}

function clearLocal(name: SecretName): void {
  try {
    localStorage.removeItem(localKey(name));
  } catch {
    // Leaving a stale copy only causes an extra keychain-friendly migration.
  }
}

/** The device-local copy only, for synchronous settings loaders. */
export function readLocalSecret(name: SecretName): string {
  return rawLocal(name) ?? "";
}

/**
 * The device-local copy, or `null` when nothing was ever saved on this device.
 * An empty string is a tombstone for a credential the user cleared, so a
 * loader must not fall back to an older field in that case.
 */
export function localSecretOf(name: SecretName): string | null {
  return rawLocal(name);
}

async function readKeychain(name: SecretName): Promise<string | null> {
  if (!isTauri()) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      invoke<string | null>("secret_get", { account: name }),
      new Promise<null>((resolve) => {
        // A locked or unresponsive credential store must not block startup.
        timer = setTimeout(() => resolve(null), KEYCHAIN_READ_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Resolve a secret: newest local copy first, then the OS credential store.
 * Never throws; an unavailable keychain simply means "no secret".
 */
export async function readSecret(name: SecretName): Promise<ResolvedSecret> {
  const local = rawLocal(name);
  if (local !== null) {
    return local
      ? { value: local, source: "local" }
      : { value: "", source: "none" };
  }
  const value = await readKeychain(name);
  return value
    ? { value, source: "keychain" }
    : { value: "", source: "none" };
}

async function pushToKeychain(name: SecretName, value: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    await invoke("secret_set", { account: name, value });
    // Only clear the copy this push was based on; a newer keystroke may have
    // written another value while the keychain call was in flight.
    if (rawLocal(name) === value) clearLocal(name);
    return true;
  } catch {
    return false;
  }
}

/** Write immediately: the local copy now, the keychain right away. */
export async function writeSecret(name: SecretName, value: string): Promise<boolean> {
  setLocal(name, value);
  if (await pushToKeychain(name, value)) return true;
  // Without a keychain (browser build), local storage is the store.
  return !isTauri();
}

/** Write while the user types: the local copy now, the keychain shortly. */
export function queueSecret(name: SecretName, value: string): void {
  setLocal(name, value);
  if (!isTauri()) return;
  pending.set(name, value);
  if (timers.has(name)) return;
  const timer = setTimeout(() => {
    timers.delete(name);
    const next = pending.get(name);
    pending.delete(name);
    if (next !== undefined) void pushToKeychain(name, next);
  }, KEYCHAIN_PUSH_DELAY_MS);
  timers.set(name, timer);
}

/**
 * Startup hydration. Reads the keychain, falls back to a value loaded from
 * the old localStorage layout, and migrates anything that is still only
 * device-local into the keychain. Returns the value the app should use.
 */
export async function hydrateSecret(
  name: SecretName,
  legacyValue: string,
): Promise<string> {
  const stored = await readSecret(name);
  const value = stored.value || legacyValue;
  if (!value) {
    // A tombstone means a previous clear could not reach the keychain. Try
    // again so the old item does not stay there indefinitely.
    if (stored.source === "none" && rawLocal(name) === "") {
      void writeSecret(name, "");
    }
    return "";
  }
  if (stored.source !== "keychain") {
    // Migration need not delay startup; the local copy is already in place.
    void writeSecret(name, value);
  }
  return value;
}

/**
 * Remove a secret from a JSON object kept in device-local storage while
 * leaving every other field untouched. Used once, after hydration moved the
 * value to its dedicated key, so old builds cannot read it from there.
 */
export function scrubStoredSecret(
  storageKey: string,
  path: readonly string[],
): void {
  if (path.length === 0) return;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const root = JSON.parse(raw) as unknown;
    if (!root || typeof root !== "object") return;
    let owner = root as Record<string, unknown>;
    for (const key of path.slice(0, -1)) {
      const next = owner[key];
      if (!next || typeof next !== "object") return;
      owner = next as Record<string, unknown>;
    }
    const leaf = path[path.length - 1];
    if (owner[leaf] === "") return;
    owner[leaf] = "";
    localStorage.setItem(storageKey, JSON.stringify(root));
  } catch {
    // A malformed or unavailable store is left alone.
  }
}
