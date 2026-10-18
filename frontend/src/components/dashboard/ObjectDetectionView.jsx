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
  onResetRules,
}) {
  const [viewMode, setViewMode] = useState("detections"); // "detections" | "rules"

  if (modelStatus === "loading") {
    return (
      <div className="empty-state">
        <Boxes size={22} strokeWidth={1.5} className="animate-spin" />
        <p className="empty-title">Loading object detector…</p>
        <p className="empty-sub">Initializing COCO-SSD MobileNet real-time detection pipeline.</p>
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

  const { count = 0, prohibitedCount = 0, hasProhibited = false, objectsList = [] } =
    objectSummary || {};

  const enabledRulesCount = rules.filter((r) => r.enabled).length;

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
        </div>

        {/* View Toggle: Live Detections vs Configurable Rules */}
        <div className="object-mode-switch">
          <button
            className={`mode-btn ${viewMode === "detections" ? "mode-btn-active" : ""}`}
            onClick={() => setViewMode("detections")}
          >
            Live Detections ({count})
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

      {viewMode === "detections" ? (
        /* View 1: Live Detected Objects */
        <>
          {objectsList.length > 0 ? (
            <div className="object-cards-grid">
              {objectsList.map((obj) => {
                const matchedRule = rules.find((r) => r.name === obj.label);
                const IconComponent =
                  (matchedRule && ICON_MAP[matchedRule.icon]) || HelpCircle;

                return (
                  <div
                    key={obj.id}
                    className={`object-card ${
                      obj.isProhibited ? "object-card-prohibited" : "object-card-neutral"
                    }`}
                  >
                    <div className="object-card-top">
                      <div className="object-card-identity">
                        <IconComponent
                          size={16}
                          className={obj.isProhibited ? "text-danger" : "text-accent"}
                        />
                        <span className="object-card-name">{obj.label}</span>
                      </div>
                      <span
                        className={`badge ${obj.isProhibited ? "badge-critical" : "badge-ready"}`}
                      >
                        {obj.isProhibited ? "Unauthorized" : "Permitted"}
                      </span>
                    </div>

                    <div className="object-card-meta">
                      <div className="object-conf-row">
                        <span className="object-conf-label">Confidence</span>
                        <span className="object-conf-val">{obj.confidencePercent}%</span>
                      </div>
                      <div className="object-conf-track">
                        <div
                          className={`object-conf-fill ${
                            obj.isProhibited ? "conf-fill-danger" : "conf-fill-accent"
                          }`}
                          style={{ width: `${obj.confidencePercent}%` }}
                        />
                      </div>
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
                  Camera frame is clear of phones, tablets, second monitors, laptops, and study notes.
                </span>
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
      ) : (
        /* View 2: Configurable Objects Policy Rules */
        <div className="object-policy-editor">
          <div className="policy-editor-header">
            <div>
              <h3 className="policy-editor-title">Configurable Object Policy</h3>
              <p className="policy-editor-sub">
                Enable or disable monitored items to match your interview integrity policy.
              </p>
            </div>
          </div>

          <div className="policy-rules-list">
            {rules.map((rule) => {
              const Icon = ICON_MAP[rule.icon] || HelpCircle;
              return (
                <div
                  key={rule.id}
                  className={`policy-rule-row ${rule.enabled ? "rule-row-enabled" : "rule-row-disabled"}`}
                >
                  <button
                    type="button"
                    className={`policy-toggle-btn ${rule.enabled ? "toggle-btn-on" : "toggle-btn-off"}`}
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
                    </div>
                    <span className="policy-rule-desc">{rule.description}</span>
                  </div>

                  <div className="policy-rule-meta">
                    <span className="policy-meta-label">Min Confidence</span>
                    <span className="policy-meta-val">{Math.round(rule.minConfidence * 100)}%</span>
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
