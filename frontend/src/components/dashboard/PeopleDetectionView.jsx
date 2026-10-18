import { Users, UserCheck, UserX, AlertTriangle, ArrowRight, ArrowLeft } from "lucide-react";

export default function PeopleDetectionView({ personSummary }) {
  if (!personSummary || personSummary.totalMonitoredMs === 0) {
    return (
      <div className="empty-state">
        <Users size={22} strokeWidth={1.5} />
        <p className="empty-title">Awaiting camera feed</p>
        <p className="empty-sub">
          Start the camera to monitor candidate presence, entry/exit events, and multiple-person detection.
        </p>
      </div>
    );
  }

  const {
    count,
    status,
    isMultiplePeople,
    isCandidateAbsent,
    activePeople,
    recentExits,
    activityLog,
    totalMultiplePersonMs,
  } = personSummary;

  return (
    <div className="people-tracker-container">
      {/* Top Banner: Status Overview */}
      <div
        className={`people-status-banner ${
          isMultiplePeople
            ? "people-banner-critical"
            : isCandidateAbsent
            ? "people-banner-warn"
            : "people-banner-ready"
        }`}
      >
        <div className="people-banner-left">
          <div className="people-count-pill">
            <Users size={16} />
            <span className="people-count-num">{count}</span>
            <span className="people-count-label">
              {count === 1 ? "Person in frame" : "People in frame"}
            </span>
          </div>
          <span
            className={`badge ${
              isMultiplePeople
                ? "badge-critical"
                : isCandidateAbsent
                ? "badge-warn"
                : "badge-ready"
            }`}
          >
            {isMultiplePeople
              ? "CRITICAL: Multiple People Detected"
              : isCandidateAbsent
              ? "Candidate Absent"
              : "Candidate Verified"}
          </span>
        </div>
        {totalMultiplePersonMs > 0 && (
          <div className="people-multiperson-time">
            <span>Multi-person time:</span>
            <strong>{(totalMultiplePersonMs / 1000).toFixed(0)}s</strong>
          </div>
        )}
      </div>

      {/* Active People Cards */}
      <div className="people-cards-list">
        {activePeople.length === 0 ? (
          <div className="person-empty-card">
            <UserX size={20} className="text-warn" />
            <div className="person-empty-info">
              <span className="person-empty-title">No one currently in frame</span>
              <span className="person-empty-desc">
                The candidate is expected to remain in frame for the duration of the interview.
              </span>
            </div>
          </div>
        ) : (
          activePeople.map((p, idx) => (
            <div
              key={p.id || idx}
              className={`person-card ${p.isCandidate ? "person-card-candidate" : "person-card-unauthorized"}`}
            >
              <div className="person-card-header">
                <div className="person-card-identity">
                  {p.isCandidate ? (
                    <UserCheck size={16} className="text-ok" />
                  ) : (
                    <AlertTriangle size={16} className="text-danger" />
                  )}
                  <span className="person-role-title">{p.role}</span>
                </div>
                <span
                  className={`badge ${p.isCandidate ? "badge-ready" : "badge-critical"}`}
                >
                  {p.isCandidate ? "Candidate" : "Unauthorized"}
                </span>
              </div>

              <div className="person-card-body">
                <div className="person-stat-col">
                  <span className="person-stat-label">In-frame duration</span>
                  <span className="person-stat-value">{p.presenceFormatted}</span>
                </div>
                <div className="person-stat-col">
                  <span className="person-stat-label">Status</span>
                  <span className="person-stat-status">● Live Active</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Recent Exits (if any) */}
      {recentExits && recentExits.length > 0 && (
        <div className="people-exits-section">
          <span className="people-subhead">Recently Exited</span>
          <div className="people-exits-row">
            {recentExits.map((ex, i) => (
              <div key={ex.id || i} className="people-exit-chip">
                <span className="exit-chip-label">{ex.label}</span>
                <span className="exit-chip-time">was present {ex.totalDurationFormatted}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chronological Entry / Exit Activity Stream */}
      <div className="people-activity-section">
        <span className="people-subhead">Entry & Exit Activity Log</span>
        {activityLog && activityLog.length > 0 ? (
          <ul className="people-activity-list">
            {activityLog.map((ev) => (
              <li
                key={ev.id}
                className={`people-activity-item ${
                  ev.type === "entry" && !ev.isCandidate
                    ? "activity-critical"
                    : ev.type === "exit"
                    ? "activity-exit"
                    : ""
                }`}
              >
                <div className="activity-icon-col">
                  {ev.type === "entry" ? (
                    <ArrowRight size={13} className={ev.isCandidate ? "text-ok" : "text-danger"} />
                  ) : (
                    <ArrowLeft size={13} className="text-muted" />
                  )}
                </div>
                <span className="activity-time">{ev.timeFormatted}</span>
                <span className="activity-msg">{ev.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="people-activity-empty">No entry or exit events logged yet.</p>
        )}
      </div>
    </div>
  );
}
