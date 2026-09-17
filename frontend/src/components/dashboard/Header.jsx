import { Play, Pause, Square } from "lucide-react";

const STATUS_LABEL = {
  checking: "Checking backend",
  connected: "Backend connected",
  unavailable: "Backend unavailable",
};

const SESSION_LABEL = {
  scheduled: "Ready",
  ready: "Ready",
  active: "Monitoring",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function Header({
  backendStatus,
  session,
  elapsedLabel,
  busy,
  onStart,
  onPause,
  onResume,
  onEnd,
}) {
  const status = session?.status ?? "scheduled";
  const label = SESSION_LABEL[status] ?? status;
  const isActive = status === "active";
  const isPaused = status === "paused";
  const isFinished = status === "completed" || status === "cancelled";
  const canStart = status === "scheduled" || status === "ready";

  function handlePrimaryAction() {
    if (isActive) onPause();
    else if (isPaused) onResume();
    else if (canStart) onStart();
  }

  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <div className="brand-name">InterviewGuard AI</div>
          <div className="brand-sub">Interview integrity monitoring</div>
        </div>
      </div>

      <div className="header-right">
        <div className={`session-pill session-${status}`}>
          <span className="connection-dot" />
          {label}
          {(isActive || isPaused) && <span className="session-timer">{elapsedLabel}</span>}
        </div>

        <div className={`connection-pill connection-${backendStatus}`}>
          <span className="connection-dot" />
          {STATUS_LABEL[backendStatus]}
        </div>

        <div className="header-controls">
          <button
            type="button"
            className="control-button control-primary"
            onClick={handlePrimaryAction}
            disabled={busy || isFinished || !session}
          >
            {isActive ? <Pause size={14} /> : <Play size={14} />}
            {isActive ? "Pause" : isPaused ? "Resume" : "Start"}
          </button>
          <button
            type="button"
            className="control-button"
            onClick={onEnd}
            disabled={busy || isFinished || !session || canStart}
          >
            <Square size={14} />
            End
          </button>
        </div>
      </div>
    </header>
  );
}