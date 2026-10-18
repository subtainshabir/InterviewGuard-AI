import { useCallback, useEffect, useRef, useState } from "react";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

const DETECTION_INTERVAL_MS = 600;
const MIN_SCORE_THRESHOLD = 0.50;
const MAX_ALERTS = 10;
const MAX_EVIDENCE = 10;

// High-risk prohibited objects in an online interview
export const PROHIBITED_CLASSES = new Set([
  "cell phone",
  "book",
  "laptop",
  "remote",
]);

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
  alerts: [],
  evidenceEvents: [],
  risk: { score: 0, maxScore: 100, level: "Low Risk", note: "No prohibited objects detected." },
};

/**
 * Object Detection Foundation hook:
 * - Loads COCO-SSD lite_mobilenet_v2 object detection model
 * - Runs real-time detection pipeline on camera video stream
 * - Computes normalized/pixel bounding boxes and confidence scores
 * - Classifies objects into Prohibited vs Neutral
 * - Emits security alerts, timeline evidence, and risk escalation
 */
export function useObjectDetection(videoRef, active) {
  const [modelStatus, setModelStatus] = useState("loading");
  const [output, setOutput] = useState(EMPTY_OUTPUT);
  const modelRef = useRef(null);
  const intervalRef = useRef(null);
  const alertsRef = useRef([]);
  const evidenceRef = useRef([]);
  const lastAlertedObjectsRef = useRef(new Map());

  // 1. Model Loading
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
        console.error("[useObjectDetection] Failed to load COCO-SSD model:", err);
        if (!cancelled) {
          setModelStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Real-time Detection Pipeline
  const runDetection = useCallback(async () => {
    const video = videoRef.current;
    const model = modelRef.current;
    if (!video || video.readyState < 2 || !model) return;

    try {
      // Filter out person class since person tracking is handled by dedicated face/person pipeline
      const rawDetections = await model.detect(video, 10, MIN_SCORE_THRESHOLD);
      const timestamp = Date.now();

      const objects = rawDetections
        .filter((d) => d.class !== "person")
        .map((d, index) => {
          const [x, y, width, height] = d.bbox;
          const isProhibited = PROHIBITED_CLASSES.has(d.class.toLowerCase());
          return {
            id: `obj-${index}-${d.class}`,
            label: d.class,
            category: isProhibited ? "prohibited" : "neutral",
            isProhibited,
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

      // 3. Prohibited Object Alerting & Evidence Generation
      prohibitedObjects.forEach((obj) => {
        const lastAlerted = lastAlertedObjectsRef.current.get(obj.label) || 0;
        // Throttle alert to once per 8 seconds per object type
        if (timestamp - lastAlerted > 8000) {
          lastAlertedObjectsRef.current.set(obj.label, timestamp);

          const newAlert = {
            id: `alert-obj-${nextAlertId++}`,
            timestamp: formatTime(timestamp),
            type: "Prohibited Object Detected",
            severity: "critical",
            description: `${obj.label} detected in camera feed (${obj.confidencePercent}% confidence)`,
          };
          currentAlerts = [newAlert, ...currentAlerts].slice(0, MAX_ALERTS);
          alertsChanged = true;

          const newEvidence = {
            id: `ev-obj-${nextEvidenceId++}`,
            timestamp: formatTime(timestamp),
            type: "Prohibited Object",
            source: "Object Detector",
            confidence: obj.confidencePercent,
            duration: "Detected in frame",
            severity: "critical",
          };
          currentEvidence = [newEvidence, ...currentEvidence].slice(0, MAX_EVIDENCE);
          evidenceChanged = true;
        }
      });

      if (alertsChanged) alertsRef.current = currentAlerts;
      if (evidenceChanged) evidenceRef.current = currentEvidence;

      // Group objects by label for summary
      const grouped = {};
      objects.forEach((obj) => {
        if (!grouped[obj.label]) {
          grouped[obj.label] = {
            id: obj.id,
            label: obj.label,
            category: obj.category,
            isProhibited: obj.isProhibited,
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

      const riskScore = hasProhibited ? Math.min(100, 35 * prohibitedCount) : 0;
      const riskLevel = riskScore >= 70 ? "High Risk" : riskScore >= 35 ? "Elevated Risk" : "Low Risk";
      const note = hasProhibited
        ? `ALERT: Prohibited object (${prohibitedObjects.map((p) => p.label).join(", ")}) detected in view.`
        : "No prohibited objects detected.";

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
      // Ignore transient per-frame inference errors
    }
  }, [videoRef]);

  // Loop execution
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

  return output;
}
