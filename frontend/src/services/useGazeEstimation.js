import { useEffect, useRef, useState } from "react";
import { SMOOTHING_ALPHA } from "./useFaceTracking";

// Same bucketing thresholds/style as Phase 10's head direction, applied to the
// combined gaze signal.
const GAZE_YAW_THRESHOLD_DEG = 15;
const GAZE_PITCH_THRESHOLD_DEG = 12;

// A direction change must be sustained for this many consecutive detection
// cycles before it commits and produces a gaze event (same pattern as Phase
// 10's head movement events).
const SUSTAIN_FRAMES = 2;

// How long gaze must stay away from "Center" before it counts as "looking
// away" — a duration threshold (not a frame count) since this is meant to be
// a meaningfully sustained state, not a brief glance.
const LOOKING_AWAY_DURATION_MS = 1800;

const MAX_EVENTS = 8;

// Simple weighted combination: head pose dominates the estimate (it's the
// coarser, more reliable signal), iris position refines it. Both weights sum
// to 1; the iris contribution is scaled from its -1..1 normalized range into
// degree-like units comparable to head yaw/pitch.
const HEAD_WEIGHT = 0.7;
const IRIS_WEIGHT = 0.3;
const IRIS_YAW_SCALE = 40;
const IRIS_PITCH_SCALE = 30;

const EMPTY_OUTPUT = { faces: [], events: [] };

let nextEventId = 0;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(previous, next, alpha) {
  return previous + (next - previous) * alpha;
}

function averageIrisNormalized(eyes) {
  const samples = [];
  if (eyes?.left?.iris?.available) samples.push(eyes.left.iris.normalized);
  if (eyes?.right?.iris?.available) samples.push(eyes.right.iris.normalized);
  if (samples.length === 0) return null;
  return {
    x: samples.reduce((sum, p) => sum + p.x, 0) / samples.length,
    y: samples.reduce((sum, p) => sum + p.y, 0) / samples.length,
  };
}

/**
 * Combines head pose (Phase 10) and iris position (Phase 11) into a single
 * raw gaze estimate. Both signals already share the same raw (unmirrored)
 * coordinate convention as head pose, so they combine directly without an
 * extra sign correction here — the mirrored on-screen label flip happens once,
 * in deriveGazeDirection, matching how Phase 10 already handles this.
 */
function computeRawGaze(headPose, eyes) {
  const headAvailable = Boolean(headPose?.available);
  const irisNormalized = averageIrisNormalized(eyes);
  const irisAvailable = Boolean(irisNormalized);

  if (!headAvailable && !irisAvailable) return null;

  const headYaw = headAvailable ? headPose.yaw : 0;
  const headPitch = headAvailable ? headPose.pitch : 0;
  // normalized.x follows the same raw-rightward-positive convention as head yaw.
  const irisYaw = irisAvailable ? irisNormalized.x * IRIS_YAW_SCALE : 0;
  // normalized.y is positive toward the bottom of the eye; flip so positive
  // means "up", matching head pose's pitch convention.
  const irisPitch = irisAvailable ? -irisNormalized.y * IRIS_PITCH_SCALE : 0;

  let yaw;
  let pitch;
  if (headAvailable && irisAvailable) {
    yaw = headYaw * HEAD_WEIGHT + irisYaw * IRIS_WEIGHT;
    pitch = headPitch * HEAD_WEIGHT + irisPitch * IRIS_WEIGHT;
  } else if (headAvailable) {
    yaw = headYaw;
    pitch = headPitch;
  } else {
    yaw = irisYaw;
    pitch = irisPitch;
  }

  return { yaw: clamp(yaw, -90, 90), pitch: clamp(pitch, -90, 90) };
}

function deriveGazeDirection(pitch, yaw) {
  // Same mirrored-preview label handling as Phase 10's head direction.
  const screenYaw = -yaw;

  if (Math.abs(screenYaw) >= Math.abs(pitch) && Math.abs(screenYaw) > GAZE_YAW_THRESHOLD_DEG) {
    return screenYaw > 0 ? "Right" : "Left";
  }
  if (Math.abs(pitch) > GAZE_PITCH_THRESHOLD_DEG) {
    return pitch > 0 ? "Up" : "Down";
  }
  return "Center";
}

/**
 * Estimates gaze per tracked face by combining the Phase 10 head pose and
 * Phase 11 iris position outputs — no new detection pass. `faces` should be
 * the already-merged array carrying both `.headPose` and `.eyes` per face,
 * and `timestamp` the same per-cycle timestamp already used elsewhere in the
 * pipeline. Holds the last known smoothed gaze while both inputs are
 * unavailable (Phase 8 grace period), and records a capped, in-memory log of
 * sustained direction changes.
 */
export function useGazeEstimation(faces, timestamp, active) {
  const gazeStateRef = useRef(new Map());
  const eventsRef = useRef([]);
  const [output, setOutput] = useState(EMPTY_OUTPUT);

  useEffect(() => {
    if (!active) {
      gazeStateRef.current = new Map();
      eventsRef.current = [];
      setOutput(EMPTY_OUTPUT);
      return;
    }

    if (!faces || timestamp === null || timestamp === undefined) {
      return;
    }

    const gazeState = gazeStateRef.current;
    const seenIds = new Set();
    let events = eventsRef.current;
    let eventsChanged = false;

    const outFaces = faces.map((face) => {
      seenIds.add(face.id);

      let state = gazeState.get(face.id);
      const raw = computeRawGaze(face.headPose, face.eyes);

      if (!state) {
        state = {
          pitch: raw?.pitch ?? 0,
          yaw: raw?.yaw ?? 0,
          direction: raw ? deriveGazeDirection(raw.pitch, raw.yaw) : "Center",
          available: Boolean(raw),
          pendingDirection: null,
          pendingCount: 0,
          directionSince: timestamp,
        };
        gazeState.set(face.id, state);
      }

      if (raw) {
        state.pitch = lerp(state.pitch, raw.pitch, SMOOTHING_ALPHA);
        state.yaw = lerp(state.yaw, raw.yaw, SMOOTHING_ALPHA);
        state.available = true;

        const candidateDirection = deriveGazeDirection(state.pitch, state.yaw);
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
          state.directionSince = timestamp;
          state.pendingDirection = null;
          state.pendingCount = 0;

          events = [
            { id: `gaze-${nextEventId++}`, faceId: face.id, fromDirection, toDirection, timestamp },
            ...events,
          ].slice(0, MAX_EVENTS);
          eventsChanged = true;
        }
      } else {
        // Head pose and iris both unavailable this cycle (e.g. within the
        // Phase 8 grace period) — hold the last known smoothed gaze rather
        // than recomputing, consistent with the existing freeze pattern.
        state.available = false;
      }

      const durationMs = Math.max(0, timestamp - state.directionSince);
      const isLookingAway = state.direction !== "Center" && durationMs >= LOOKING_AWAY_DURATION_MS;

      return {
        ...face,
        gaze: {
          direction: state.direction,
          isLookingAway,
          durationMs,
          available: state.available,
        },
      };
    });

    Array.from(gazeState.keys()).forEach((id) => {
      if (!seenIds.has(id)) gazeState.delete(id);
    });

    if (eventsChanged) {
      eventsRef.current = events;
    }

    setOutput({ faces: outFaces, events: eventsRef.current });
  }, [faces, timestamp, active]);

  return output;
}