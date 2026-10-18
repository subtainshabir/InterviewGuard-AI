import { useState } from "react";
import { Boxes, Users, Eye } from "lucide-react";
import GazeBehaviorView from "./GazeBehaviorView";
import PeopleDetectionView from "./PeopleDetectionView";
import ObjectDetectionView from "./ObjectDetectionView";

const TABS = [
  { key: "people", label: "People", icon: Users, empty: "Awaiting camera feed" },
  { key: "gaze", label: "Gaze Behavior", icon: Eye, empty: "Awaiting gaze activity" },
  { key: "objects", label: "Objects", icon: Boxes, empty: "No objects detected" },
];

export default function DetectionPanel({
  gazeBehavior,
  personSummary,
  objectSummary,
  objectModelStatus,
}) {
  const [activeTab, setActiveTab] = useState("people");
  const tab = TABS.find((t) => t.key === activeTab);

  return (
    <section className="panel detection-panel">
      <div className="panel-header">
        <h2>Intelligence & Detections</h2>
        <div className="panel-header-badges">
          {personSummary && personSummary.isMultiplePeople && (
            <span className="badge badge-critical animate-pulse">
              ⚠️ {personSummary.count} People
            </span>
          )}
          {objectSummary && objectSummary.hasProhibited && (
            <span className="badge badge-critical animate-pulse">
              ⚠️ Prohibited Object
            </span>
          )}
        </div>
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
      ) : (
        <ObjectDetectionView
          objectSummary={objectSummary}
          modelStatus={objectModelStatus}
        />
      )}
    </section>
  );
}