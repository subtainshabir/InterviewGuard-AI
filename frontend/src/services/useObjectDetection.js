import { useCallback, useEffect, useRef, useState } from "react";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import {
  DEFAULT_UNAUTHORIZED_RULES,
  evaluateObjectRule,
  normalizeObjectClass,
} from "./unauthorizedObjectRules";

const DETECTION_INTERVAL_MS = 600;
const MIN_SCORE_THRESHOLD = 0.40;
const MAX_ALERTS = 10;
const MAX_EVIDENCE = 10;

let modelLoadPromise = null;

function loadCocoModel() {
  if (!modelLoadPromise) {
    modelLoadPromise = cocoSsd.load({ base: "lite_mobilenet_v2" }).catch((err) => {
      modelLoadPromise = null;
      throw err;
    });
  }
  return modelLoadPromise;
}

export function formatTime(ms) {
  if (!ms || ms < 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

let nextAlertId = 1;
let nextEvidenceId = 1;

const EMPTY_SUMMARY = {
  count: 0,
  prohibitedCount: 0,
  hasProhibited: false,
  objectsList: [],
  timestamp: null,
};

const EMPTY_OUTPUT = {
  modelStatus: "loading",
  objects: [],
  summary: EMPTY_SUMMARY,
  rules: DEFAULT_UNAUTHORIZED_RULES,
  alerts: [],
  evidenceEvents: [],
  risk: { score: 0, maxScore: 100, level: "Low Risk", note: "No prohibited objects detected." },
};

/**
 * Unauthorized Object Detection service:
 * - Detects Phones, Tablets, Laptops, Second Monitors, Books/Notes, Headphones, Remotes
 * - Matches detections against Configurable Unauthorized Object Rules
 * - Evaluates risk scores, raises security alerts, and logs timeline evidence
 */
export function useObjectDetection(videoRef, active, initialRules = DEFAULT_UNAUTHORIZED_RULES) {
  const [modelStatus, setModelStatus] = useState("loading");
  const [rules, setRules] = useState(initialRules);
  const [output, setOutput] = useState(EMPTY_OUTPUT);
  const modelRef = useRef(null);
  const intervalRef = useRef(null);
  const alertsRef = useRef([]);
  const evidenceRef = useRef([]);
  const lastAlertedObjectsRef = useRef(new Map());

  // Load COCO-SSD Model
  useEffect(() => {
    let cancelled = false;
    loadCocoModel()
      .then((model) => {
        if (!cancelled) {
          modelRef.current = model;
          setModelStatus("ready");
        }
      })
      .catch((err) => {
        console.error("[useObjectDetection] Model load failed:", err);
        if (!cancelled) {
          setModelStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Real-time Detection Loop
  const runDetection = useCallback(async () => {
    const video = videoRef.current;
    const model = modelRef.current;
    if (!video || video.readyState < 2 || !model) return;

    try {
      const rawDetections = await model.detect(video, 12, MIN_SCORE_THRESHOLD);
      const timestamp = Date.now();

      // Filter and map detected objects against configured policy rules
      const objects = rawDetections
        .filter((d) => d.class !== "person") // Person detection is handled by dedicated person pipeline
        .map((d, index) => {
          const [x, y, width, height] = d.bbox;
          let rawClass = d.class.toLowerCase();

          // Tablet vs Phone Heuristic: larger aspect ratio/dimensions
          if (rawClass === "cell phone" && width > 130 && height > 160) {
            rawClass = "tablet";
          }

          const ruleEvaluation = evaluateObjectRule(rawClass, d.score, rules);
          const isProhibited = ruleEvaluation.matched;
          const label = ruleEvaluation.displayName || normalizeObjectClass(d.class);

          return {
            id: `obj-${index}-${rawClass}`,
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
            boundingBox: { x, y, width, height },
            timestamp,
          };
        });

      let currentAlerts = [...alertsRef.current];
      let currentEvidence = [...evidenceRef.current];
      let alertsChanged = false;
      let evidenceChanged = false;

      const prohibitedObjects = objects.filter((o) => o.isProhibited);
      const prohibitedCount = prohibitedObjects.length;
      const hasProhibited = prohibitedCount > 0;

      // Raise alerts for prohibited items
      prohibitedObjects.forEach((obj) => {
        const lastAlerted = lastAlertedObjectsRef.current.get(obj.label) || 0;
        // Throttle to once every 7s per distinct object category
        if (timestamp - lastAlerted > 7000) {
          lastAlertedObjectsRef.current.set(obj.label, timestamp);

          const newAlert = {
            id: `alert-obj-${nextAlertId++}`,
            timestamp: formatTime(timestamp),
            type: "Unauthorized Object Detected",
            severity: obj.severity === "critical" ? "critical" : "warning",
            description: `${obj.label} detected in camera feed (${obj.confidencePercent}% confidence)`,
          };
          currentAlerts = [newAlert, ...currentAlerts].slice(0, MAX_ALERTS);
          alertsChanged = true;

          const newEvidence = {
            id: `ev-obj-${nextEvidenceId++}`,
            timestamp: formatTime(timestamp),
            type: "Unauthorized Object",
            source: "Object Rules Engine",
            confidence: obj.confidencePercent,
            duration: "Visible in camera",
            severity: obj.severity === "critical" ? "critical" : "medium",
          };
          currentEvidence = [newEvidence, ...currentEvidence].slice(0, MAX_EVIDENCE);
          evidenceChanged = true;
        }
      });

      if (alertsChanged) alertsRef.current = currentAlerts;
      if (evidenceChanged) evidenceRef.current = currentEvidence;

      // Group detected objects by label
      const grouped = {};
      objects.forEach((obj) => {
        if (!grouped[obj.label]) {
          grouped[obj.label] = {
            id: obj.id,
            label: obj.label,
            category: obj.category,
            isProhibited: obj.isProhibited,
            severity: obj.severity,
            confidencePercent: obj.confidencePercent,
            count: 0,
          };
        }
        grouped[obj.label].count += 1;
        grouped[obj.label].confidencePercent = Math.max(
          grouped[obj.label].confidencePercent,
          obj.confidencePercent
        );
      });

      const objectsList = Object.values(grouped);

      const totalRisk = prohibitedObjects.reduce((acc, o) => acc + (o.riskPenalty || 35), 0);
      const riskScore = Math.min(100, totalRisk);
      const riskLevel = riskScore >= 70 ? "High Risk" : riskScore >= 35 ? "Elevated Risk" : "Low Risk";
      const note = hasProhibited
        ? `ALERT: Unauthorized item (${prohibitedObjects.map((p) => p.label).join(", ")}) detected.`
        : "No unauthorized objects detected.";

      setOutput({
        modelStatus: "ready",
        objects,
        summary: {
          count: objects.length,
          prohibitedCount,
          hasProhibited,
          objectsList,
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
    } catch {
      // Ignore transient frame errors
    }
  }, [videoRef, rules]);

  // Interval execution
  useEffect(() => {
    if (!active || modelStatus !== "ready") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
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
