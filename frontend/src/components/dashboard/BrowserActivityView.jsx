import { useState } from "react";
import {
  Monitor,
  Layers,
  Maximize2,
  Minimize2,
  Copy,
  Keyboard,
  Shield,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  Zap,
  MousePointer,
  RotateCcw,
  Sliders,
  Filter,
} from "lucide-react";

export default function BrowserActivityView({ browserMonitoring }) {
  const [subTab, setSubTab] = useState("overview"); // "overview" | "events" | "security"
  const [categoryFilter, setCategoryFilter] = useState("all"); // "all" | "tab" | "focus" | "fullscreen" | "clipboard" | "shortcut" | "system"

  if (!browserMonitoring) {
    return (
      <div className="empty-state">
        <Monitor size={24} strokeWidth={1.5} />
        <p className="empty-title">Browser monitoring initializing…</p>
        <p className="empty-sub">Connecting browser event listeners and telemetry hooks.</p>
      </div>
    );
  }

  const {
    tabActivity,
    windowFocus,
    fullscreen,
    clipboard,
    shortcuts,
    systemMetrics,
    browserEvents,
    integrityScore,
    risk,
    summary,
    policies,
    togglePolicy,
    enterFullscreen,
    exitFullscreen,
    clearEvents,
  } = browserMonitoring;

  const filteredEvents = browserEvents.filter((evt) => {
    if (categoryFilter === "all") return true;
    return evt.category === categoryFilter;
  });

  return (
    <div className="browser-activity-view">
      {/* Top Telemetry Header & Sub-tab Bar */}
      <div className="browser-header-strip">
        <div className="browser-integrity-summary">
          <div className="integrity-gauge-mini">
            <span
              className={`integrity-val ${
                integrityScore >= 80
                  ? "val-good"
                  : integrityScore >= 50
                  ? "val-warning"
                  : "val-critical"
              }`}
            >
              {integrityScore}%
            </span>
            <span className="integrity-lbl">Session Integrity</span>
          </div>

          <div className="integrity-status-pill">
            <span
              className={`badge ${
                risk.level === "High Risk"
                  ? "badge-critical animate-pulse"
                  : risk.level === "Elevated Risk"
                  ? "badge-warning"
                  : "badge-ready"
              }`}
            >
              {risk.level === "High Risk" && <ShieldAlert size={12} />}
              {risk.level === "Elevated Risk" && <AlertTriangle size={12} />}
              {risk.level === "Low Risk" && <CheckCircle2 size={12} />}
              {risk.level}
            </span>
            <span className="integrity-note">{risk.note}</span>
          </div>
        </div>

        <div className="browser-subtabs">
          <button
            className={`subtab-btn ${subTab === "overview" ? "subtab-active" : ""}`}
            onClick={() => setSubTab("overview")}
          >
            <Sliders size={13} />
            Telemetry
          </button>
          <button
            className={`subtab-btn ${subTab === "events" ? "subtab-active" : ""}`}
            onClick={() => setSubTab("events")}
          >
            <History size={13} />
            Event Stream
            {browserEvents.length > 0 && (
              <span className="subtab-badge">{browserEvents.length}</span>
            )}
          </button>
          <button
            className={`subtab-btn ${subTab === "security" ? "subtab-active" : ""}`}
            onClick={() => setSubTab("security")}
          >
            <Shield size={13} />
            Security Rules
          </button>
        </div>
      </div>

      {/* SUBTAB: OVERVIEW TELEMETRY */}
      {subTab === "overview" && (
        <div className="browser-overview-content">
          <div className="browser-cards-grid">
            {/* Card 1: Tab Switching */}
            <div
              className={`browser-card ${
                tabActivity.isTabHidden
                  ? "card-critical animate-pulse"
                  : tabActivity.switchCount > 0
                  ? "card-warning"
                  : "card-normal"
              }`}
            >
              <div className="browser-card-header">
                <div className="card-title-group">
                  <Layers size={16} className="card-icon" />
                  <h4>Tab Visibility</h4>
                </div>
                <span
                  className={`status-pill ${
                    tabActivity.isTabHidden
                      ? "pill-critical"
                      : tabActivity.switchCount > 0
                      ? "pill-warning"
                      : "pill-good"
                  }`}
                >
                  {tabActivity.isTabHidden ? "Away from Tab" : "Active Tab"}
                </span>
              </div>
              <div className="browser-card-metric">
                <span className="metric-large">{tabActivity.switchCount}</span>
                <span className="metric-desc">Switches detected</span>
              </div>
              <div className="browser-card-footer">
                <span>Total away: {summary.totalAwayFormatted}</span>
                {tabActivity.isTabHidden && (
                  <span className="badge-critical">
                    Current: {summary.currentAwayFormatted}
                  </span>
                )}
              </div>
            </div>

            {/* Card 2: Window Focus */}
            <div
              className={`browser-card ${
                !windowFocus.isFocused
                  ? "card-warning animate-pulse"
                  : windowFocus.blurCount > 0
                  ? "card-normal"
                  : "card-normal"
              }`}
            >
              <div className="browser-card-header">
                <div className="card-title-group">
                  <Monitor size={16} className="card-icon" />
                  <h4>Window Focus</h4>
                </div>
                <span
                  className={`status-pill ${
                    windowFocus.isFocused ? "pill-good" : "pill-warning"
                  }`}
                >
                  {windowFocus.isFocused ? "In Focus" : "Focus Lost"}
                </span>
              </div>
              <div className="browser-card-metric">
                <span className="metric-large">{windowFocus.blurCount}</span>
                <span className="metric-desc">Unfocus instances</span>
              </div>
              <div className="browser-card-footer">
                <span>
                  Total unfocused: {Math.round(windowFocus.totalBlurDurationMs / 1000)}s
                </span>
                {!windowFocus.isFocused && (
                  <span className="badge-warning">
                    Lost: {Math.round(windowFocus.currentBlurDurationMs / 1000)}s
                  </span>
                )}
              </div>
            </div>

            {/* Card 3: Fullscreen Mode */}
            <div
              className={`browser-card ${
                !fullscreen.isFullscreen && policies.requireFullscreen
                  ? "card-critical"
                  : "card-normal"
              }`}
            >
              <div className="browser-card-header">
                <div className="card-title-group">
                  {fullscreen.isFullscreen ? (
                    <Minimize2 size={16} className="card-icon text-success" />
                  ) : (
                    <Maximize2 size={16} className="card-icon" />
                  )}
                  <h4>Fullscreen Guard</h4>
                </div>
                <span
                  className={`status-pill ${
                    fullscreen.isFullscreen ? "pill-good" : "pill-idle"
                  }`}
                >
                  {fullscreen.isFullscreen ? "Fullscreen" : "Windowed"}
                </span>
              </div>
              <div className="browser-card-metric">
                <span className="metric-large">{fullscreen.exitCount}</span>
                <span className="metric-desc">Exits logged</span>
              </div>
              <div className="browser-card-footer">
                <button
                  className="btn-tiny-action"
                  onClick={fullscreen.isFullscreen ? exitFullscreen : enterFullscreen}
                >
                  {fullscreen.isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                </button>
              </div>
            </div>

            {/* Card 4: Clipboard Monitor */}
            <div
              className={`browser-card ${
                clipboard.pasteCount > 0
                  ? "card-critical"
                  : clipboard.copyCount > 0
                  ? "card-warning"
                  : "card-normal"
              }`}
            >
              <div className="browser-card-header">
                <div className="card-title-group">
                  <Copy size={16} className="card-icon" />
                  <h4>Clipboard Activity</h4>
                </div>
                <span
                  className={`status-pill ${
                    clipboard.pasteCount > 0
                      ? "pill-critical"
                      : clipboard.copyCount > 0
                      ? "pill-warning"
                      : "pill-good"
                  }`}
                >
                  {clipboard.pasteCount > 0
                    ? `${clipboard.pasteCount} Pastes`
                    : "Secure"}
                </span>
              </div>
              <div className="browser-card-stats-row">
                <div className="sub-stat">
                  <span className="sub-stat-num">{clipboard.copyCount}</span>
                  <span className="sub-stat-label">Copies</span>
                </div>
                <div className="sub-stat">
                  <span className="sub-stat-num val-critical">{clipboard.pasteCount}</span>
                  <span className="sub-stat-label">Pastes</span>
                </div>
                <div className="sub-stat">
                  <span className="sub-stat-num">{clipboard.cutCount}</span>
                  <span className="sub-stat-label">Cuts</span>
                </div>
              </div>
              <div className="browser-card-footer">
                <span>
                  {clipboard.lastAction
                    ? `Last: ${clipboard.lastAction.toUpperCase()} (${clipboard.lastTextLength} chars)`
                    : "No clipboard actions"}
                </span>
              </div>
            </div>

            {/* Card 5: Suspicious Keyboard Shortcuts */}
            <div
              className={`browser-card ${
                shortcuts.blockedCount > 0 ? "card-warning" : "card-normal"
              }`}
            >
              <div className="browser-card-header">
                <div className="card-title-group">
                  <Keyboard size={16} className="card-icon" />
                  <h4>Keyboard Shortcuts</h4>
                </div>
                <span
                  className={`status-pill ${
                    shortcuts.blockedCount > 0 ? "pill-warning" : "pill-good"
                  }`}
                >
                  {shortcuts.blockedCount > 0
                    ? `${shortcuts.blockedCount} Intercepted`
                    : "Normal"}
                </span>
              </div>
              <div className="browser-card-metric">
                <span className="metric-large">{shortcuts.blockedCount}</span>
                <span className="metric-desc">Restricted keys</span>
              </div>
              <div className="browser-card-footer">
                <span className="truncate">
                  {shortcuts.lastShortcut
                    ? `Recent: ${shortcuts.lastShortcut}`
                    : "DevTools, Tab & OS Keys Monitored"}
                </span>
              </div>
            </div>

            {/* Card 6: Browser Environment */}
            <div className="browser-card card-normal">
              <div className="browser-card-header">
                <div className="card-title-group">
                  <MousePointer size={16} className="card-icon" />
                  <h4>Viewport & System</h4>
                </div>
                <span
                  className={`status-pill ${
                    systemMetrics.isOnline ? "pill-good" : "pill-critical"
                  }`}
                >
                  {systemMetrics.isOnline ? "Online" : "Offline"}
                </span>
              </div>
              <div className="browser-card-stats-row">
                <div className="sub-stat">
                  <span className="sub-stat-num">{systemMetrics.mouseLeaveCount}</span>
                  <span className="sub-stat-label">Cursor Exits</span>
                </div>
                <div className="sub-stat">
                  <span className="sub-stat-num">{systemMetrics.contextMenuCount}</span>
                  <span className="sub-stat-label">Right Clicks</span>
                </div>
                <div className="sub-stat">
                  <span className="sub-stat-num">{systemMetrics.resizeCount}</span>
                  <span className="sub-stat-label">Resizes</span>
                </div>
              </div>
              <div className="browser-card-footer">
                <span>
                  Viewport: {systemMetrics.viewport.width}×{systemMetrics.viewport.height}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Recent Activity Snippet */}
          <div className="recent-browser-stream-snippet">
            <div className="stream-header">
              <div className="stream-title-group">
                <Zap size={14} className="text-accent" />
                <h5>Live Event Highlights</h5>
              </div>
              <button
                className="btn-link"
                onClick={() => setSubTab("events")}
              >
                View all ({browserEvents.length}) →
              </button>
            </div>
            {browserEvents.length === 0 ? (
              <p className="empty-sub text-center py-2">
                No browser anomalies detected yet. System is monitoring.
              </p>
            ) : (
              <div className="stream-items-compact">
                {browserEvents.slice(0, 3).map((item) => (
                  <div key={item.id} className={`compact-event-row row-${item.severity}`}>
                    <span className="compact-time">{item.timestamp}</span>
                    <span className="compact-type">{item.label}</span>
                    <span className="compact-desc">{item.description}</span>
                    <span className={`badge badge-${item.severity}`}>
                      {item.severity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB: EVENT STREAM */}
      {subTab === "events" && (
        <div className="browser-events-content">
          <div className="events-filter-bar">
            <div className="filter-chips">
              <Filter size={13} className="filter-icon" />
              {[
                { key: "all", label: "All Events" },
                { key: "tab", label: "Tab Visibility" },
                { key: "focus", label: "Focus" },
                { key: "fullscreen", label: "Fullscreen" },
                { key: "clipboard", label: "Clipboard" },
                { key: "shortcut", label: "Shortcuts" },
                { key: "system", label: "System / Viewport" },
              ].map((chip) => (
                <button
                  key={chip.key}
                  className={`filter-chip ${
                    categoryFilter === chip.key ? "chip-active" : ""
                  }`}
                  onClick={() => setCategoryFilter(chip.key)}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <button className="btn-tiny-action" onClick={clearEvents}>
              <RotateCcw size={12} />
              Clear Log
            </button>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="empty-state">
              <History size={24} strokeWidth={1.5} />
              <p className="empty-title">No events recorded for this category</p>
              <p className="empty-sub">
                Events will appear in real time when browser interactions occur.
              </p>
            </div>
          ) : (
            <div className="browser-events-timeline">
              {filteredEvents.map((event) => (
                <div
                  key={event.id}
                  className={`timeline-event-card event-${event.severity}`}
                >
                  <div className="event-time-col">
                    <Clock size={12} />
                    <span>{event.timestamp}</span>
                  </div>
                  <div className="event-body-col">
                    <div className="event-top-line">
                      <span className="event-label">{event.label}</span>
                      <span className="event-category-tag">{event.category}</span>
                      <span className={`badge badge-${event.severity}`}>
                        {event.severity}
                      </span>
                    </div>
                    <p className="event-description">{event.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB: SECURITY RULES */}
      {subTab === "security" && (
        <div className="browser-security-content">
          <div className="security-rules-intro">
            <h4>Proctoring Enforcement Policies</h4>
            <p className="sub-text">
              Enable active browser defenses to prevent unauthorized copying, external
              assistance, and application switching during the interview.
            </p>
          </div>

          <div className="security-rules-list">
            <div className="rule-toggle-item">
              <div className="rule-info">
                <div className="rule-header-line">
                  <Copy size={16} />
                  <h5>Block Clipboard Operations (Copy / Paste / Cut)</h5>
                </div>
                <p className="rule-desc">
                  Intercepts clipboard events and blocks candidates from pasting
                  external solutions or copying test questions.
                </p>
              </div>
              <button
                className={`switch-btn ${policies.blockCopyPaste ? "switch-on" : ""}`}
                onClick={() => togglePolicy("blockCopyPaste")}
              >
                <span className="switch-slider" />
              </button>
            </div>

            <div className="rule-toggle-item">
              <div className="rule-info">
                <div className="rule-header-line">
                  <MousePointer size={16} />
                  <h5>Disable Right-Click Context Menu</h5>
                </div>
                <p className="rule-desc">
                  Prevents opening the browser context menu to block "Inspect Element"
                  and "Search Google for text".
                </p>
              </div>
              <button
                className={`switch-btn ${policies.blockContextMenu ? "switch-on" : ""}`}
                onClick={() => togglePolicy("blockContextMenu")}
              >
                <span className="switch-slider" />
              </button>
            </div>

            <div className="rule-toggle-item">
              <div className="rule-info">
                <div className="rule-header-line">
                  <Maximize2 size={16} />
                  <h5>Enforce Fullscreen Examination Mode</h5>
                </div>
                <p className="rule-desc">
                  Flags any session running outside fullscreen mode as a compliance
                  violation and penalizes integrity scores.
                </p>
              </div>
              <button
                className={`switch-btn ${policies.requireFullscreen ? "switch-on" : ""}`}
                onClick={() => togglePolicy("requireFullscreen")}
              >
                <span className="switch-slider" />
              </button>
            </div>

            <div className="rule-toggle-item">
              <div className="rule-info">
                <div className="rule-header-line">
                  <Keyboard size={16} />
                  <h5>Block Restricted Developer Shortcuts</h5>
                </div>
                <p className="rule-desc">
                  Intercepts F12, Ctrl+Shift+I, Ctrl+P, and other developer console or
                  printing hotkeys.
                </p>
              </div>
              <button
                className={`switch-btn ${
                  policies.blockRestrictedShortcuts ? "switch-on" : ""
                }`}
                onClick={() => togglePolicy("blockRestrictedShortcuts")}
              >
                <span className="switch-slider" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
