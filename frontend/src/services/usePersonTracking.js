import { useEffect, useRef, useState } from "react";

const MAX_ACTIVITY_LOG = 15;
const MAX_ALERTS = 10;
const MAX_EVIDENCE = 10;
const ABSENT_THRESHOLD_MS = 4000; // 4s without any person triggers absence alert

export function formatTime(ms) {
  if (!ms || ms < 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatDurationSec(ms) {
  if (!ms || ms < 0) return "0s";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

let nextAlertId = 1;
let nextEvidenceId = 1;
let nextEventId = 1;

const EMPTY_SUMMARY = {
  count: 0,
  status: "no_person",
  isMultiplePeople: false,
  isCandidateAbsent: false,
  activePeople: [],
  recentExits: [],
  activityLog: [],
  totalMultiplePersonMs: 0,
  candidatePresenceMs: 0,
  totalMonitoredMs: 0,
  riskContribution: 0,
};

const EMPTY_OUTPUT = {
  faces: [],
  summary: EMPTY_SUMMARY,
  alerts: [],
  evidenceEvents: [],
  risk: { score: 0, maxScore: 100, level: "Low Risk", note: "No signals evaluated yet." },
};

/**
 * Hook to manage Multiple Person Detection:
 * - 0/1/2+ people count & status categorization
 * - Person entry & exit detection and lifecycle events
 * - Continuous presence duration per person & cumulative multi-person time
 * - Security alert and timeline evidence escalation for unauthorized presence
 */
export function usePersonTracking(faces, timestamp, active) {
  const peopleStateRef = useRef(new Map());
  const exitsRef = useRef([]);
  const activityLogRef = useRef([]);
  const alertsRef = useRef([]);
  const evidenceRef = useRef([]);
  const totalMultiPersonMsRef = useRef(0);
  const totalMonitoredMsRef = useRef(0);
  const lastTimestampRef = useRef(null);
  const lastCandidateSeenAtRef = useRef(null);
  const hasAlertedAbsenceRef = useRef(false);
  const hasAlertedMultiPersonRef = useRef(false);
  const [output, setOutput] = useState(EMPTY_OUTPUT);

  useEffect(() => {
    if (!active) {
      peopleStateRef.current = new Map();
      exitsRef.current = [];
      activityLogRef.current = [];
      alertsRef.current = [];
      evidenceRef.current = [];
      totalMultiPersonMsRef.current = 0;
      totalMonitoredMsRef.current = 0;
      lastTimestampRef.current = null;
      lastCandidateSeenAtRef.current = null;
      hasAlertedAbsenceRef.current = false;
      hasAlertedMultiPersonRef.current = false;
      setOutput(EMPTY_OUTPUT);
      return;
    }

    if (timestamp === null || timestamp === undefined) return;

    const deltaMs = lastTimestampRef.current !== null
      ? Math.min(Math.max(0, timestamp - lastTimestampRef.current), 1000)
      : 0;
    lastTimestampRef.current = timestamp;

    totalMonitoredMsRef.current += deltaMs;

    const peopleMap = peopleStateRef.current;
    const currentFaces = faces || [];
    const activeIds = new Set();

    let currentAlerts = [...alertsRef.current];
    let currentEvidence = [...evidenceRef.current];
    let currentActivity = [...activityLogRef.current];
    let alertsChanged = false;
    let evidenceChanged = false;
    let activityChanged = false;

    // Track active people
    const enrichedFaces = currentFaces.map((face, index) => {
      activeIds.add(face.id);
      let person = peopleMap.get(face.id);

      if (!person) {
        // Person Entry Detected
        const isCandidate = peopleMap.size === 0 && index === 0;
        const role = isCandidate ? "Candidate" : `Person ${index + 1} (Unauthorized)`;
        const label = isCandidate ? "Candidate" : `Person ${index + 1}`;

        person = {
          id: face.id,
          personIndex: index,
          isCandidate,
          role,
          label,
          firstSeenAt: timestamp,
          lastSeenAt: timestamp,
          presenceDurationMs: 0,
          status: "active",
        };
        peopleMap.set(face.id, person);

        // Record Entry Event
        const entryEvent = {
          id: `entry-${nextEventId++}`,
          type: "entry",
          personId: face.id,
          role,
          label,
          isCandidate,
          timestamp,
          timeFormatted: formatTime(timestamp),
          message: isCandidate
            ? "Candidate entered camera frame"
            : `⚠️ ${role} entered camera frame`,
        };
        currentActivity = [entryEvent, ...currentActivity].slice(0, MAX_ACTIVITY_LOG);
        activityChanged = true;

        // If secondary person entered, emit security alert
        if (!isCandidate) {
          const newAlert = {
            id: `alert-person-entry-${nextAlertId++}`,
            timestamp: formatTime(timestamp),
            type: "Multiple Persons Detected",
            severity: "critical",
            description: `Secondary person (${label}) entered live interview frame`,
          };
          currentAlerts = [newAlert, ...currentAlerts].slice(0, MAX_ALERTS);
          alertsChanged = true;

          const newEvidence = {
            id: `ev-person-entry-${nextEvidenceId++}`,
            timestamp: formatTime(timestamp),
            type: "Unauthorized Person Entry",
            source: "Person Tracker",
            confidence: Math.round((face.confidence || 0.9) * 100),
            duration: "Initial Entry",
            severity: "critical",
          };
          currentEvidence = [newEvidence, ...currentEvidence].slice(0, MAX_EVIDENCE);
          evidenceChanged = true;
        }
      }

      // Update presence duration
      person.lastSeenAt = timestamp;
      person.presenceDurationMs = Math.max(0, timestamp - person.firstSeenAt);

      return {
        ...face,
        personInfo: {
          personIndex: person.personIndex,
          isCandidate: person.isCandidate,
          role: person.role,
          label: person.label,
          presenceDurationMs: person.presenceDurationMs,
          presenceFormatted: formatDurationSec(person.presenceDurationMs),
        },
      };
    });

    // Detect Person Exits (people in state that are no longer in activeIds)
    let exits = [...exitsRef.current];
    let exitsChanged = false;

    Array.from(peopleMap.keys()).forEach((id) => {
      if (!activeIds.has(id)) {
        const departed = peopleMap.get(id);
        if (departed) {
          const exitEvent = {
            id: `exit-${nextEventId++}`,
            type: "exit",
            personId: departed.id,
            role: departed.role,
            label: departed.label,
            isCandidate: departed.isCandidate,
            timestamp,
            timeFormatted: formatTime(timestamp),
            durationFormatted: formatDurationSec(departed.presenceDurationMs),
            message: `${departed.label} exited camera frame (Present: ${formatDurationSec(
              departed.presenceDurationMs
            )})`,
          };
          currentActivity = [exitEvent, ...currentActivity].slice(0, MAX_ACTIVITY_LOG);
          activityChanged = true;

          exits = [
            {
              ...departed,
              exitTimestamp: timestamp,
              totalDurationFormatted: formatDurationSec(departed.presenceDurationMs),
            },
            ...exits,
          ].slice(0, 5);
          exitsChanged = true;

          // If unauthorized person left, log timeline event
          if (!departed.isCandidate) {
            const exitEvidence = {
              id: `ev-person-exit-${nextEvidenceId++}`,
              timestamp: formatTime(timestamp),
              type: "Unauthorized Person Exit",
              source: "Person Tracker",
              confidence: 95,
              duration: formatDurationSec(departed.presenceDurationMs),
              severity: "medium",
            };
            currentEvidence = [exitEvidence, ...currentEvidence].slice(0, MAX_EVIDENCE);
            evidenceChanged = true;
          }
        }
        peopleMap.delete(id);
      }
    });

    if (exitsChanged) exitsRef.current = exits;
    if (activityChanged) activityLogRef.current = currentActivity;

    const count = enrichedFaces.length;
    let status = "no_person";
    let isMultiplePeople = false;
    let isCandidateAbsent = false;
    let riskContribution = 0;

    if (count === 0) {
      status = "no_person";
      if (lastCandidateSeenAtRef.current === null) {
        lastCandidateSeenAtRef.current = timestamp;
      }
      const absentDuration = timestamp - lastCandidateSeenAtRef.current;
      if (absentDuration >= ABSENT_THRESHOLD_MS) {
        isCandidateAbsent = true;
        riskContribution = 30;

        if (!hasAlertedAbsenceRef.current) {
          hasAlertedAbsenceRef.current = true;
          const absentAlert = {
            id: `alert-absent-${nextAlertId++}`,
            timestamp: formatTime(timestamp),
            type: "Candidate Missing",
            severity: "warning",
            description: `Candidate not detected in camera frame for > ${(absentDuration / 1000).toFixed(0)}s`,
          };
          currentAlerts = [absentAlert, ...currentAlerts].slice(0, MAX_ALERTS);
          alertsChanged = true;
        }
      }
    } else if (count === 1) {
      status = "single_candidate";
      lastCandidateSeenAtRef.current = timestamp;
      hasAlertedAbsenceRef.current = false;
      hasAlertedMultiPersonRef.current = false;
      riskContribution = 0;
    } else {
      // 2+ people
      status = "multiple_people";
      isMultiplePeople = true;
      lastCandidateSeenAtRef.current = timestamp;
      totalMultiPersonMsRef.current += deltaMs;
      hasAlertedAbsenceRef.current = false;

      // Heavy risk penalty for multiple people
      riskContribution = 65;

      if (!hasAlertedMultiPersonRef.current) {
        hasAlertedMultiPersonRef.current = true;
        const multiAlert = {
          id: `alert-multi-${nextAlertId++}`,
          timestamp: formatTime(timestamp),
          type: "Multiple Persons Detected",
          severity: "critical",
          description: `Multiple persons (${count}) present simultaneously in live feed`,
        };
        currentAlerts = [multiAlert, ...currentAlerts].slice(0, MAX_ALERTS);
        alertsChanged = true;
      }
    }

    if (alertsChanged) alertsRef.current = currentAlerts;
    if (evidenceChanged) evidenceRef.current = currentEvidence;

    const activePeople = Array.from(peopleMap.values()).map((p) => ({
      ...p,
      presenceFormatted: formatDurationSec(p.presenceDurationMs),
    }));

    const candidate = activePeople.find((p) => p.isCandidate);
    const candidatePresenceMs = candidate ? candidate.presenceDurationMs : 0;

    let riskLevel = "Low Risk";
    let note = "Candidate present and verified.";
    if (isMultiplePeople) {
      riskLevel = "High Risk";
      note = `CRITICAL: ${count} people detected in camera feed simultaneously.`;
    } else if (isCandidateAbsent) {
      riskLevel = "Moderate Risk";
      note = "Candidate absent from camera frame.";
    }

    const summary = {
      count,
      status,
      isMultiplePeople,
      isCandidateAbsent,
      activePeople,
      recentExits: exitsRef.current,
      activityLog: activityLogRef.current,
      totalMultiplePersonMs: totalMultiPersonMsRef.current,
      candidatePresenceMs,
      totalMonitoredMs: totalMonitoredMsRef.current,
      riskContribution,
      riskLevel,
      note,
    };

    setOutput({
      faces: enrichedFaces,
      summary,
      alerts: alertsRef.current,
      evidenceEvents: evidenceRef.current,
      risk: {
        score: riskContribution,
        maxScore: 100,
        level: riskLevel,
        note,
      },
    });
  }, [faces, timestamp, active]);

  return output;
}
