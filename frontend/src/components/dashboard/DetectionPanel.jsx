import { useState } from "react";
import { Boxes, Users, Eye, Mic, FileText, Activity } from "lucide-react";
import GazeBehaviorView from "./GazeBehaviorView";
import SpeechBehaviorView from "./SpeechBehaviorView";
import PeopleDetectionView from "./PeopleDetectionView";
import ObjectDetectionView from "./ObjectDetectionView";
import AudioDetectionView from "./AudioDetectionView";
import TranscriptView from "./TranscriptView";

const TABS = [
  { key: "people", label: "People", icon: Users, empty: "Awaiting camera feed" },
  { key: "gaze", label: "Gaze Behavior", icon: Eye, empty: "Awaiting gaze activity" },
  { key: "speechBehavior", label: "Speech Behavior", icon: Activity, empty: "Awaiting speech activity" },
  { key: "objects", label: "Objects", icon: Boxes, empty: "No objects detected" },
  { key: "audio", label: "Audio", icon: Mic, empty: "Microphone idle" },
  { key: "transcript", label: "Transcript", icon: FileText, empty: "No speech transcribed" },
];

export default function DetectionPanel({
  gazeBehavior,
  speechBehavior,
  personSummary,
  objectSummary,
  objectModelStatus,
  objectRules,
  onToggleObjectRule,
  microphone,
  audioState,
  transcriptState,
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
            {key === "speechBehavior" && speechBehavior?.behavioralSignals?.severity && speechBehavior.behavioralSignals.severity !== "ready" && (
              <span className="tab-warn-indicator animate-pulse">!</span>
            )}
            {key === "audio" && audioState?.multipleSpeakersDetected && (
              <span className="tab-warn-indicator animate-pulse">!</span>
            )}
            {key === "transcript" && transcriptState?.segments?.length > 0 && (
              <span className="tab-count-pill">{transcriptState.segments.length}</span>
            )}
            {key === "transcript" && transcriptState?.stats?.suspectSegmentsCount > 0 && (
              <span className="tab-warn-indicator animate-pulse">!</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "people" ? (
        <PeopleDetectionView personSummary={personSummary} />
      ) : activeTab === "gaze" ? (
        <GazeBehaviorView behavior={gazeBehavior} />
      ) : activeTab === "speechBehavior" ? (
        <SpeechBehaviorView behavior={speechBehavior} microphone={microphone} />
      ) : activeTab === "objects" ? (
        <ObjectDetectionView
          objectSummary={objectSummary}
          modelStatus={objectModelStatus}
          rules={objectRules}
          onToggleRule={onToggleObjectRule}
        />
      ) : activeTab === "audio" ? (
        <AudioDetectionView
          microphone={microphone}
          audioState={audioState}
          transcriptState={transcriptState}
          speechBehavior={speechBehavior}
        />
      ) : (
        <TranscriptView
          transcriptState={transcriptState}
          microphone={microphone}
        />
      )}
    </section>
  );
}