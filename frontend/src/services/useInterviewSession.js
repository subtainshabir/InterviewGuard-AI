import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCandidate,
  createInterview,
  endInterview,
  getInterview,
  pauseInterview,
  resumeInterview,
  startInterview,
} from "./api";

const SESSION_ID_KEY = "interviewguard.sessionId";

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

async function bootstrapSession() {
  const candidate = await createCandidate({
    name: "Demo Candidate",
    email: `demo.candidate.${randomSuffix()}@example.com`,
  });
  return createInterview({ candidate_id: candidate.id });
}

export function useInterviewSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const actionInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const storedId = window.localStorage.getItem(SESSION_ID_KEY);
        let current = storedId ? await getInterview(storedId).catch(() => null) : null;
        if (!current) {
          current = await bootstrapSession();
          window.localStorage.setItem(SESSION_ID_KEY, current.id);
        }
        if (!cancelled) setSession(current);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    setElapsedSeconds(session.duration_seconds ?? 0);
  }, [session]);

  useEffect(() => {
    if (session?.status !== "active") return undefined;
    const interval = setInterval(() => {
      setElapsedSeconds((value) => value + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.status]);

  const runAction = useCallback(
    async (actionFn) => {
      if (!session || actionInFlight.current) return;
      actionInFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const updated = await actionFn(session.id);
        setSession(updated);
      } catch (err) {
        setError(err.message);
      } finally {
        actionInFlight.current = false;
        setBusy(false);
      }
    },
    [session]
  );

  return {
    session,
    loading,
    error,
    busy,
    elapsedSeconds,
    start: () => runAction(startInterview),
    pause: () => runAction(pauseInterview),
    resume: () => runAction(resumeInterview),
    end: () => runAction(endInterview),
  };
}