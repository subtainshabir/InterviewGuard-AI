import { useEffect, useRef, useState } from "react";
import { SMOOTHING_ALPHA } from "./useFaceTracking";

// Simple bucketed direction thresholds, in degrees.
const YAW_THRESHOLD_DEG = 15;
const PITCH_THRESHOLD_DEG = 12;

// A direction change must be sustained for this many consecutive detection
// cycles before it commits and produces a movement event (avoids firing on a
// single noisy frame).
const SUSTAIN_FRAMES = 2;

const MAX_EVENTS = 8;

// Rough scale factors converting normalized landmark-geometry ratios into
// degree-like units. These are heuristic, not a physically calibrated model —
// see the "Estimation Approach" note in the implementation report.
const YAW_SCALE = 60;
const PITCH_SCALE = 100;

// Flip to -1 if pitch direction ever reads inverted for your camera setup.
const PITCH_SIGN = 1;

// iBUG/dlib 68-point indices, the same raw ordering face-api.js's landmark
// model already returns (Phase 9's landmarks.points).
const NOSE_TIP = 30;
const LEFT_EYE_OUTER = 36;
const RIGHT_EYE_OUTER = 45;
const MOUTH_LEFT = 48;
const MOUTH_RIGHT = 54;

const EMPTY_OUTPUT = { faces: [], events: [] };

let nextEventId = 0;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(previous, next, alpha) {
  return previous + (next - previous) * alpha;
}

/**
 * Lightweight landmark-geometry approximation of head pose (not a full
 * solvePnP 3D fit): roll comes directly from the eye-line angle; yaw and
 * pitch come from the nose tip's position relative to the eye/mouth
 * reference geometry. Intentionally simple and explainable per the spec.
 */
function computeRawPose(points) {
  if (!points || points.length < 68) return null;

  const nose = points[NOSE_TIP];
  const leftEye = points[LEFT_EYE_OUTER];
  const rightEye = points[RIGHT_EYE_OUTER];
  const mouthLeft = points[MOUTH_LEFT];
  const mouthRight = points[MOUTH_RIGHT];

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const eyeSpan = Math.max(Math.abs(rightEye.x - leftEye.x), 1);
  const mouthMidY = (mouthLeft.y + mouthRight.y) / 2;
  const faceHeightRef = Math.max(mouthMidY - eyeMidY, 1);

  const yawRatio = (nose.x - eyeMidX) / (eyeSpan / 2);
  const yaw = clamp(yawRatio * YAW_SCALE, -90, 90);

  const noseFraction = (nose.y - eyeMidY) / faceHeightRef;
  const pitch = clamp((0.5 - noseFraction) * PITCH_SCALE * PITCH_SIGN, -90, 90);

  const rollRadians = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const roll = (rollRadians * 180) / Math.PI;

  return { pitch, yaw, roll };
}

function deriveDirection(pitch, yaw) {
  // The preview is displayed mirrored (scaleX(-1)) for a natural selfie view,
  // but yaw is computed from raw (unmirrored) landmark coordinates. Flip only
  // for this on-screen-facing label so "Left"/"Right" matches what's actually
  // shown, while the raw pitch/yaw/roll values keep one consistent convention.
  const screenYaw = -yaw;

  if (Math.abs(screenYaw) >= Math.abs(pitch) && Math.abs(screenYaw) > YAW_THRESHOLD_DEG) {
    return screenYaw > 0 ? "Right" : "Left";
  }
  if (Math.abs(pitch) > PITCH_THRESHOLD_DEG) {
    return pitch > 0 ? "Up" : "Down";
  }
  return "Center";
}

/**
 * Estimates head pose per tracked face from the existing Phase 9 landmarks,
 * on the same detection cadence — no separate loop. Holds the last known
 * smoothed pose while landmarks are temporarily unavailable (Phase 8 grace
 * period), and records a capped, in-memory log of sustained direction changes.
 */
export function useHeadPose(trackingResult, active) {
  const poseStateRef = useRef(new Map());
  const eventsRef = useRef([]);
  const [output, setOutput] = useState(EMPTY_OUTPUT);

  useEffect(() => {
    if (!active) {
      poseStateRef.current = new Map();
      eventsRef.current = [];
      setOutput(EMPTY_OUTPUT);
      return;
    }

    if (!trackingResult || trackingResult.timestamp === null) {
      return;
    }

    const poseState = poseStateRef.current;
    const seenIds = new Set();
    let events = eventsRef.current;
    let eventsChanged = false;

    const faces = trackingResult.faces.map((face) => {
      seenIds.add(face.id);

      let state = poseState.get(face.id);
      const hasLandmarks = face.landmarks?.available && face.landmarks.points.length >= 68;
      const raw = hasLandmarks ? computeRawPose(face.landmarks.points) : null;

      if (!state) {
        state = {
          pitch: raw?.pitch ?? 0,
          yaw: raw?.yaw ?? 0,
          roll: raw?.roll ?? 0,
          direction: raw ? deriveDirection(raw.pitch, raw.yaw) : "Center",
          available: Boolean(raw),
          pendingDirection: null,
          pendingCount: 0,
        };
        poseState.set(face.id, state);
      }

      if (raw) {
        state.pitch = lerp(state.pitch, raw.pitch, SMOOTHING_ALPHA);
        state.yaw = lerp(state.yaw, raw.yaw, SMOOTHING_ALPHA);
        state.roll = lerp(state.roll, raw.roll, SMOOTHING_ALPHA);
        state.available = true;

        const candidateDirection = deriveDirection(state.pitch, state.yaw);
        if (candidateDirection === state.direction) {
          state.pendingDirection = null;
          state.pendingCount = 0;
        } else if (state.pendingDirection === candidateDirection) {
          state.pendingCount += 1;
        } else {
          state.pendingDirection = candidateDirection;
          state.pendingCount = 1;
        }

        if (state.pendingDirection && state.pendingCount >= SUSTAIN_FRAMES) {
          const fromDirection = state.direction;
          const toDirection = state.pendingDirection;
          state.direction = toDirection;
          state.pendingDirection = null;
          state.pendingCount = 0;

          events = [
            {
              id: `head-move-${nextEventId++}`,
              faceId: face.id,
              fromDirection,
              toDirection,
              timestamp: trackingResult.timestamp,
            },
            ...events,
          ].slice(0, MAX_EVENTS);
          eventsChanged = true;
        }
      } else {
        // Landmarks unavailable this cycle (e.g. within the Phase 8 grace
        // period) — hold the last known smoothed pose rather than recomputing.
        state.available = false;
      }

      return {
        ...face,
        headPose: {
          pitch: state.pitch,
          yaw: state.yaw,
          roll: state.roll,
          direction: state.direction,
          available: state.available,
        },
      };
    });

    // Drop pose state for tracks that no longer exist (real loss past grace period).
    Array.from(poseState.keys()).forEach((id) => {
      if (!seenIds.has(id)) poseState.delete(id);
    });

    if (eventsChanged) {
      eventsRef.current = events;
    }

    setOutput({ faces, events: eventsRef.current });
  }, [trackingResult, active]);

  return output;
}