import { useEffect, useMemo, useRef } from "react";
import { VideoOff, ShieldAlert } from "lucide-react";
import { useCamera } from "../../services/useCamera";
import { useFaceDetection } from "../../services/useFaceDetection";
import { useFaceTracking } from "../../services/useFaceTracking";
import { useHeadPose } from "../../services/useHeadPose";
import { useEyeTracking } from "../../services/useEyeTracking";
import { useGazeEstimation } from "../../services/useGazeEstimation";
import { useGazeBehaviorAnalysis } from "../../services/useGazeBehaviorAnalysis";
import { usePersonTracking } from "../../services/usePersonTracking";
import { useObjectDetection } from "../../services/useObjectDetection";
import CameraVideo from "./CameraVideo";
import FaceOverlay from "./FaceOverlay";

const STATE_COPY = {
  idle: "Camera stopped. Start the camera to begin your live interview feed.",
  stopped: "Camera stopped. Start the camera to begin your live interview feed.",
  requesting: "Requesting camera permission…",
};

const BADGE_LABEL = {
  idle: "Camera offline",
  stopped: "Camera stopped",
  requesting: "Requesting camera…",
  permission_denied: "Permission denied",
  unavailable: "Camera unavailable",
  error: "Camera error",
};

const FACE_LABEL = {
  no_face: "No Face",
  face_detected: "Face Detected",
  multiple_faces: "Multiple Faces",
};

const ERROR_STATES = new Set(["permission_denied", "unavailable", "error"]);

export default function CameraPanel({ hasSession, onFaceStatusChange }) {
  const { status, errorMessage, stream, start, stop } = useCamera();
  const videoRef = useRef(null);
  const isActive = status === "active";
  const isRequesting = status === "requesting";
  const isErrorState = ERROR_STATES.has(status);

  const { modelStatus, result } = useFaceDetection(videoRef, isActive);
  const tracking = useFaceTracking(result, isActive);
  const headPose = useHeadPose(tracking, isActive);
  const eyeTracking = useEyeTracking(videoRef, tracking, isActive);

  // headPose and eyeTracking both map over the same tracking.faces array
  // (same ids, same order), so they combine by index into one enriched list.
  const posedFaces = useMemo(
    () =>
      headPose.faces.map((face, index) => ({
        ...face,
        eyes: eyeTracking.faces[index]?.eyes,
      })),
    [headPose.faces, eyeTracking.faces]
  );

  const gaze = useGazeEstimation(posedFaces, tracking.timestamp, isActive);
  const gazeBehavior = useGazeBehaviorAnalysis(gaze.faces, tracking.timestamp, isActive);
  const personTracking = usePersonTracking(gazeBehavior.faces, tracking.timestamp, isActive);
  const objectDetection = useObjectDetection(videoRef, isActive);
  const faces = personTracking.faces;

  const compositeAlerts = useMemo(
    () =>
      [
        ...objectDetection.alerts,
        ...personTracking.alerts,
        ...gazeBehavior.alerts,
      ].slice(0, 10),
    [objectDetection.alerts, personTracking.alerts, gazeBehavior.alerts]
  );

  const compositeEvidence = useMemo(
    () =>
      [
        ...objectDetection.evidenceEvents,
        ...personTracking.evidenceEvents,
        ...gazeBehavior.evidenceEvents,
      ].slice(0, 10),
    [
      objectDetection.evidenceEvents,
      personTracking.evidenceEvents,
      gazeBehavior.evidenceEvents,
    ]
  );

  const compositeRisk = useMemo(() => {
    const rawScore = Math.min(
      100,
      gazeBehavior.risk.score + personTracking.risk.score + objectDetection.risk.score
    );
    let level = "Low Risk";
    if (
      rawScore >= 70 ||
      personTracking.summary.isMultiplePeople ||
      objectDetection.summary.hasProhibited
    ) {
      level = "High Risk";
    } else if (rawScore >= 45) {
      level = "Elevated Risk";
    } else if (rawScore >= 20) {
      level = "Moderate Risk";
    }

    const note = objectDetection.summary.hasProhibited
      ? objectDetection.risk.note
      : personTracking.summary.isMultiplePeople
      ? personTracking.risk.note
      : personTracking.summary.isCandidateAbsent
      ? personTracking.risk.note
      : gazeBehavior.risk.note;

    return {
      score: rawScore,
      maxScore: 100,
      level,
      note,
    };
  }, [
    gazeBehavior.risk,
    personTracking.risk,
    personTracking.summary,
    objectDetection.risk,
    objectDetection.summary,
  ]);

  useEffect(() => {
    onFaceStatusChange?.({
      ...tracking,
      faces,
      gazeBehavior: gazeBehavior.summary,
      personSummary: personTracking.summary,
      objectSummary: objectDetection.summary,
      objectModelStatus: objectDetection.modelStatus,
      objectRules: objectDetection.rules,
      onToggleObjectRule: objectDetection.toggleRule,
      alerts: compositeAlerts,
      evidenceEvents: compositeEvidence,
      risk: compositeRisk,
    });
  }, [
    tracking,
    faces,
    gazeBehavior.summary,
    personTracking.summary,
    objectDetection.summary,
    objectDetection.modelStatus,
    objectDetection.rules,
    objectDetection.toggleRule,
    compositeAlerts,
    compositeEvidence,
    compositeRisk,
    onFaceStatusChange,
  ]);

  function handleToggle() {
    if (isActive) stop();
    else start();
  }

  function faceStatusText() {
    if (!isActive) return null;
    if (modelStatus === "loading") return "● Loading face detector…";
    if (modelStatus === "error") return "● Face detector unavailable";

    let text = "";
    if (personTracking.summary.count === 0) {
      text = "● No Candidate in Frame";
    } else if (personTracking.summary.count === 1) {
      text = "● Candidate Present (1)";
    } else {
      text = `● ⚠️ Multiple People (${personTracking.summary.count})`;
    }

    const primaryFace = faces[0];
    if (primaryFace?.headPose?.available) text += ` · Head: ${primaryFace.headPose.direction}`;
    if (primaryFace?.gaze?.available) {
      text += ` · Gaze: ${primaryFace.gaze.direction}`;
      if (primaryFace.gaze.isLookingAway) text += " (away)";
      const b = primaryFace.gaze.behavior;
      if (b?.repeatedShifts?.detected) {
        text += ` · ⚠️ Oscillation (${b.repeatedShifts.targetDirection})`;
      } else if (b?.frequency?.shiftsPerMinute > 0) {
        text += ` · ${b.frequency.shiftsPerMinute}/min (${b.temporalPattern?.pattern ?? "Normal"})`;
      }
    }
    if (personTracking.summary.isMultiplePeople) {
      text += ` · Unauthorized Person Active`;
    }
    if (objectDetection.summary.hasProhibited) {
      text += ` · ⚠️ Prohibited Object (${objectDetection.summary.prohibitedCount})`;
    }
    text += ` · Blinks: ${eyeTracking.events.length}`;
    return text;
  }

  return (
    <section className="panel camera-card">
      <div className="panel-header">
        <h2>Live interview</h2>
        <span className={`badge ${isActive ? "badge-active" : isErrorState ? "badge-critical" : "badge-idle"}`}>
          {isActive ? "● Camera active" : BADGE_LABEL[status] ?? "Camera offline"}
        </span>
      </div>

      <div className="camera-frame">
        {isActive && stream ? (
          <>
            <CameraVideo stream={stream} ref={videoRef} />
            <FaceOverlay videoRef={videoRef} faces={faces} objects={objectDetection.objects} />
          </>
        ) : (
          <>
            <div className="camera-overlay-grid" aria-hidden="true" />
            <div className="camera-empty">
              {isErrorState ? (
                <ShieldAlert size={28} strokeWidth={1.5} />
              ) : (
                <VideoOff size={28} strokeWidth={1.5} />
              )}
              <span>{errorMessage || STATE_COPY[status] || "Camera feed will appear here."}</span>
            </div>
          </>
        )}
        {isActive && <div className="camera-tag candidate-tag">Candidate</div>}
        {isActive && <div className="camera-tag monitoring-tag">{faceStatusText()}</div>}
      </div>

      <div className="camera-controls">
        <button
          type="button"
          className="control-button control-primary"
          onClick={handleToggle}
          disabled={isRequesting || (!hasSession && !isActive)}
        >
          {isActive ? "Stop Camera" : isRequesting ? "Requesting…" : "Start Camera"}
        </button>
      </div>
    </section>
  );
}