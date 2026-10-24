import { useEffect, useState } from "react";

/**
 * Tracks browser connectivity so AI buttons can be disabled before a request
 * fails. `navigator.onLine` is a hint, not a guarantee: a reachable network can
 * still block the API endpoint, so a real error remains the final word.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
