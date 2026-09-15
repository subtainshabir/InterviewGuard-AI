import { ScanFace, Eye, Compass, Mic, Box, Activity } from "lucide-react";

const ICONS = {
  face: ScanFace,
  gaze: Eye,
  headPose: Compass,
  audio: Mic,
  objects: Box,
  system: Activity,
};

const STATE_LABEL = {
  ready: "Ready",
  waiting: "Waiting",
  offline: "Offline",
};

export default function StatusCard({ signalKey, label, state, description }) {
  const Icon = ICONS[signalKey] ?? Activity;

  return (
    <div className="status-card">
      <div className="status-card-top">
        <Icon size={16} className="status-card-icon" />
        <span className="status-card-label">{label}</span>
      </div>
      <div className={`status-card-state status-state-${state}`}>
        <span className="status-dot" />
        {STATE_LABEL[state] ?? state}
      </div>
      {description && <p className="status-card-desc">{description}</p>}
    </div>
  );
}