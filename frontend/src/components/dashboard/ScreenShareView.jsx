import { useEffect, useRef, useState } from "react";
import {
  Monitor,
  Camera,
  AlertTriangle,
  Clock,
  Shield,
  ShieldAlert,
  Play,
  Square,
  Maximize2,
  Image as ImageIcon,
} from "lucide-react";

export default function ScreenShareView({ screenShare }) {
  const videoRef = useRef(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const {
    status = "idle",
    errorMessage = null,
    stream = null,
    isSharing = false,
    isEntireScreen = true,
    displaySurface = "monitor",
    resolution = { width: 0, height: 0, frameRate: 0 },
    sharingDurationFormatted = "00:00",
    snapshots = [],
    captureSnapshot,
    start,
    stop,
    risk,
  } = screenShare || {};

  // Bind video stream
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    } else if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  const handleCapture = async () => {
    if (!isSharing || isCapturing) return;
    setIsCapturing(true);
    try {
      await captureSnapshot?.();
    } finally {
      setTimeout(() => setIsCapturing(false), 300);
    }
  };

  return (
    <div className="screenshare-view">
      {/* Header bar */}
      <div className="screenshare-header-bar">
        <div className="screenshare-status-meta">
          <div className="status-indicator-group">
            <span
              className={`status-dot ${
                isSharing ? "dot-active animate-pulse" : "dot-offline"
              }`}
            />
            <h4 className="screenshare-title">Desktop Screen Feed</h4>
          </div>

          <div className="screenshare-badges">
            <span
              className={`badge ${
                isSharing
                  ? isEntireScreen
                    ? "badge-ready"
                    : "badge-warn animate-pulse"
                  : status === "permission_denied"
                  ? "badge-critical"
                  : "badge-idle"
              }`}
            >
              {isSharing
                ? isEntireScreen
                  ? "● Entire Desktop Shared"
                  : `⚠️ ${displaySurface.toUpperCase()} Shared`
                : status === "permission_denied"
                ? "Permission Denied"
                : status === "requesting"
                ? "Requesting permission…"
                : "Screen Offline"}
            </span>

            {isSharing && (
              <span className="badge badge-idle font-mono">
                <Clock size={11} className="mr-1 inline" /> {sharingDurationFormatted}
              </span>
            )}
          </div>
        </div>

        <div className="screenshare-actions">
          {isSharing ? (
            <>
              <button
                className={`btn-action btn-snapshot ${isCapturing ? "btn-capturing" : ""}`}
                onClick={handleCapture}
                title="Capture screen evidence snapshot"
              >
                <Camera size={13} />
                Snapshot {snapshots.length > 0 && `(${snapshots.length})`}
              </button>
              <button className="btn-action btn-stop" onClick={stop}>
                <Square size={13} />
                Stop Share
              </button>
            </>
          ) : (
            <button
              className="btn-action btn-start"
              onClick={start}
              disabled={status === "requesting"}
            >
              <Play size={13} />
              {status === "requesting" ? "Requesting…" : "Start Screen Share"}
            </button>
          )}
        </div>
      </div>

      {/* Screen Preview Container */}
      <div className="screen-preview-container">
        {isSharing && stream ? (
          <div className="screen-video-wrapper">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="screen-video-element"
            />
            <div className="screen-video-overlay-info">
              <span className="screen-stream-tag">
                {resolution.width} × {resolution.height} @ {resolution.frameRate || 30} FPS
              </span>
              <span
                className={`screen-surface-tag ${
                  isEntireScreen ? "surface-ok" : "surface-warn"
                }`}
              >
                Surface: {displaySurface}
              </span>
            </div>
          </div>
        ) : (
          <div className="screen-empty-state">
            <Monitor size={36} strokeWidth={1.4} className="empty-icon" />
            <h4 className="empty-title">
              {status === "permission_denied"
                ? "Screen Permission Denied"
                : status === "stopped"
                ? "Screen Sharing Interrupted"
                : "Screen Feed Offline"}
            </h4>
            <p className="empty-desc">
              {errorMessage ||
                "Start screen sharing to transmit the candidate's active desktop for proctoring verification."}
            </p>
            <button
              className="btn-primary-capture"
              onClick={start}
              disabled={status === "requesting"}
            >
              <Play size={14} />
              {status === "requesting" ? "Connecting Display…" : "Select Screen to Share"}
            </button>
          </div>
        )}
      </div>

      {/* Telemetry Cards Row */}
      <div className="screen-telemetry-grid">
        <div
          className={`telemetry-card ${
            isSharing
              ? isEntireScreen
                ? "card-good"
                : "card-warning"
              : "card-normal"
          }`}
        >
          <div className="telemetry-card-head">
            <span className="telemetry-label">Display Surface</span>
            {isSharing && (
              <span
                className={`pill ${
                  isEntireScreen ? "pill-good" : "pill-warning"
                }`}
              >
                {isEntireScreen ? "Compliant" : "Partial"}
              </span>
            )}
          </div>
          <div className="telemetry-card-val">
            {isSharing ? displaySurface.toUpperCase() : "—"}
          </div>
          <p className="telemetry-note">
            {isSharing && !isEntireScreen
              ? "⚠️ Single window/tab shared. Candidate could access other apps unmonitored."
              : "Entire screen view ensures all apps, browser windows, and notes are monitored."}
          </p>
        </div>

        <div className="telemetry-card card-normal">
          <div className="telemetry-card-head">
            <span className="telemetry-label">Stream Resolution</span>
            <Maximize2 size={13} className="text-secondary" />
          </div>
          <div className="telemetry-card-val font-mono">
            {isSharing
              ? `${resolution.width} × ${resolution.height}`
              : "Not Active"}
          </div>
          <p className="telemetry-note">
            {isSharing
              ? `Framerate: ~${resolution.frameRate || 30} FPS · Low Latency`
              : "Resolution calibrated upon screen connection."}
          </p>
        </div>

        <div className="telemetry-card card-normal">
          <div className="telemetry-card-head">
            <span className="telemetry-label">Proctoring Risk Impact</span>
            {risk?.level === "High Risk" ? (
              <ShieldAlert size={14} className="text-danger" />
            ) : risk?.level === "Elevated Risk" ? (
              <AlertTriangle size={14} className="text-warn" />
            ) : (
              <Shield size={14} className="text-success" />
            )}
          </div>
          <div
            className={`telemetry-card-val ${
              risk?.level === "High Risk"
                ? "text-danger"
                : risk?.level === "Elevated Risk"
                ? "text-warn"
                : "text-success"
            }`}
          >
            {risk?.level || "Low Risk"}
          </div>
          <p className="telemetry-note">{risk?.note || "Clean display channel."}</p>
        </div>
      </div>

      {/* Snapshots Gallery Section */}
      <div className="screen-snapshots-section">
        <div className="snapshots-header">
          <div className="snapshots-title-group">
            <ImageIcon size={14} className="text-accent" />
            <h5>Captured Evidence Snapshots ({snapshots.length})</h5>
          </div>
          {isSharing && (
            <button className="btn-link" onClick={handleCapture}>
              Take Snapshot Now
            </button>
          )}
        </div>

        {snapshots.length === 0 ? (
          <div className="snapshots-empty">
            <p className="empty-sub">
              No evidence frames captured yet. Use the "Snapshot" button above to freeze
              and store high-resolution screen proof.
            </p>
          </div>
        ) : (
          <div className="snapshots-strip">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className="snapshot-thumb-card"
                onClick={() => setSelectedSnapshot(snap)}
              >
                <img
                  src={snap.dataUrl}
                  alt={`Screen snapshot at ${snap.timestamp}`}
                  className="snapshot-img"
                />
                <div className="snapshot-meta-row">
                  <span className="snapshot-time">{snap.timestamp}</span>
                  <span className="snapshot-res">
                    {snap.width}×{snap.height}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for viewing selected snapshot */}
      {selectedSnapshot && (
        <div
          className="snapshot-modal-backdrop"
          onClick={() => setSelectedSnapshot(null)}
        >
          <div
            className="snapshot-modal-box"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="snapshot-modal-head">
              <h6>Evidence Snapshot · {selectedSnapshot.timestamp}</h6>
              <button
                className="btn-modal-close"
                onClick={() => setSelectedSnapshot(null)}
              >
                ✕
              </button>
            </div>
            <img
              src={selectedSnapshot.dataUrl}
              alt="Enlarged evidence snapshot"
              className="snapshot-modal-image"
            />
          </div>
        </div>
      )}
    </div>
  );
}
