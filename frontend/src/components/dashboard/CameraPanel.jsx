import { useEffect, useMemo, useRef } from "react";
import { VideoOff, ShieldAlert } from "lucide-react";
import { useCamera } from "../../services/useCamera";
import { useFaceDetection } from "../../services/useFaceDetection";
import { useFaceTracking } from "../../services/useFaceTracking";
import { useHeadPose } from "../../services/useHeadPose";
import { useEyeTracking } from "../../services/useEyeTracking";
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

  // Both hooks map over the same tracking.faces array (same ids, same order),
  // so they combine by index into one enriched face list.
  const faces = useMemo(
    () =>
      headPose.faces.map((face, index) => ({
        ...face,
        eyes: eyeTracking.faces[index]?.eyes,
      })),
    [headPose.faces, eyeTracking.faces]
  );

  useEffect(() => {
    onFaceStatusChange?.({ ...tracking, faces });
  }, [tracking, faces, onFaceStatusChange]);

  function handleToggle() {
    if (isActive) stop();
    else start();
  }

  function faceStatusText() {
    if (!isActive) return null;
    if (modelStatus === "loading") return "● Loading face detector…";
    if (modelStatus === "error") return "● Face detector unavailable";
    const base = `● ${FACE_LABEL[tracking.status]} · Faces Detected: ${tracking.count}`;
    const primaryPose = faces[0]?.headPose;
    return primaryPose?.available ? `${base} · Head: ${primaryPose.direction}` : base;
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
            <FaceOverlay videoRef={videoRef} faces={faces} />
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