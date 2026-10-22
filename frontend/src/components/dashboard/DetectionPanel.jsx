import { useState } from "react";
import { Boxes, Users, Eye, Mic } from "lucide-react";
import GazeBehaviorView from "./GazeBehaviorView";
import PeopleDetectionView from "./PeopleDetectionView";
import ObjectDetectionView from "./ObjectDetectionView";
import AudioDetectionView from "./AudioDetectionView";

const TABS = [
  { key: "people", label: "People", icon: Users, empty: "Awaiting camera feed" },
  { key: "gaze", label: "Gaze Behavior", icon: Eye, empty: "Awaiting gaze activity" },
  { key: "objects", label: "Objects", icon: Boxes, empty: "No objects detected" },
  { key: "audio", label: "Audio", icon: Mic, empty: "Microphone idle" },
];

export default function DetectionPanel({
  gazeBehavior,
  personSummary,
  objectSummary,
  objectModelStatus,
  objectRules,
  onToggleObjectRule,
  microphone,
  audioState,
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
          {audioState?.multipleSpeakersDetected ? (
            <span className="badge badge-critical animate-pulse">
              ⚠️ Multiple Voices
            </span>
          ) : audioState?.isSpeaking ? (
            <span className="badge badge-active animate-pulse">
              🎤 Speaking ({audioState.volume}%)
            </span>
          ) : null}
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
            {key === "audio" && audioState?.multipleSpeakersDetected && (
              <span className="tab-warn-indicator animate-pulse">!</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "people" ? (
        <PeopleDetectionView personSummary={personSummary} />
      ) : activeTab === "gaze" ? (
        <GazeBehaviorView behavior={gazeBehavior} />
      ) : activeTab === "objects" ? (
        <ObjectDetectionView
          objectSummary={objectSummary}
          modelStatus={objectModelStatus}
          rules={objectRules}
          onToggleRule={onToggleObjectRule}
        />
      ) : (
        <AudioDetectionView microphone={microphone} audioState={audioState} />
      )}
    </section>
  );
}