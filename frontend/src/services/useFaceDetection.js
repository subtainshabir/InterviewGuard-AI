import { useCallback, useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

const MODEL_URL = "/models";
const DETECTION_INTERVAL_MS = 300;
const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
  inputSize: 224,
  scoreThreshold: 0.5,
});

const EMPTY_RESULT = { faces: [], count: 0, status: "no_face", timestamp: null };

let modelLoadPromise = null;

function loadModel() {
  if (!modelLoadPromise) {
    modelLoadPromise = faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL).catch((err) => {
      modelLoadPromise = null;
      throw err;
    });
  }
  return modelLoadPromise;
}

function buildResult(detections) {
  const faces = detections.map((detection, index) => ({
    id: `face-${index}`,
    boundingBox: {
      x: detection.box.x,
      y: detection.box.y,
      width: detection.box.width,
      height: detection.box.height,
    },
    confidence: detection.score,
  }));

  let status = "no_face";
  if (faces.length === 1) status = "face_detected";
  else if (faces.length > 1) status = "multiple_faces";

  return { faces, count: faces.length, status, timestamp: Date.now() };
}

export function useFaceDetection(videoRef, active) {
  const [modelStatus, setModelStatus] = useState("loading");
  const [result, setResult] = useState(EMPTY_RESULT);
  const intervalRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadModel()
      .then(() => {
        if (!cancelled) setModelStatus("ready");
      })
      .catch((err) => {
        console.error("Face detector model failed to load:", err);
        if (!cancelled) setModelStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runDetection = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    try {
      const detections = await faceapi.detectAllFaces(video, DETECTOR_OPTIONS);
      setResult(buildResult(detections));
    } catch {
      // Ignore transient per-frame detection errors; the loop continues.
    }
  }, [videoRef]);

  useEffect(() => {
    if (!active || modelStatus !== "ready") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setResult(EMPTY_RESULT);
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

  return { modelStatus, result };
}