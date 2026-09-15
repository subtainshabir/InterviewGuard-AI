import { useEffect, useState } from "react";
import { fetchHealth } from "./api";

export function useBackendStatus(pollIntervalMs = 15000) {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        await fetchHealth();
        if (!cancelled) setStatus("connected");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    }

    check();
    const interval = setInterval(check, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pollIntervalMs]);

  return status;
}