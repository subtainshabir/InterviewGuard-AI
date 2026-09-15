import { VideoOff } from "lucide-react";

export default function CameraPanel({ cameraState = "offline" }) {
  const isOffline = cameraState === "offline";

  return (
    <section className="panel camera-card">
      <div className="panel-header">
        <h2>Live interview</h2>
        <span className={`badge badge-${isOffline ? "idle" : "active"}`}>
          {isOffline ? "Camera offline" : "Waiting for camera"}
        </span>
      </div>

      <div className="camera-frame">
        <div className="camera-overlay-grid" aria-hidden="true" />
        <div className="camera-empty">
          <VideoOff size={28} strokeWidth={1.5} />
          <span>Camera feed will appear here once monitoring starts</span>
        </div>
        <div className="camera-tag candidate-tag">Candidate</div>
        <div className="camera-tag monitoring-tag">Monitoring overlay reserved</div>
      </div>
    </section>
  );
}