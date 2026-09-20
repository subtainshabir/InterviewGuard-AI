import { useEffect, useRef, useState } from "react";

export const SMOOTHING_ALPHA = 0.35;
const GRACE_PERIOD_FRAMES = 3;
const MATCH_DISTANCE_FACTOR = 0.75;
const STILL_MOVEMENT_FACTOR = 0.03;

const EMPTY_RESULT = { faces: [], count: 0, status: "no_face", timestamp: null };

let nextTrackId = 0;

function boxCenter(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerpBox(previous, next, alpha) {
  return {
    x: previous.x + (next.x - previous.x) * alpha,
    y: previous.y + (next.y - previous.y) * alpha,
    width: previous.width + (next.width - previous.width) * alpha,
    height: previous.height + (next.height - previous.height) * alpha,
  };
}

function deriveStatus(count) {
  if (count === 1) return "face_detected";
  if (count > 1) return "multiple_faces";
  return "no_face";
}

/**
 * Wraps a raw FaceDetectionResult (from useFaceDetection) with positional tracking:
 * smoothing, a short grace period for temporary loss, movement, and stable per-face
 * ids across frames. Runs purely off the existing detection cycle — no separate loop.
 */
export function useFaceTracking(detectionResult, active) {
  const tracksRef = useRef([]);
  const [trackingResult, setTrackingResult] = useState(EMPTY_RESULT);

  useEffect(() => {
    if (!active) {
      tracksRef.current = [];
      setTrackingResult(EMPTY_RESULT);
      return;
    }

    if (!detectionResult || detectionResult.timestamp === null) {
      return;
    }

    const rawFaces = detectionResult.faces;
    const tracks = tracksRef.current;
    const usedTrackIndices = new Set();
    const usedRawIndices = new Set();

    // Match each raw detection to the nearest unmatched existing track within a
    // size-relative distance threshold (straightforward nearest-position matching).
    rawFaces.forEach((rawFace, rawIndex) => {
      const rawCenter = boxCenter(rawFace.boundingBox);
      let bestTrackIdx = -1;
      let bestDistance = Infinity;

      tracks.forEach((track, trackIdx) => {
        if (usedTrackIndices.has(trackIdx)) return;
        const trackCenter = boxCenter(track.box);
        const dist = distance(rawCenter, trackCenter);
        const threshold =
          Math.max(rawFace.boundingBox.width, track.box.width) * MATCH_DISTANCE_FACTOR;
        if (dist <= threshold && dist < bestDistance) {
          bestDistance = dist;
          bestTrackIdx = trackIdx;
        }
      });

      if (bestTrackIdx >= 0) {
        usedTrackIndices.add(bestTrackIdx);
        usedRawIndices.add(rawIndex);

        const track = tracks[bestTrackIdx];
        const previousCenter = boxCenter(track.box);
        const smoothedBox = lerpBox(track.box, rawFace.boundingBox, SMOOTHING_ALPHA);
        const newCenter = boxCenter(smoothedBox);
        const movementMagnitude = distance(previousCenter, newCenter);
        const stillThreshold = smoothedBox.width * STILL_MOVEMENT_FACTOR;

        track.box = smoothedBox;
        track.rawBoundingBox = rawFace.boundingBox;
        track.confidence = rawFace.confidence;
        track.framesSinceSeen = 0;
        track.isWithinGracePeriod = false;
        track.movement = {
          magnitude: movementMagnitude,
          isStable: movementMagnitude <= stillThreshold,
        };
        track.landmarks = rawFace.landmarks ?? { points: [], available: false };
      }
    });

    // Age out tracks that weren't matched this cycle; keep them (frozen) while
    // within the grace period, drop them once it elapses.
    const survivingTracks = [];
    tracks.forEach((track, trackIdx) => {
      if (usedTrackIndices.has(trackIdx)) {
        survivingTracks.push(track);
        return;
      }
      track.framesSinceSeen += 1;
      if (track.framesSinceSeen <= GRACE_PERIOD_FRAMES) {
        track.isWithinGracePeriod = true;
        track.movement = { magnitude: 0, isStable: true };
        track.landmarks = { points: track.landmarks?.points ?? [], available: false };
        survivingTracks.push(track);
      }
      // else: grace period elapsed with no re-detection — real loss, dropped.
    });

    // Unmatched raw detections start new tracks.
    rawFaces.forEach((rawFace, rawIndex) => {
      if (usedRawIndices.has(rawIndex)) return;
      survivingTracks.push({
        id: `track-${nextTrackId++}`,
        box: rawFace.boundingBox,
        rawBoundingBox: rawFace.boundingBox,
        confidence: rawFace.confidence,
        framesSinceSeen: 0,
        isWithinGracePeriod: false,
        movement: { magnitude: 0, isStable: true },
        landmarks: rawFace.landmarks ?? { points: [], available: false },
      });
    });

    tracksRef.current = survivingTracks;

    const faces = survivingTracks.map((track) => ({
      id: track.id,
      boundingBox: track.box,
      rawBoundingBox: track.rawBoundingBox,
      confidence: track.confidence,
      movement: track.movement,
      framesSinceSeen: track.framesSinceSeen,
      isWithinGracePeriod: track.isWithinGracePeriod,
      landmarks: track.landmarks ?? { points: [], available: false },
    }));

    setTrackingResult({
      faces,
      count: faces.length,
      status: deriveStatus(faces.length),
      timestamp: detectionResult.timestamp,
    });
  }, [detectionResult, active]);

  return trackingResult;
}