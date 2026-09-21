import { useEffect, useRef, useState } from "react";
import { SMOOTHING_ALPHA } from "./useFaceTracking";

// iBUG/dlib 68-point indices for each eye, the same raw ordering face-api.js's
// landmark model already returns (Phase 9's landmarks.points).
const RIGHT_EYE_INDICES = [36, 37, 38, 39, 40, 41];
const LEFT_EYE_INDICES = [42, 43, 44, 45, 46, 47];

// Eye-aspect-ratio (EAR) hysteresis band for blink detection: entering
// "closed" requires dropping below the lower threshold, confirming recovery
// (and committing the blink event) requires rising above the higher one.
// Hysteresis (rather than a consecutive-frame count) is used here because a
// real blink is often shorter than our ~300ms detection cadence, so it may
// only ever register as a single low sample — the dip-then-recover pattern
// itself is what confirms a genuine blink versus landmark noise. Blink state
// transitions are checked against the raw (unsmoothed) per-frame openness,
// not the smoothed value exposed for display — smoothing is designed to damp
// exactly this kind of brief transient, which would otherwise make genuine
// blinks too weak to cross the threshold.
const EAR_CLOSE_THRESHOLD = 0.19;
const EAR_OPEN_THRESHOLD = 0.23;

const MAX_EVENTS = 8;

// The darkest ~25% of pixels within a padded eye crop approximate the
// iris/pupil (consistently darker than sclera or skin) — a simple, explainable
// heuristic rather than a dedicated iris landmark model.
const IRIS_DARK_PERCENTILE = 0.25;
const EYE_CROP_PADDING = 0.35;

const EMPTY_OUTPUT = { faces: [], events: [] };

let nextEventId = 0;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(previous, next, alpha) {
  return previous + (next - previous) * alpha;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Standard Soukupová & Čech eye-aspect-ratio: vertical eyelid distance over
// horizontal eye width. Drops sharply as the eye closes.
function eyeAspectRatio(points, indices) {
  const [p1, p2, p3, p4, p5, p6] = indices.map((i) => points[i]);
  const vertical = distance(p2, p6) + distance(p3, p5);
  const horizontal = distance(p1, p4) * 2;
  return horizontal === 0 ? 0 : vertical / horizontal;
}

function eyeBounds(points, indices) {
  const pts = indices.map((i) => points[i]);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const padX = width * EYE_CROP_PADDING;
  const padY = height * EYE_CROP_PADDING;
  return {
    minX: minX - padX,
    minY: minY - padY,
    width: width + padX * 2,
    height: height + padY * 2,
  };
}

function estimateIrisCenter(ctx, video, bounds) {
  if (!ctx || !video || !video.videoWidth) return null;

  const srcX = Math.max(0, Math.floor(bounds.minX));
  const srcY = Math.max(0, Math.floor(bounds.minY));
  const srcW = Math.max(1, Math.ceil(bounds.width));
  const srcH = Math.max(1, Math.ceil(bounds.height));

  if (srcX + srcW > video.videoWidth || srcY + srcH > video.videoHeight) return null;

  ctx.canvas.width = srcW;
  ctx.canvas.height = srcH;
  ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, srcW, srcH);
  } catch {
    return null;
  }

  const { data } = imageData;
  const pixelCount = srcW * srcH;
  const luminances = new Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    luminances[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const sorted = [...luminances].sort((a, b) => a - b);
  const cutoffIndex = Math.max(0, Math.floor(sorted.length * IRIS_DARK_PERCENTILE) - 1);
  const threshold = sorted[cutoffIndex];

  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      if (luminances[y * srcW + x] <= threshold) {
        sumX += x;
        sumY += y;
        count += 1;
      }
    }
  }

  if (count === 0) return null;
  return { x: srcX + sumX / count, y: srcY + sumY / count };
}

function buildRawEye(points, indices, video, ctx) {
  const bounds = eyeBounds(points, indices);
  return {
    points: indices.map((i) => points[i]),
    openness: eyeAspectRatio(points, indices),
    bounds,
    iris: estimateIrisCenter(ctx, video, bounds),
  };
}

function initEyeState(raw) {
  return {
    points: raw?.points ?? [],
    openness: raw?.openness ?? 0,
    bounds: raw?.bounds ?? null,
    irisPosition: raw?.iris ?? { x: 0, y: 0 },
    irisAvailable: Boolean(raw?.iris),
    available: Boolean(raw),
    blinkState: "open",
  };
}

function updateEyeState(state, raw) {
  let justBlinked = false;

  if (raw) {
    state.points = raw.points;
    state.openness = lerp(state.openness, raw.openness, SMOOTHING_ALPHA);
    state.bounds = raw.bounds;
    state.available = true;

    if (raw.iris) {
      state.irisPosition = {
        x: lerp(state.irisPosition.x, raw.iris.x, SMOOTHING_ALPHA),
        y: lerp(state.irisPosition.y, raw.iris.y, SMOOTHING_ALPHA),
      };
      state.irisAvailable = true;
    } else {
      state.irisAvailable = false;
    }

    if (state.blinkState === "open" && raw.openness < EAR_CLOSE_THRESHOLD) {
      state.blinkState = "closed";
    } else if (state.blinkState === "closed" && raw.openness > EAR_OPEN_THRESHOLD) {
      state.blinkState = "open";
      justBlinked = true;
    }
  } else {
    // Landmarks unavailable this cycle (e.g. within the Phase 8 grace period) —
    // hold the last known smoothed openness/iris position rather than recomputing.
    state.available = false;
    state.irisAvailable = false;
  }

  return justBlinked;
}

function toPublicEye(state) {
  let normalized = { x: 0, y: 0 };
  if (state.bounds && state.irisAvailable) {
    const bx = (state.irisPosition.x - state.bounds.minX) / state.bounds.width;
    const by = (state.irisPosition.y - state.bounds.minY) / state.bounds.height;
    normalized = { x: clamp(bx * 2 - 1, -1, 1), y: clamp(by * 2 - 1, -1, 1) };
  }

  return {
    points: state.points,
    openness: state.openness,
    iris: {
      position: { x: state.irisPosition.x, y: state.irisPosition.y },
      normalized,
      available: state.irisAvailable,
    },
    available: state.available,
  };
}

/**
 * Eye/iris tracking per tracked face, built on the existing Phase 9 landmarks
 * and Phase 8 tracking ids — no new detection loop. Iris position is estimated
 * via simple darkest-pixel-cluster analysis of a cropped eye region from the
 * existing video element (no additional ML model). Eye openness uses the
 * standard eye-aspect-ratio (EAR) formula. Blinks are detected via an EAR
 * hysteresis band (dip below a lower threshold, confirmed by recovery above a
 * higher one) rather than a consecutive-frame count, since a real blink can be
 * shorter than the detection interval.
 */
export function useEyeTracking(videoRef, trackingResult, active) {
  const canvasRef = useRef(null);
  const eyeStateRef = useRef(new Map());
  const eventsRef = useRef([]);
  const [output, setOutput] = useState(EMPTY_OUTPUT);

  useEffect(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
  }, []);

  useEffect(() => {
    if (!active) {
      eyeStateRef.current = new Map();
      eventsRef.current = [];
      setOutput(EMPTY_OUTPUT);
      return;
    }

    if (!trackingResult || trackingResult.timestamp === null) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext("2d", { willReadFrequently: true }) : null;
    const eyeState = eyeStateRef.current;
    const seenIds = new Set();
    let events = eventsRef.current;
    let eventsChanged = false;

    const faces = trackingResult.faces.map((face) => {
      seenIds.add(face.id);

      let state = eyeState.get(face.id);
      const hasLandmarks = face.landmarks?.available && face.landmarks.points.length >= 68;
      const points = hasLandmarks ? face.landmarks.points : null;

      const rawRight = points ? buildRawEye(points, RIGHT_EYE_INDICES, video, ctx) : null;
      const rawLeft = points ? buildRawEye(points, LEFT_EYE_INDICES, video, ctx) : null;

      if (!state) {
        state = { left: initEyeState(rawLeft), right: initEyeState(rawRight) };
        eyeState.set(face.id, state);
      }

      const leftJustBlinked = updateEyeState(state.left, rawLeft);
      const rightJustBlinked = updateEyeState(state.right, rawRight);

      if (leftJustBlinked || rightJustBlinked) {
        const eye = leftJustBlinked && rightJustBlinked ? "both" : leftJustBlinked ? "left" : "right";
        events = [
          { id: `blink-${nextEventId++}`, faceId: face.id, eye, timestamp: trackingResult.timestamp },
          ...events,
        ].slice(0, MAX_EVENTS);
        eventsChanged = true;
      }

      return {
        ...face,
        eyes: { left: toPublicEye(state.left), right: toPublicEye(state.right) },
      };
    });

    Array.from(eyeState.keys()).forEach((id) => {
      if (!seenIds.has(id)) eyeState.delete(id);
    });

    if (eventsChanged) {
      eventsRef.current = events;
    }

    setOutput({ faces, events: eventsRef.current });
  }, [trackingResult, active, videoRef]);

  return output;
}