const DEVICE_KEY = "daymark.deviceId";

/** Stable identity for this installation, stored in localStorage. */
export function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return "unknown-device";
  }
}
