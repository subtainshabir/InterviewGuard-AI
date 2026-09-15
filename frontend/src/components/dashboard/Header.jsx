import { useState } from "react";
import { Play, Pause, Square } from "lucide-react";

const STATUS_LABEL = {
  checking: "Checking backend",
  connected: "Backend connected",
  unavailable: "Backend unavailable",
};

const SESSION_STATES = ["Ready", "Monitoring", "Paused", "Completed"];

export default function Header({ backendStatus }) {
  const [sessionState, setSessionState] = useState("Ready");

  function handlePrimaryAction() {
    if (sessionState === "Ready" || sessionState === "Paused") {
      setSessionState("Monitoring");
    } else if (sessionState === "Monitoring") {
      setSessionState("Paused");
    }
  }

  function handleStop() {
    setSessionState("Completed");
  }

  const isMonitoring = sessionState === "Monitoring";
  const isCompleted = sessionState === "Completed";

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
        <div className={`session-pill session-${sessionState.toLowerCase()}`}>
          <span className="connection-dot" />
          {sessionState}
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
            disabled={isCompleted}
          >
            {isMonitoring ? <Pause size={14} /> : <Play size={14} />}
            {isMonitoring ? "Pause" : sessionState === "Paused" ? "Resume" : "Start"}
          </button>
          <button
            type="button"
            className="control-button"
            onClick={handleStop}
            disabled={isCompleted || sessionState === "Ready"}
          >
            <Square size={14} />
            End
          </button>
        </div>
      </div>
    </header>
  );
}