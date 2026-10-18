import { Boxes, AlertTriangle, CheckCircle2, Smartphone, BookOpen, Laptop, HelpCircle } from "lucide-react";

const ICON_MAP = {
  "cell phone": Smartphone,
  phone: Smartphone,
  book: BookOpen,
  laptop: Laptop,
};

export default function ObjectDetectionView({ objectSummary, modelStatus }) {
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

  return (
    <div className="object-detection-container">
      {/* Top Banner: Real-time Object Pipeline Status */}
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
        <span className="badge badge-idle">COCO-SSD Real-time</span>
      </div>

      {/* Objects List */}
      {objectsList.length > 0 ? (
        <div className="object-cards-grid">
          {objectsList.map((obj) => {
            const Icon = ICON_MAP[obj.label.toLowerCase()] || HelpCircle;
            return (
              <div
                key={obj.id}
                className={`object-card ${
                  obj.isProhibited ? "object-card-prohibited" : "object-card-neutral"
                }`}
              >
                <div className="object-card-top">
                  <div className="object-card-identity">
                    <Icon
                      size={16}
                      className={obj.isProhibited ? "text-danger" : "text-accent"}
                    />
                    <span className="object-card-name">{obj.label}</span>
                  </div>
                  <span
                    className={`badge ${obj.isProhibited ? "badge-critical" : "badge-ready"}`}
                  >
                    {obj.isProhibited ? "Prohibited" : "Permitted"}
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
              Camera frame is clear of cell phones, books, notes, or secondary devices.
            </span>
          </div>
        </div>
      )}

      {/* Prohibited Objects Monitored Reference */}
      <div className="object-rules-section">
        <span className="object-subhead">Monitored Prohibited Classes</span>
        <div className="object-tags-row">
          <span className="object-tag-chip tag-danger">📱 Cell Phone</span>
          <span className="object-tag-chip tag-danger">📖 Book / Notes</span>
          <span className="object-tag-chip tag-danger">💻 Secondary Laptop</span>
          <span className="object-tag-chip tag-danger">🎮 Remote Control</span>
        </div>
      </div>
    </div>
  );
}
