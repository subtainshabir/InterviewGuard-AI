import { useState } from "react";
import { Boxes, Users, Eye } from "lucide-react";
import { mockDetections } from "../../data/mockDashboardData";
import GazeBehaviorView from "./GazeBehaviorView";
import PeopleDetectionView from "./PeopleDetectionView";

const TABS = [
  { key: "people", label: "People", icon: Users, empty: "Awaiting camera feed" },
  { key: "gaze", label: "Gaze Behavior", icon: Eye, empty: "Awaiting gaze activity" },
  { key: "objects", label: "Objects", icon: Boxes, empty: "No objects detected" },
];

export default function DetectionPanel({ gazeBehavior, personSummary }) {
  const [activeTab, setActiveTab] = useState("people");
  const tab = TABS.find((t) => t.key === activeTab);
  const items = mockDetections[activeTab] || [];

  return (
    <section className="panel detection-panel">
      <div className="panel-header">
        <h2>Intelligence & Detections</h2>
        {personSummary && personSummary.isMultiplePeople && (
          <span className="badge badge-critical animate-pulse">
            ⚠️ {personSummary.count} People
          </span>
        )}
      </div>

      <div className="tab-row" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            className={`tab-button ${activeTab === key ? "tab-active" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "people" ? (
        <PeopleDetectionView personSummary={personSummary} />
      ) : activeTab === "gaze" ? (
        <GazeBehaviorView behavior={gazeBehavior} />
      ) : items.length > 0 ? (
        <ul className="detection-list">
          {items.map((item) => (
            <li key={item.id}>{item.label}</li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <tab.icon size={22} strokeWidth={1.5} />
          <p className="empty-title">{tab.empty}</p>
        </div>
      )}
    </section>
  );
}