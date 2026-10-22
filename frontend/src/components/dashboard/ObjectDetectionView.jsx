import { useState } from "react";
import {
  Boxes,
  AlertTriangle,
  CheckCircle2,
  Smartphone,
  Tablet,
  Laptop,
  Monitor,
  BookOpen,
  Headphones,
  Radio,
  Sliders,
  Check,
  X,
  HelpCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  History,
  ShieldAlert,
  Zap,
  LogOut,
} from "lucide-react";

const ICON_MAP = {
  Smartphone: Smartphone,
  Tablet: Tablet,
  Laptop: Laptop,
  Monitor: Monitor,
  BookOpen: BookOpen,
  Headphones: Headphones,
  Radio: Radio,
};

export default function ObjectDetectionView({
  objectSummary,
  modelStatus,
  rules = [],
  onToggleRule,
}) {
  const [viewMode, setViewMode] = useState("detections"); // "detections" | "history" | "rules"
  const [filterType, setFilterType] = useState("all"); // "all" | "prohibited" | "persistent"

  if (modelStatus === "loading") {
    return (
      <div className="empty-state">
        <Boxes size={22} strokeWidth={1.5} className="animate-spin" />
        <p className="empty-title">Loading YOLO11 neural detector…</p>
        <p className="empty-sub">Initializing Ultralytics YOLO11 ONNX neural detection pipeline.</p>
      </div>
    );
  }

  if (modelStatus === "error") {
    return (
      <div className="empty-state">
        <AlertTriangle size={22} strokeWidth={1.5} className="text-danger" />
        <p className="empty-title">Object detector unavailable</p>
        <p className="empty-sub">Could not load the object detection model.</p>
      </div>
    );
  }

  const {
    count = 0,
    prohibitedCount = 0,
    persistentCount = 0,
    hasProhibited = false,
    objectsList = [],
    exitedObjects = [],
    activityLog = [],
  } = objectSummary || {};

  const enabledRulesCount = rules.filter((r) => r.enabled).length;

  const filteredObjects = objectsList.filter((obj) => {
    if (filterType === "prohibited") return obj.isProhibited;
    if (filterType === "persistent") return obj.isPersistent;
    return true;
  });

  return (
    <div className="object-detection-container">
      {/* Top Banner: Mode Selector & Status */}
      <div
        className={`object-status-banner ${
          hasProhibited ? "object-banner-critical" : "object-banner-ready"
        }`}
      >
        <div className="object-banner-left">
          <div className="object-count-pill">
            <Boxes size={16} />
            <span className="object-count-num">{count}</span>
            <span className="object-count-label">
              {count === 1 ? "Object in view" : "Objects in view"}
            </span>
          </div>

          <span className={`badge ${hasProhibited ? "badge-critical" : "badge-ready"}`}>
            {hasProhibited
              ? `⚠️ ${prohibitedCount} Prohibited Item${prohibitedCount > 1 ? "s" : ""}`
              : "Clean Feed (No Prohibited Items)"}
          </span>

          {persistentCount > 0 && (
            <span className="badge badge-warn animate-pulse">
              ⏱️ {persistentCount} Persistent Object{persistentCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* View Switcher: Live Tracks vs Event History vs Policy Rules */}
        <div className="object-mode-switch">
          <button
            className={`mode-btn ${viewMode === "detections" ? "mode-btn-active" : ""}`}
            onClick={() => setViewMode("detections")}
          >
            Live Tracks ({count})
          </button>
          <button
            className={`mode-btn ${viewMode === "history" ? "mode-btn-active" : ""}`}
            onClick={() => setViewMode("history")}
          >
            <History size={12} />
            Events ({activityLog.length})
          </button>
          <button
            className={`mode-btn ${viewMode === "rules" ? "mode-btn-active" : ""}`}
            onClick={() => setViewMode("rules")}
          >
            <Sliders size={12} />
            Rules ({enabledRulesCount}/{rules.length})
          </button>
        </div>
      </div>

      {viewMode === "detections" && (
        /* View 1: Live Detected Objects & Spatial Event Tracking */
        <>
          {/* Quick Filter Bar when objects are present */}
          {objectsList.length > 0 && (
            <div className="object-filters-row">
              <span className="object-filter-label">Filter:</span>
              <button
                className={`filter-chip ${filterType === "all" ? "filter-chip-active" : ""}`}
                onClick={() => setFilterType("all")}
              >
                All ({objectsList.length})
              </button>
              <button
                className={`filter-chip ${filterType === "prohibited" ? "filter-chip-active" : ""}`}
                onClick={() => setFilterType("prohibited")}
              >
                Unauthorized ({prohibitedCount})
              </button>
              <button
                className={`filter-chip ${filterType === "persistent" ? "filter-chip-active" : ""}`}
                onClick={() => setFilterType("persistent")}
              >
                Persistent ({persistentCount})
              </button>
            </div>
          )}

          {filteredObjects.length > 0 ? (
            <div className="object-cards-grid">
              {filteredObjects.map((obj) => {
                const matchedRule = rules.find((r) => r.name === obj.label);
                const IconComponent =
                  (matchedRule && ICON_MAP[matchedRule.icon]) || HelpCircle;

                return (
                  <div
                    key={obj.id}
                    className={`object-card ${
                      obj.isProhibited ? "object-card-prohibited" : "object-card-neutral"
                    } ${obj.isPersistent ? "object-card-persistent" : ""}`}
                  >
                    {/* Header: Label, Track ID, Badges */}
                    <div className="object-card-top">
                      <div className="object-card-identity">
                        <div
                          className={`object-icon-wrap ${
                            obj.isProhibited ? "icon-wrap-danger" : "icon-wrap-neutral"
                          }`}
                        >
                          <IconComponent
                            size={16}
                            className={obj.isProhibited ? "text-danger" : "text-accent"}
                          />
                        </div>
                        <div className="object-name-col">
                          <span className="object-card-name">{obj.label}</span>
                          <span className="object-track-id">{obj.id}</span>
                        </div>
                      </div>

                      <div className="object-badges-stack">
                        {/* Persistence Badge */}
                        {obj.persistence === "highly_persistent" ? (
                          <span className="badge badge-purple" title="In view continuously for >15s">
                            Stationary (&gt;15s)
                          </span>
                        ) : obj.isPersistent ? (
                          <span
                            className={`badge ${obj.isProhibited ? "badge-critical" : "badge-warn"}`}
                            title="In view continuously for >3s"
                          >
                            Persistent (&gt;3s)
                          </span>
                        ) : (
                          <span className="badge badge-transient" title="Transient (<3s)">
                            Transient
                          </span>
                        )}

                        <span
                          className={`badge ${obj.isProhibited ? "badge-critical" : "badge-ready"}`}
                        >
                          {obj.isProhibited ? "Unauthorized" : "Permitted"}
                        </span>
                      </div>
                    </div>

                    {/* Detections Duration & Time Stats */}
                    <div className="object-timing-box">
                      <div className="timing-item">
                        <span className="timing-label">
                          <Clock size={11} /> Duration
                        </span>
                        <span className="timing-val duration-highlight">
                          {obj.durationFormatted || "0s"}
                        </span>
                      </div>
                      <div className="timing-item">
                        <span className="timing-label">1st Seen</span>
                        <span className="timing-val">{obj.firstDetectedFormatted || "--:--"}</span>
                      </div>
                      <div className="timing-item">
                        <span className="timing-label">Last Seen</span>
                        <span className="timing-val">{obj.lastDetectedFormatted || "--:--"}</span>
                      </div>
                    </div>

                    {/* Confidence History & Trend Metrics */}
                    <div className="object-card-meta">
                      <div className="object-conf-row">
                        <div className="conf-trend-group">
                          <span className="object-conf-label">Confidence</span>
                          <span className={`trend-indicator trend-${obj.confidenceTrend}`}>
                            {obj.confidenceTrend === "rising" && <TrendingUp size={11} />}
                            {obj.confidenceTrend === "falling" && <TrendingDown size={11} />}
                            {obj.confidenceTrend === "stable" && <Minus size={11} />}
                            {obj.confidenceTrend}
                          </span>
                        </div>

                        <div className="conf-stats-group">
                          <span className="conf-stat-chip">Avg {obj.avgConfidence}%</span>
                          <span className="conf-stat-chip">Peak {obj.peakConfidence}%</span>
                          <span className="object-conf-val">{obj.confidencePercent}%</span>
                        </div>
                      </div>

                      {/* Rolling Confidence Sparkbars */}
                      {obj.confidenceHistory && obj.confidenceHistory.length > 0 && (
                        <div className="conf-sparkbars" title="Rolling confidence history across frames">
                          {obj.confidenceHistory.map((val, idx) => (
                            <div
                              key={idx}
                              className={`sparkbar-bar ${
                                obj.isProhibited ? "sparkbar-danger" : "sparkbar-accent"
                              }`}
                              style={{ height: `${Math.max(15, val)}%` }}
                              title={`Frame ${idx + 1}: ${val}%`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="object-empty-state">
              <CheckCircle2 size={20} className="text-ok" />
              <div className="object-empty-info">
                <span className="object-empty-title">No objects detected</span>
                <span className="object-empty-desc">
                  Camera feed is clear of unauthorized devices, notes, or secondary displays.
                </span>
              </div>
            </div>
          )}

          {/* Recently Departed / Exited Objects Section */}
          {exitedObjects.length > 0 && (
            <div className="exited-objects-section">
              <div className="exited-header">
                <LogOut size={13} className="text-muted" />
                <span className="object-subhead">Recently Departed Objects</span>
                <span className="exited-count-badge">{exitedObjects.length}</span>
              </div>

              <div className="exited-list">
                {exitedObjects.map((item) => (
                  <div key={item.id} className="exited-row">
                    <div className="exited-left">
                      <span
                        className={`badge ${item.isProhibited ? "badge-critical" : "badge-idle"}`}
                      >
                        {item.label}
                      </span>
                      <span className="exited-time-range">
                        Seen {item.firstDetectedFormatted} → Exited {item.lastDetectedFormatted}
                      </span>
                    </div>
                    <div className="exited-right">
                      <span className="exited-duration">
                        Total Presence: <strong>{item.totalDurationFormatted}</strong>
                      </span>
                      <span className="exited-peak">Peak Conf: {item.peakConfidence}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Monitored Rules Summary */}
          <div className="object-rules-section">
            <div className="object-rules-header-row">
              <span className="object-subhead">Active Prohibited Objects Policy</span>
              <button
                className="rules-config-link"
                onClick={() => setViewMode("rules")}
              >
                Configure Policy →
              </button>
            </div>
            <div className="object-tags-row">
              {rules.map((rule) => {
                const Icon = ICON_MAP[rule.icon] || HelpCircle;
                return (
                  <span
                    key={rule.id}
                    className={`object-tag-chip ${
                      rule.enabled ? "tag-danger" : "tag-disabled"
                    }`}
                  >
                    <Icon size={12} />
                    {rule.name}
                    {!rule.enabled && <span className="chip-off">(off)</span>}
                  </span>
                );
              })}
            </div>
          </div>
        </>
      )}

      {viewMode === "history" && (
        /* View 2: Object Event Activity Log & Departures */
        <div className="object-history-container">
          <div className="history-header">
            <div>
              <h3 className="history-title">Object Tracking Event Log</h3>
              <p className="history-sub">
                Chronological real-time record of first detections, persistence confirmations, and exits.
              </p>
            </div>
            <span className="badge badge-idle">{activityLog.length} Events Logged</span>
          </div>

          {activityLog.length > 0 ? (
            <div className="activity-timeline">
              {activityLog.map((act) => {
                const isFirst = act.type === "first_detection";
                const isPersist = act.type === "persistent_confirmed";
                const isStationary = act.type === "highly_persistent";
                const isExit = act.type === "last_detection";

                const Icon = isFirst
                  ? Zap
                  : isStationary
                  ? ShieldAlert
                  : isPersist
                  ? AlertTriangle
                  : LogOut;

                const iconClass = act.isProhibited
                  ? "act-icon-danger"
                  : isExit
                  ? "act-icon-muted"
                  : "act-icon-accent";

                return (
                  <div key={act.id} className="act-row">
                    <span className="act-time">{act.timeFormatted}</span>
                    <div className={`act-icon-bubble ${iconClass}`}>
                      <Icon size={13} />
                    </div>
                    <div className="act-body">
                      <div className="act-headline">
                        <span className="act-type-tag">
                          {isFirst
                            ? "First Detection"
                            : isStationary
                            ? "Stationary Object (>15s)"
                            : isPersist
                            ? "Persistent Confirmed (>3s)"
                            : "Removed / Exited"}
                        </span>
                        {act.durationFormatted && (
                          <span className="act-duration-tag">
                            Presence: {act.durationFormatted}
                          </span>
                        )}
                      </div>
                      <span className="act-msg">{act.message}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="object-empty-state">
              <CheckCircle2 size={20} className="text-ok" />
              <div className="object-empty-info">
                <span className="object-empty-title">No object events recorded yet</span>
                <span className="object-empty-desc">
                  Start the camera to begin event logging and tracking unauthorized items.
                </span>
              </div>
            </div>
          )}

          {/* Exited Objects Table */}
          {exitedObjects.length > 0 && (
            <div className="exited-objects-section mt-3">
              <div className="exited-header">
                <LogOut size={13} className="text-muted" />
                <span className="object-subhead">Departed Objects Dwell Summary</span>
              </div>
              <div className="exited-list">
                {exitedObjects.map((item) => (
                  <div key={item.id} className="exited-row">
                    <div className="exited-left">
                      <span
                        className={`badge ${item.isProhibited ? "badge-critical" : "badge-idle"}`}
                      >
                        {item.label}
                      </span>
                      <span className="exited-time-range">
                        {item.firstDetectedFormatted} → {item.lastDetectedFormatted}
                      </span>
                    </div>
                    <div className="exited-right">
                      <span className="exited-duration">
                        Dwell Duration: <strong>{item.totalDurationFormatted}</strong>
                      </span>
                      <span className="exited-peak">Peak Conf: {item.peakConfidence}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {viewMode === "rules" && (
        /* View 3: Configurable Objects Policy Rules */
        <div className="object-policy-editor">
          <div className="policy-editor-header">
            <div>
              <h3 className="policy-editor-title">Configurable Object Policy</h3>
              <p className="policy-editor-sub">
                Enable or disable monitored items to match your interview integrity policy.
              </p>
            </div>
            <span className="badge badge-accent">
              {enabledRulesCount} of {rules.length} Rules Active
            </span>
          </div>

          <div className="policy-rules-list">
            {rules.map((rule) => {
              const Icon = ICON_MAP[rule.icon] || HelpCircle;
              return (
                <div
                  key={rule.id}
                  className={`policy-rule-row ${
                    rule.enabled ? "rule-row-enabled" : "rule-row-disabled"
                  }`}
                >
                  <button
                    type="button"
                    className={`policy-toggle-btn ${
                      rule.enabled ? "toggle-btn-on" : "toggle-btn-off"
                    }`}
                    onClick={() => onToggleRule?.(rule.id)}
                    aria-label={`Toggle ${rule.name}`}
                  >
                    {rule.enabled ? <Check size={13} /> : <X size={13} />}
                  </button>

                  <div className="policy-rule-icon">
                    <Icon size={18} className={rule.enabled ? "text-danger" : "text-muted"} />
                  </div>

                  <div className="policy-rule-info">
                    <div className="policy-rule-top">
                      <span className="policy-rule-name">{rule.name}</span>
                      <span
                        className={`badge ${
                          rule.severity === "critical" ? "badge-critical" : "badge-warn"
                        }`}
                      >
                        {rule.severity}
                      </span>
                      <span className="policy-penalty">+{rule.riskPenalty} Risk</span>
                    </div>
                    <span className="policy-rule-desc">{rule.description}</span>
                  </div>

                  <div className="policy-rule-meta">
                    <span className="policy-meta-label">Min Confidence</span>
                    <span className="policy-meta-val">
                      {Math.round(rule.minConfidence * 100)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
