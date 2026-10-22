import { useCallback, useEffect, useRef, useState } from "react";
import { loadYoloModel, detectYolo } from "./yoloDetector";
import {
  DEFAULT_UNAUTHORIZED_RULES,
  evaluateObjectRule,
  normalizeObjectClass,
} from "./unauthorizedObjectRules";

const DETECTION_INTERVAL_MS = 600;
const MIN_SCORE_THRESHOLD = 0.30;
const MATCH_DISTANCE_FACTOR = 0.85;
const GRACE_PERIOD_FRAMES = 2; // ~1.2s grace before object drop
const MAX_CONFIDENCE_HISTORY = 10;
const MAX_ACTIVITY_LOG = 15;
const MAX_ALERTS = 10;
const MAX_EVIDENCE = 10;
const PERSISTENT_THRESHOLD_MS = 3000;      // 3s sustained detection confirms persistent object
const HIGHLY_PERSISTENT_THRESHOLD_MS = 15000; // 15s sustained indicates stationary object

let nextTrackId = 1;
let nextAlertId = 1;
let nextEvidenceId = 1;
let nextEventId = 1;

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

function boxCenter(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
}

function lerpBox(prev, next, alpha = 0.4) {
  return {
    x: lerp(prev.x, next.x, alpha),
    y: lerp(prev.y, next.y, alpha),
    width: lerp(prev.width, next.width, alpha),
    height: lerp(prev.height, next.height, alpha),
  };
}

function calculateTrend(history) {
  if (history.length < 3) return "stable";
  const first = history[0];
  const last = history[history.length - 1];
  if (last > first + 6) return "rising";
  if (last < first - 6) return "falling";
  return "stable";
}

const EMPTY_SUMMARY = {
  count: 0,
  prohibitedCount: 0,
  persistentCount: 0,
  hasProhibited: false,
  objectsList: [],
  exitedObjects: [],
  activityLog: [],
  timestamp: null,
};

const EMPTY_OUTPUT = {
  modelStatus: "loading",
  objects: [],
  exitedObjects: [],
  activityLog: [],
  summary: EMPTY_SUMMARY,
  rules: DEFAULT_UNAUTHORIZED_RULES,
  alerts: [],
  evidenceEvents: [],
  risk: { score: 0, maxScore: 100, level: "Low Risk", note: "No unauthorized objects detected." },
};

/**
 * Object Event Tracking & Detection hook:
 * - Real-time spatial tracking across frames with persistent track IDs
 * - First detection & last detection timestamps
 * - Continuous presence duration & cumulative time
 * - Rolling confidence history with trend analysis (avg, peak, trend)
 * - Persistent object classification (transient vs persistent vs highly persistent)
 * - Configurable rules matching, alerts, and evidence timeline logging
 */
export function useObjectDetection(videoRef, active, initialRules = DEFAULT_UNAUTHORIZED_RULES) {
  const [modelStatus, setModelStatus] = useState("loading");
  const [rules, setRules] = useState(initialRules);
  const [output, setOutput] = useState(EMPTY_OUTPUT);

  const modelRef = useRef(null);
  const intervalRef = useRef(null);
  const tracksRef = useRef([]);
  const exitedObjectsRef = useRef([]);
  const activityLogRef = useRef([]);
  const alertsRef = useRef([]);
  const evidenceRef = useRef([]);
  const lastAlertedObjectsRef = useRef(new Map());

  // Load Model
  useEffect(() => {
    let cancelled = false;
    loadYoloModel()
      .then((session) => {
        if (!cancelled) {
          modelRef.current = session;
          setModelStatus("ready");
        }
      })
      .catch((err) => {
        console.error("[useObjectDetection] YOLO11 model load failed:", err);
        if (!cancelled) {
          setModelStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Real-time Detection Loop with Object Event Tracking
  const runDetection = useCallback(async () => {
    const video = videoRef.current;
    const session = modelRef.current;
    if (!video || video.readyState < 2 || !session) return;

    try {
      const rawDetections = await detectYolo(session, video, MIN_SCORE_THRESHOLD);
      const timestamp = Date.now();

      // Filter and evaluate raw detections
      const rawCandidates = rawDetections
        .filter((d) => d.class !== "person")
        .map((d) => {
          const [x, y, width, height] = d.bbox;
          let rawClass = d.class.toLowerCase();

          // Tablet vs Phone Heuristic: large dimensions/aspect ratio
          if (rawClass === "cell phone" && width > 130 && height > 160) {
            rawClass = "tablet";
          }

          const ruleEvaluation = evaluateObjectRule(rawClass, d.score, rules);
          const isProhibited = ruleEvaluation.matched;
          const label = ruleEvaluation.displayName || normalizeObjectClass(d.class);

          return {
            rawClass,
            label,
            ruleId: ruleEvaluation.ruleId,
            ruleName: ruleEvaluation.ruleName,
            category: isProhibited ? "prohibited" : "neutral",
            isProhibited,
            severity: ruleEvaluation.severity,
            riskPenalty: ruleEvaluation.riskPenalty,
            confidence: d.score,
            confidencePercent: Math.round(d.score * 100),
            box: { x, y, width, height },
          };
        });

      // Spatial Matching against existing persistent tracks
      const currentTracks = tracksRef.current;
      const matchedTrackIndices = new Set();
      const matchedRawIndices = new Set();
      let currentActivity = [...activityLogRef.current];
      let activityChanged = false;

      // 1. Match candidates to closest existing track with same label/class
      rawCandidates.forEach((raw, rawIdx) => {
        const rawCenter = boxCenter(raw.box);
        let bestTrackIdx = -1;
        let bestDistance = Infinity;

        currentTracks.forEach((track, trackIdx) => {
          if (matchedTrackIndices.has(trackIdx)) return;
          if (track.rawClass !== raw.rawClass && track.label !== raw.label) return;

          const trackCenter = boxCenter(track.box);
          const dist = distance(rawCenter, trackCenter);
          const maxDim = Math.max(raw.box.width, track.box.width);
          const threshold = maxDim * MATCH_DISTANCE_FACTOR;

          if (dist <= threshold && dist < bestDistance) {
            bestDistance = dist;
            bestTrackIdx = trackIdx;
          }
        });

        if (bestTrackIdx >= 0) {
          matchedTrackIndices.add(bestTrackIdx);
          matchedRawIndices.add(rawIdx);

          const track = currentTracks[bestTrackIdx];
          track.box = lerpBox(track.box, raw.box, 0.4);
          track.lastDetectedAt = timestamp;
          track.lastDetectedFormatted = formatTime(timestamp);
          track.durationMs = Math.max(0, timestamp - track.firstDetectedAt);
          track.durationFormatted = formatDurationSec(track.durationMs);
          track.confidence = raw.confidence;
          track.confidencePercent = raw.confidencePercent;
          track.missedFrames = 0;

          // Update confidence history
          track.confidenceHistory = [
            ...track.confidenceHistory,
            raw.confidencePercent,
          ].slice(-MAX_CONFIDENCE_HISTORY);

          track.avgConfidence = Math.round(
            track.confidenceHistory.reduce((a, b) => a + b, 0) / track.confidenceHistory.length
          );
          track.peakConfidence = Math.max(...track.confidenceHistory);
          track.confidenceTrend = calculateTrend(track.confidenceHistory);

          // Persistence classification
          const prevPersistence = track.persistence;
          if (track.durationMs >= HIGHLY_PERSISTENT_THRESHOLD_MS) {
            track.persistence = "highly_persistent";
          } else if (track.durationMs >= PERSISTENT_THRESHOLD_MS) {
            track.persistence = "persistent";
          } else {
            track.persistence = "transient";
          }
          track.isPersistent = track.persistence !== "transient";

          // Check if persistence just escalated to trigger activity event
          if (prevPersistence === "transient" && track.persistence === "persistent") {
            currentActivity = [
              {
                id: `act-persist-${nextEventId++}`,
                type: "persistent_confirmed",
                label: track.label,
                isProhibited: track.isProhibited,
                timestamp,
                timeFormatted: formatTime(timestamp),
                durationFormatted: track.durationFormatted,
                message: `Persistent object confirmed: ${track.label} (in view > 3s)`,
              },
              ...currentActivity,
            ].slice(0, MAX_ACTIVITY_LOG);
            activityChanged = true;
          } else if (
            prevPersistence === "persistent" &&
            track.persistence === "highly_persistent"
          ) {
            currentActivity = [
              {
                id: `act-high-persist-${nextEventId++}`,
                type: "highly_persistent",
                label: track.label,
                isProhibited: track.isProhibited,
                timestamp,
                timeFormatted: formatTime(timestamp),
                durationFormatted: track.durationFormatted,
                message: `Stationary object confirmed: ${track.label} (in view > 15s)`,
              },
              ...currentActivity,
            ].slice(0, MAX_ACTIVITY_LOG);
            activityChanged = true;
          }
        }
      });

      // 2. Handle unmatched existing tracks (age out or mark as last detection/exit)
      const survivingTracks = [];
      let currentExits = [...exitedObjectsRef.current];
      let exitsChanged = false;

      currentTracks.forEach((track, trackIdx) => {
        if (matchedTrackIndices.has(trackIdx)) {
          survivingTracks.push(track);
          return;
        }

        track.missedFrames += 1;
        if (track.missedFrames <= GRACE_PERIOD_FRAMES) {
          // Grace period: retain track to prevent flicker
          survivingTracks.push(track);
        } else {
          // Last detection & Exit confirmed
          const exitEvent = {
            id: `act-exit-${nextEventId++}`,
            type: "last_detection",
            label: track.label,
            isProhibited: track.isProhibited,
            timestamp,
            timeFormatted: formatTime(timestamp),
            durationFormatted: formatDurationSec(track.durationMs),
            message: `${track.label} removed from frame (Total presence: ${formatDurationSec(
              track.durationMs
            )})`,
          };
          currentActivity = [exitEvent, ...currentActivity].slice(0, MAX_ACTIVITY_LOG);
          activityChanged = true;

          currentExits = [
            {
              id: track.id,
              label: track.label,
              isProhibited: track.isProhibited,
              severity: track.severity,
              firstDetectedFormatted: track.firstDetectedFormatted,
              lastDetectedFormatted: formatTime(timestamp),
              totalDurationFormatted: formatDurationSec(track.durationMs),
              peakConfidence: track.peakConfidence,
            },
            ...currentExits,
          ].slice(0, 6);
          exitsChanged = true;
        }
      });

      // 3. Unmatched raw detections become new persistent tracks (First Detection)
      rawCandidates.forEach((raw, rawIdx) => {
        if (matchedRawIndices.has(rawIdx)) return;

        const newTrack = {
          id: `obj-track-${nextTrackId++}`,
          label: raw.label,
          rawClass: raw.rawClass,
          ruleId: raw.ruleId,
          ruleName: raw.ruleName,
          category: raw.category,
          isProhibited: raw.isProhibited,
          severity: raw.severity,
          riskPenalty: raw.riskPenalty,
          box: raw.box,
          confidence: raw.confidence,
          confidencePercent: raw.confidencePercent,
          confidenceHistory: [raw.confidencePercent],
          avgConfidence: raw.confidencePercent,
          peakConfidence: raw.confidencePercent,
          confidenceTrend: "stable",
          firstDetectedAt: timestamp,
          firstDetectedFormatted: formatTime(timestamp),
          lastDetectedAt: timestamp,
          lastDetectedFormatted: formatTime(timestamp),
          durationMs: 0,
          durationFormatted: "0s",
          persistence: "transient",
          isPersistent: false,
          missedFrames: 0,
        };

        survivingTracks.push(newTrack);

        // Record First Detection event
        currentActivity = [
          {
            id: `act-first-${nextEventId++}`,
            type: "first_detection",
            label: raw.label,
            isProhibited: raw.isProhibited,
            timestamp,
            timeFormatted: formatTime(timestamp),
            confidence: raw.confidencePercent,
            message: raw.isProhibited
              ? `⚠️ First detection: Unauthorized ${raw.label} (${raw.confidencePercent}%)`
              : `First detection: Permitted ${raw.label} (${raw.confidencePercent}%)`,
          },
          ...currentActivity,
        ].slice(0, MAX_ACTIVITY_LOG);
        activityChanged = true;
      });

      tracksRef.current = survivingTracks;
      if (exitsChanged) exitedObjectsRef.current = currentExits;
      if (activityChanged) activityLogRef.current = currentActivity;

      // 4. Alert & Evidence Handling
      let currentAlerts = [...alertsRef.current];
      let currentEvidence = [...evidenceRef.current];
      let alertsChanged = false;
      let evidenceChanged = false;

      const prohibitedTracks = survivingTracks.filter((t) => t.isProhibited);
      const prohibitedCount = prohibitedTracks.length;
      const persistentProhibited = prohibitedTracks.filter((t) => t.isPersistent);

      prohibitedTracks.forEach((track) => {
        const lastAlerted = lastAlertedObjectsRef.current.get(track.label) || 0;
        // Raise initial alert or persistent alert escalation
        if (timestamp - lastAlerted > 7000) {
          lastAlertedObjectsRef.current.set(track.label, timestamp);

          const alertType = track.isPersistent
            ? "Persistent Unauthorized Object"
            : "Unauthorized Object Detected";

          const newAlert = {
            id: `alert-obj-${nextAlertId++}`,
            timestamp: formatTime(timestamp),
            type: alertType,
            severity: track.severity === "critical" ? "critical" : "warning",
            description: `${track.label} detected in camera feed (Presence: ${track.durationFormatted}, ${track.confidencePercent}% conf)`,
          };
          currentAlerts = [newAlert, ...currentAlerts].slice(0, MAX_ALERTS);
          alertsChanged = true;

          const newEvidence = {
            id: `ev-obj-${nextEvidenceId++}`,
            timestamp: formatTime(timestamp),
            type: alertType,
            source: "Object Event Tracker",
            confidence: track.avgConfidence,
            duration: track.durationFormatted,
            severity: track.severity === "critical" ? "critical" : "high",
          };
          currentEvidence = [newEvidence, ...currentEvidence].slice(0, MAX_EVIDENCE);
          evidenceChanged = true;
        }
      });

      if (alertsChanged) alertsRef.current = currentAlerts;
      if (evidenceChanged) evidenceRef.current = currentEvidence;

      // Format objects for overlay and panel
      const formattedObjects = survivingTracks.map((t) => ({
        id: t.id,
        label: t.label,
        rawClass: t.rawClass,
        category: t.category,
        isProhibited: t.isProhibited,
        severity: t.severity,
        riskPenalty: t.riskPenalty,
        confidence: t.confidence,
        confidencePercent: t.confidencePercent,
        confidenceHistory: t.confidenceHistory,
        avgConfidence: t.avgConfidence,
        peakConfidence: t.peakConfidence,
        confidenceTrend: t.confidenceTrend,
        firstDetectedFormatted: t.firstDetectedFormatted,
        lastDetectedFormatted: t.lastDetectedFormatted,
        durationMs: t.durationMs,
        durationFormatted: t.durationFormatted,
        persistence: t.persistence,
        isPersistent: t.isPersistent,
        boundingBox: t.box,
        timestamp,
      }));

      // Calculate Risk Score
      const totalRisk = prohibitedTracks.reduce(
        (sum, t) => sum + (t.riskPenalty || 35) + (t.isPersistent ? 15 : 0),
        0
      );
      const riskScore = Math.min(100, totalRisk);
      const riskLevel =
        riskScore >= 70 ? "High Risk" : riskScore >= 35 ? "Elevated Risk" : "Low Risk";
      const note = prohibitedCount > 0
        ? `ALERT: ${prohibitedCount} unauthorized item(s) detected (${prohibitedTracks
            .map((p) => `${p.label} [${p.durationFormatted}]`)
            .join(", ")}).`
        : "No unauthorized objects detected.";

      setOutput({
        modelStatus: "ready",
        objects: formattedObjects,
        exitedObjects: exitedObjectsRef.current,
        activityLog: activityLogRef.current,
        summary: {
          count: formattedObjects.length,
          prohibitedCount,
          persistentCount: survivingTracks.filter((t) => t.isPersistent).length,
          hasProhibited: prohibitedCount > 0,
          objectsList: formattedObjects,
          exitedObjects: exitedObjectsRef.current,
          activityLog: activityLogRef.current,
          timestamp,
        },
        rules,
        alerts: alertsRef.current,
        evidenceEvents: evidenceRef.current,
        risk: {
          score: riskScore,
          maxScore: 100,
          level: riskLevel,
          note,
        },
      });
    } catch (err) {
      console.warn("[useObjectDetection] Detection frame error:", err);
    }
  }, [videoRef, rules]);

  // Detection timer loop
  useEffect(() => {
    if (!active || modelStatus !== "ready") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      tracksRef.current = [];
      exitedObjectsRef.current = [];
      activityLogRef.current = [];
      alertsRef.current = [];
      evidenceRef.current = [];
      setOutput(EMPTY_OUTPUT);
      return undefined;
    }

    intervalRef.current = setInterval(runDetection, DETECTION_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, modelStatus, runDetection]);

  const toggleRule = useCallback((ruleId) => {
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
    );
  }, []);

  return {
    ...output,
    rules,
    toggleRule,
    setRules,
  };
}
