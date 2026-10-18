import { useEffect, useRef, useState } from "react";

// Time windows for behavioral analysis
export const REPEATED_SHIFT_WINDOW_MS = 15000; // 15 seconds window to detect rapid oscillating shifts
export const FREQUENCY_WINDOW_MS = 60000;      // 60 seconds rolling window for shifts/min
export const MIN_CYCLES_FOR_ALERT = 3;         // 3 alternating shifts (e.g. Center -> Left -> Center -> Left -> Center)
export const REPEATED_SHIFT_HOLD_MS = 8000;    // hold alert state for 8s after last detected shift
export const TEMPORAL_BUCKET_MS = 10000;       // 10s temporal timeline buckets
export const MAX_TIMELINE_BUCKETS = 6;         // hold last 6 10s buckets (1 minute of history)
export const MAX_STORED_TRANSITIONS = 60;
export const MAX_STORED_FIXATIONS = 40;
export const MAX_ALERTS = 10;
export const MAX_EVIDENCE = 10;

let nextAlertId = 1;
let nextEvidenceId = 1;

/**
 * Format relative timestamp into MM:SS for display
 */
export function formatTime(ms) {
  if (!ms || ms < 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Categorize frequency into monitoring risk levels
 */
export function classifyFrequency(shiftsPerMinute, totalMonitoredMs) {
  if (totalMonitoredMs < 5000) {
    return { level: "Calibrating", label: "Calibrating…", severity: "idle" };
  }
  if (shiftsPerMinute < 8) {
    return { level: "Low", label: "Low / Fixed", severity: "idle" };
  }
  if (shiftsPerMinute <= 32) {
    return { level: "Normal", label: "Normal (8–32/min)", severity: "ready" };
  }
  if (shiftsPerMinute <= 48) {
    return { level: "Elevated", label: "Elevated (33–48/min)", severity: "warning" };
  }
  return { level: "Excessive", label: "Excessive (>48/min)", severity: "critical" };
}

/**
 * Detect repeated oscillating gaze shifts in a sequence of recent transitions
 * e.g., Center -> Target -> Center -> Target -> Center...
 */
export function detectRepeatedShifts(transitions, now) {
  const recent = transitions.filter((t) => now - t.timestamp <= REPEATED_SHIFT_WINDOW_MS);
  const candidateTargets = ["Left", "Right", "Down", "Up"];

  let bestTarget = null;
  let maxCycles = 0;

  for (const target of candidateTargets) {
    let cycles = 0;
    let expectingReturnToCenter = false;

    for (const t of recent) {
      if (t.to === target) {
        if (!expectingReturnToCenter) {
          cycles += 1;
          expectingReturnToCenter = true;
        }
      } else if (t.to === "Center") {
        expectingReturnToCenter = false;
      }
    }

    if (cycles > maxCycles) {
      maxCycles = cycles;
      bestTarget = target;
    }
  }

  const detected = maxCycles >= MIN_CYCLES_FOR_ALERT;
  const severity = maxCycles >= 4 ? "critical" : detected ? "warning" : "idle";
  const message = detected
    ? `Repeated gaze shifts to ${bestTarget} (${maxCycles} cycles in ${Math.round(REPEATED_SHIFT_WINDOW_MS / 1000)}s)`
    : "No repeated shifts detected";

  return {
    detected,
    targetDirection: detected ? bestTarget : null,
    cycleCount: maxCycles,
    severity,
    message,
    windowSeconds: Math.round(REPEATED_SHIFT_WINDOW_MS / 1000),
  };
}

/**
 * Classifies temporal gaze pattern and computes behavioral risk score
 */
export function classifyTemporalPattern({
  currentDirection,
  currentDurationMs,
  isLookingAway,
  frequency,
  duration,
  repeatedShifts,
}) {
  let pattern = "Normal Conversational";
  let description = "Natural eye movement patterns within normal conversational bounds.";
  let severity = "ready";
  let riskScore = 0;

  if (repeatedShifts.detected) {
    pattern = "Reading / Scanning Notes";
    description = `Frequent alternating gaze shifts between screen and ${repeatedShifts.targetDirection} (${repeatedShifts.cycleCount}x), indicating potential reading of off-screen notes or a secondary monitor.`;
    severity = repeatedShifts.severity === "critical" ? "critical" : "warning";
    riskScore += repeatedShifts.cycleCount >= 4 ? 40 : 25;
  } else if (isLookingAway && currentDurationMs >= 3500) {
    pattern = "Prolonged Look-Away";
    description = `Candidate has sustained an off-center gaze towards ${currentDirection} for ${(currentDurationMs / 1000).toFixed(1)}s.`;
    severity = "critical";
    riskScore += 30;
  } else if (frequency.level === "Excessive") {
    pattern = "Erratic / Rapid Glances";
    description = `Gaze shift frequency is elevated (${frequency.shiftsPerMinute}/min), indicating rapid eye movements or restlessness.`;
    severity = "warning";
    riskScore += 20;
  } else if (duration.offCenterPercent > 50 && duration.totalMonitoredMs > 10000) {
    pattern = "Distracted Gaze";
    description = "Over 50% of recent monitoring time is directed away from the screen.";
    severity = "warning";
    riskScore += 15;
  } else if (duration.centerPercent >= 75 && duration.totalMonitoredMs >= 5000) {
    pattern = "Focused";
    description = "Gaze is predominantly centered on the interviewer and screen.";
    severity = "ready";
    riskScore = 0;
  }

  // Additional weight if off-center dwell time is elevated
  if (duration.offCenterPercent > 40 && riskScore > 0 && riskScore < 70) {
    riskScore += 10;
  }

  riskScore = Math.min(100, Math.max(0, riskScore));

  let riskLevel = "Low Risk";
  let note = "Gaze patterns are consistent and centered.";

  if (riskScore >= 70) {
    riskLevel = "High Risk";
    note = "Critical gaze anomalies: frequent repeated off-center shifts or prolonged look-away.";
  } else if (riskScore >= 45) {
    riskLevel = "Elevated Risk";
    note = "Elevated gaze shifts detected away from interview screen.";
  } else if (riskScore >= 20) {
    riskLevel = "Moderate Risk";
    note = "Occasional repetitive shifts or higher than average shift frequency.";
  }

  return {
    pattern,
    description,
    severity,
    riskScore,
    riskLevel,
    note,
  };
}

const EMPTY_BEHAVIOR = {
  frequency: {
    shiftsPerMinute: 0,
    totalShifts: 0,
    classification: { level: "Calibrating", label: "Calibrating…", severity: "idle" },
    directionDistribution: { Center: 100, Left: 0, Right: 0, Up: 0, Down: 0 },
  },
  duration: {
    currentDurationMs: 0,
    averageFixationMs: 0,
    cumulativeDurationsMs: { Center: 0, Left: 0, Right: 0, Up: 0, Down: 0 },
    centerPercent: 100,
    offCenterPercent: 0,
    maxOffCenterDurationMs: 0,
    totalMonitoredMs: 0,
  },
  repeatedShifts: {
    detected: false,
    targetDirection: null,
    cycleCount: 0,
    severity: "idle",
    message: "No repeated shifts detected",
    windowSeconds: 15,
  },
  temporalPattern: {
    pattern: "Calibrating",
    description: "Initializing gaze behavioral monitoring…",
    severity: "idle",
    riskScore: 0,
    riskLevel: "Low Risk",
    note: "No signals evaluated yet.",
    recentWindows: [],
  },
};

const EMPTY_OUTPUT = {
  faces: [],
  summary: EMPTY_BEHAVIOR,
  alerts: [],
  evidenceEvents: [],
  risk: { score: 0, maxScore: 100, level: "Low Risk", note: "No signals evaluated yet." },
};

/**
 * Hook to analyze gaze behavior:
 * - Gaze frequency (shifts/min, distribution, level)
 * - Gaze duration (cumulative, average fixation, center/off-center ratios, max dwell)
 * - Repeated gaze shifts (oscillation detection, cycle count, target direction)
 * - Temporal gaze patterns (behavior classification, sliding windows, integrity risk)
 */
export function useGazeBehaviorAnalysis(faces, timestamp, active) {
  const behaviorStateRef = useRef(new Map());
  const alertsRef = useRef([]);
  const evidenceRef = useRef([]);
  const [output, setOutput] = useState(EMPTY_OUTPUT);

  useEffect(() => {
    if (!active) {
      behaviorStateRef.current = new Map();
      alertsRef.current = [];
      evidenceRef.current = [];
      setOutput(EMPTY_OUTPUT);
      return;
    }

    if (!faces || faces.length === 0 || timestamp === null || timestamp === undefined) {
      return;
    }

    const stateMap = behaviorStateRef.current;
    const seenIds = new Set();
    let currentAlerts = [...alertsRef.current];
    let currentEvidence = [...evidenceRef.current];
    let alertsChanged = false;
    let evidenceChanged = false;

    const outFaces = faces.map((face) => {
      seenIds.add(face.id);
      const gaze = face.gaze;
      if (!gaze || !gaze.available) {
        return {
          ...face,
          gaze: {
            ...gaze,
            behavior: EMPTY_BEHAVIOR,
          },
        };
      }

      let state = stateMap.get(face.id);
      if (!state) {
        state = {
          lastDirection: gaze.direction,
          lastTimestamp: timestamp,
          transitions: [],
          fixations: [],
          cumulativeDurationsMs: { Center: 0, Left: 0, Right: 0, Up: 0, Down: 0 },
          totalMonitoredMs: 0,
          maxOffCenterDurationMs: 0,
          lastRepeatedDetectedAt: 0,
          lastRepeatedState: null,
          hasAlertedLookAwayForThisEpisode: false,
          buckets: [],
          currentBucket: {
            startTime: timestamp,
            transitionsCount: 0,
            dominantDirectionCount: { Center: 0, Left: 0, Right: 0, Up: 0, Down: 0 },
          },
        };
        stateMap.set(face.id, state);
      }

      // Compute frame time delta
      const deltaMs = Math.min(Math.max(0, timestamp - state.lastTimestamp), 1000);
      state.lastTimestamp = timestamp;

      // Accumulate cumulative duration
      if (deltaMs > 0) {
        state.cumulativeDurationsMs[gaze.direction] =
          (state.cumulativeDurationsMs[gaze.direction] || 0) + deltaMs;
        state.totalMonitoredMs += deltaMs;

        if (state.currentBucket) {
          state.currentBucket.dominantDirectionCount[gaze.direction] =
            (state.currentBucket.dominantDirectionCount[gaze.direction] || 0) + deltaMs;
        }
      }

      // Track direction changes
      if (gaze.direction !== state.lastDirection) {
        const from = state.lastDirection;
        const to = gaze.direction;
        const fixationDuration = gaze.durationMs || deltaMs;

        state.fixations = [
          { direction: from, durationMs: fixationDuration, timestamp },
          ...state.fixations,
        ].slice(0, MAX_STORED_FIXATIONS);

        state.transitions = [
          { from, to, timestamp },
          ...state.transitions,
        ].slice(0, MAX_STORED_TRANSITIONS);

        if (state.currentBucket) {
          state.currentBucket.transitionsCount += 1;
        }

        state.lastDirection = to;
        state.hasAlertedLookAwayForThisEpisode = false;
      }

      // Update max off-center duration
      if (gaze.direction !== "Center" && gaze.durationMs > state.maxOffCenterDurationMs) {
        state.maxOffCenterDurationMs = gaze.durationMs;
      }

      // Check temporal 10s bucket rollover
      if (state.currentBucket && timestamp - state.currentBucket.startTime >= TEMPORAL_BUCKET_MS) {
        const counts = state.currentBucket.dominantDirectionCount;
        let dominant = "Center";
        let maxCount = 0;
        let totalBucketMs = 0;
        for (const [dir, ms] of Object.entries(counts)) {
          totalBucketMs += ms;
          if (ms > maxCount) {
            maxCount = ms;
            dominant = dir;
          }
        }
        const offCenterMs = totalBucketMs - (counts.Center || 0);
        const offCenterPct = totalBucketMs > 0 ? Math.round((offCenterMs / totalBucketMs) * 100) : 0;

        const bucketSummary = {
          timestamp: formatTime(state.currentBucket.startTime),
          dominantDirection: dominant,
          shiftCount: state.currentBucket.transitionsCount,
          offCenterPercent: offCenterPct,
        };

        state.buckets = [bucketSummary, ...state.buckets].slice(0, MAX_TIMELINE_BUCKETS);
        state.currentBucket = {
          startTime: timestamp,
          transitionsCount: 0,
          dominantDirectionCount: { Center: 0, Left: 0, Right: 0, Up: 0, Down: 0 },
        };
      }

      // 1. Calculate Gaze Frequency
      const recentTransitions = state.transitions.filter(
        (t) => timestamp - t.timestamp <= FREQUENCY_WINDOW_MS
      );
      const effectiveWindowSeconds = Math.max(5, Math.min(60, state.totalMonitoredMs / 1000));
      const shiftsPerMinute = Math.round((recentTransitions.length / effectiveWindowSeconds) * 60);
      const frequencyClassification = classifyFrequency(shiftsPerMinute, state.totalMonitoredMs);

      // Directional distribution of shifts
      const dirCount = { Center: 0, Left: 0, Right: 0, Up: 0, Down: 0 };
      recentTransitions.forEach((t) => {
        if (dirCount[t.to] !== undefined) dirCount[t.to] += 1;
      });
      const totalRecentShifts = recentTransitions.length || 1;
      const directionDistribution = {
        Center: Math.round(((dirCount.Center || 0) / totalRecentShifts) * 100),
        Left: Math.round(((dirCount.Left || 0) / totalRecentShifts) * 100),
        Right: Math.round(((dirCount.Right || 0) / totalRecentShifts) * 100),
        Up: Math.round(((dirCount.Up || 0) / totalRecentShifts) * 100),
        Down: Math.round(((dirCount.Down || 0) / totalRecentShifts) * 100),
      };

      // 2. Calculate Gaze Duration
      const totalMon = Math.max(1, state.totalMonitoredMs);
      const centerPercent = Math.round(((state.cumulativeDurationsMs.Center || 0) / totalMon) * 100);
      const offCenterPercent = 100 - centerPercent;

      const avgFixationMs =
        state.fixations.length > 0
          ? Math.round(
              state.fixations.reduce((sum, f) => sum + f.durationMs, 0) / state.fixations.length
            )
          : gaze.durationMs;

      const durationStats = {
        currentDurationMs: gaze.durationMs,
        averageFixationMs: avgFixationMs,
        cumulativeDurationsMs: { ...state.cumulativeDurationsMs },
        centerPercent,
        offCenterPercent,
        maxOffCenterDurationMs: state.maxOffCenterDurationMs,
        totalMonitoredMs: state.totalMonitoredMs,
      };

      // 3. Repeated Gaze Shifts Detection
      const liveRepeated = detectRepeatedShifts(state.transitions, timestamp);
      let repeatedShifts = liveRepeated;

      if (liveRepeated.detected) {
        state.lastRepeatedDetectedAt = timestamp;
        state.lastRepeatedState = liveRepeated;
      } else if (
        state.lastRepeatedState &&
        timestamp - state.lastRepeatedDetectedAt < REPEATED_SHIFT_HOLD_MS
      ) {
        // Hold the repeated shift flag for REPEATED_SHIFT_HOLD_MS to avoid flickering
        repeatedShifts = state.lastRepeatedState;
      }

      // Check if we should emit an alert for repeated shifts
      if (liveRepeated.detected && liveRepeated.cycleCount >= MIN_CYCLES_FOR_ALERT) {
        const lastAlert = currentAlerts[0];
        const isRecentDuplicate =
          lastAlert &&
          lastAlert.type === "Repeated Gaze Shifts" &&
          timestamp - (state.lastAlertTimestamp || 0) < 6000;

        if (!isRecentDuplicate) {
          state.lastAlertTimestamp = timestamp;
          const newAlert = {
            id: `alert-gaze-${nextAlertId++}`,
            timestamp: formatTime(timestamp),
            type: "Repeated Gaze Shifts",
            severity: liveRepeated.severity === "critical" ? "critical" : "warning",
            description: liveRepeated.message,
          };
          currentAlerts = [newAlert, ...currentAlerts].slice(0, MAX_ALERTS);
          alertsChanged = true;

          const newEvidence = {
            id: `ev-gaze-${nextEvidenceId++}`,
            timestamp: formatTime(timestamp),
            type: "Repeated Gaze Shift",
            source: "Gaze Analyzer",
            confidence: 94,
            duration: `${liveRepeated.windowSeconds}s window`,
            severity: liveRepeated.severity === "critical" ? "critical" : "medium",
          };
          currentEvidence = [newEvidence, ...currentEvidence].slice(0, MAX_EVIDENCE);
          evidenceChanged = true;
        }
      }

      // Check if we should emit an alert for prolonged look-away (>3.0s)
      if (
        gaze.isLookingAway &&
        gaze.durationMs >= 3000 &&
        !state.hasAlertedLookAwayForThisEpisode
      ) {
        state.hasAlertedLookAwayForThisEpisode = true;
        const newAlert = {
          id: `alert-lookaway-${nextAlertId++}`,
          timestamp: formatTime(timestamp),
          type: "Gaze Diversion",
          severity: "warning",
          description: `Candidate diverted gaze (${gaze.direction}) continuously for ${(gaze.durationMs / 1000).toFixed(1)}s`,
        };
        currentAlerts = [newAlert, ...currentAlerts].slice(0, MAX_ALERTS);
        alertsChanged = true;

        const newEvidence = {
          id: `ev-lookaway-${nextEvidenceId++}`,
          timestamp: formatTime(timestamp),
          type: "Prolonged Look-Away",
          source: "Gaze Analyzer",
          confidence: 91,
          duration: `${(gaze.durationMs / 1000).toFixed(1)}s`,
          severity: "medium",
        };
        currentEvidence = [newEvidence, ...currentEvidence].slice(0, MAX_EVIDENCE);
        evidenceChanged = true;
      }

      // 4. Temporal Gaze Patterns & Integrity Risk
      const temporalPattern = classifyTemporalPattern({
        currentDirection: gaze.direction,
        currentDurationMs: gaze.durationMs,
        isLookingAway: gaze.isLookingAway,
        frequency: {
          shiftsPerMinute,
          level: frequencyClassification.level,
        },
        duration: durationStats,
        repeatedShifts,
      });

      const behavior = {
        frequency: {
          shiftsPerMinute,
          totalShifts: state.transitions.length,
          classification: frequencyClassification,
          directionDistribution,
        },
        duration: durationStats,
        repeatedShifts,
        temporalPattern: {
          ...temporalPattern,
          recentWindows: state.buckets,
        },
      };

      return {
        ...face,
        gaze: {
          ...gaze,
          behavior,
        },
      };
    });

    // Clean up untracked face states
    Array.from(stateMap.keys()).forEach((id) => {
      if (!seenIds.has(id)) stateMap.delete(id);
    });

    if (alertsChanged) alertsRef.current = currentAlerts;
    if (evidenceChanged) evidenceRef.current = currentEvidence;

    const primaryFace = outFaces[0];
    const summary = primaryFace?.gaze?.behavior ?? EMPTY_BEHAVIOR;
    const risk = {
      score: summary.temporalPattern.riskScore,
      maxScore: 100,
      level: summary.temporalPattern.riskLevel,
      note: summary.temporalPattern.note,
    };

    setOutput({
      faces: outFaces,
      summary,
      alerts: alertsRef.current,
      evidenceEvents: evidenceRef.current,
      risk,
    });
  }, [faces, timestamp, active]);

  return output;
}
