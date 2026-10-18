import { Eye, Activity, RotateCcw, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function GazeBehaviorView({ behavior }) {
  if (!behavior || !behavior.duration || behavior.duration.totalMonitoredMs === 0) {
    return (
      <div className="empty-state">
        <Eye size={22} strokeWidth={1.5} />
        <p className="empty-title">Awaiting gaze activity</p>
        <p className="empty-sub">
          Start the camera to begin streaming real-time gaze frequency, dwell duration, repeated shifts, and temporal pattern analysis.
        </p>
      </div>
    );
  }

  const { frequency, duration, repeatedShifts, temporalPattern } = behavior;
  const isRepeated = repeatedShifts?.detected;

  return (
    <div className="gaze-analytics-container">
      {/* Top Banner: Temporal Gaze Pattern Classification */}
      <div className={`gaze-pattern-banner gaze-severity-${temporalPattern.severity}`}>
        <div className="gaze-pattern-header">
          <div className="gaze-pattern-title-row">
            <Activity size={16} />
            <span className="gaze-pattern-name">{temporalPattern.pattern}</span>
          </div>
          <span className={`badge badge-${temporalPattern.severity}`}>
            {temporalPattern.riskLevel}
          </span>
        </div>
        <p className="gaze-pattern-desc">{temporalPattern.description}</p>
      </div>

      {/* 2x2 Grid of the 4 Key Gaze Analysis Tasks */}
      <div className="gaze-metrics-grid">
        {/* 1. Gaze Frequency */}
        <div className="gaze-metric-card">
          <div className="gaze-metric-top">
            <span className="gaze-metric-label">
              <RotateCcw size={13} /> Gaze Frequency
            </span>
            <span className={`badge badge-${frequency.classification.severity}`}>
              {frequency.classification.level}
            </span>
          </div>
          <div className="gaze-metric-value-row">
            <span className="gaze-stat-large">{frequency.shiftsPerMinute}</span>
            <span className="gaze-stat-unit">shifts / min</span>
          </div>
          <div className="gaze-metric-sub">
            <span>Total shifts: <strong>{frequency.totalShifts}</strong></span>
          </div>
          {/* Directional Distribution Mini-bars */}
          <div className="gaze-distribution-list">
            {Object.entries(frequency.directionDistribution || {}).map(([dir, pct]) => (
              <div key={dir} className="gaze-dist-item">
                <span className="gaze-dist-label">{dir}</span>
                <div className="gaze-dist-track">
                  <div
                    className="gaze-dist-fill"
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                  />
                </div>
                <span className="gaze-dist-num">{pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Gaze Duration */}
        <div className="gaze-metric-card">
          <div className="gaze-metric-top">
            <span className="gaze-metric-label">
              <Clock size={13} /> Gaze Duration
            </span>
            <span className="badge badge-idle">
              {(duration.totalMonitoredMs / 1000).toFixed(0)}s tracked
            </span>
          </div>
          <div className="gaze-metric-value-row">
            <span className="gaze-stat-large">
              {(duration.averageFixationMs / 1000).toFixed(1)}s
            </span>
            <span className="gaze-stat-unit">avg fixation</span>
          </div>
          {/* Center vs Off-Center Ratio */}
          <div className="gaze-ratio-container">
            <div className="gaze-ratio-labels">
              <span>Center: <strong>{duration.centerPercent}%</strong></span>
              <span>Off-Center: <strong>{duration.offCenterPercent}%</strong></span>
            </div>
            <div className="gaze-ratio-bar">
              <div
                className="gaze-ratio-center"
                style={{ width: `${duration.centerPercent}%` }}
              />
              <div
                className="gaze-ratio-off"
                style={{ width: `${duration.offCenterPercent}%` }}
              />
            </div>
          </div>
          <div className="gaze-metric-sub">
            <span>
              Max off-center dwell:{" "}
              <strong>{(duration.maxOffCenterDurationMs / 1000).toFixed(1)}s</strong>
            </span>
          </div>
        </div>

        {/* 3. Repeated Gaze Shifts */}
        <div className={`gaze-metric-card ${isRepeated ? "gaze-card-alert" : ""}`}>
          <div className="gaze-metric-top">
            <span className="gaze-metric-label">
              <AlertTriangle size={13} /> Repeated Shifts
            </span>
            <span
              className={`badge ${
                isRepeated
                  ? repeatedShifts.severity === "critical"
                    ? "badge-critical"
                    : "badge-warn"
                  : "badge-ready"
              }`}
            >
              {isRepeated ? "Oscillation Detected" : "Normal"}
            </span>
          </div>
          <div className="gaze-repeated-content">
            {isRepeated ? (
              <>
                <div className="gaze-repeated-highlight">
                  <span className="gaze-repeated-target">{repeatedShifts.targetDirection}</span>
                  <span className="gaze-repeated-cycles">
                    {repeatedShifts.cycleCount} back-and-forth cycles
                  </span>
                </div>
                <p className="gaze-repeated-msg">{repeatedShifts.message}</p>
              </>
            ) : (
              <div className="gaze-clean-state">
                <CheckCircle2 size={16} className="text-ok" />
                <span>No repetitive gaze shifting detected in the last {repeatedShifts.windowSeconds}s.</span>
              </div>
            )}
          </div>
        </div>

        {/* 4. Temporal Gaze Patterns (Recent Sliding Windows) */}
        <div className="gaze-metric-card">
          <div className="gaze-metric-top">
            <span className="gaze-metric-label">
              <Activity size={13} /> Temporal Windows
            </span>
            <span className="badge badge-idle">10s Buckets</span>
          </div>
          <div className="gaze-timeline-list">
            {temporalPattern.recentWindows && temporalPattern.recentWindows.length > 0 ? (
              temporalPattern.recentWindows.slice(0, 3).map((w, idx) => (
                <div key={idx} className="gaze-timeline-item">
                  <span className="gaze-window-time">{w.timestamp}</span>
                  <span className="gaze-window-dominant">
                    Dominant: <strong>{w.dominantDirection}</strong>
                  </span>
                  <span className="gaze-window-stats">
                    {w.shiftCount} shifts · {w.offCenterPercent}% off
                  </span>
                </div>
              ))
            ) : (
              <p className="gaze-timeline-empty">Collecting 10s temporal window data…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
