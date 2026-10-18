import StatusCard from "./StatusCard";
import { mockStatusCards } from "../../data/mockDashboardData";

const FACE_STATE = {
  no_face: { state: "waiting", description: "No face detected" },
  face_detected: { state: "ready", description: "Face detected" },
  multiple_faces: { state: "waiting", description: "Multiple faces detected" },
};

const HEAD_POSE_DESCRIPTION = {
  Center: "Head centered",
  Left: "Head turned left",
  Right: "Head turned right",
  Up: "Head tilted up",
  Down: "Head tilted down",
};

const GAZE_DESCRIPTION = {
  Center: "Gaze centered",
  Left: "Gaze left",
  Right: "Gaze right",
  Up: "Gaze up",
  Down: "Gaze down",
};

export default function MonitoringStatus({ faceResult }) {
  const primaryFace = faceResult?.faces?.[0];
  const headPose = primaryFace?.headPose;
  const gaze = primaryFace?.gaze;

  const cards = mockStatusCards.map((card) => {
    if (card.key === "face") {
      if (!faceResult || !faceResult.timestamp) return card;
      const personSummary = faceResult.personSummary;
      if (personSummary) {
        if (personSummary.isMultiplePeople) {
          return {
            ...card,
            state: "critical",
            description: `CRITICAL: ${personSummary.count} people in frame`,
          };
        }
        if (personSummary.isCandidateAbsent) {
          return {
            ...card,
            state: "waiting",
            description: "Candidate absent from frame",
          };
        }
        if (personSummary.count === 1) {
          const durSec = Math.round(personSummary.candidatePresenceMs / 1000);
          return {
            ...card,
            state: "ready",
            description: `Single candidate verified (${durSec}s in frame)`,
          };
        }
      }
      const override = FACE_STATE[faceResult.status] ?? FACE_STATE.no_face;
      return { ...card, ...override };
    }

    if (card.key === "headPose") {
      if (!headPose || !headPose.available) return card;
      const state = headPose.direction === "Center" ? "ready" : "waiting";
      const description = HEAD_POSE_DESCRIPTION[headPose.direction] ?? card.description;
      return { ...card, state, description };
    }

    if (card.key === "gaze") {
      if (!gaze || !gaze.available) return card;
      const b = gaze.behavior;
      if (b?.repeatedShifts?.detected) {
        return {
          ...card,
          state: b.repeatedShifts.severity === "critical" ? "critical" : "waiting",
          description: b.repeatedShifts.message,
        };
      }
      if (gaze.isLookingAway) {
        return {
          ...card,
          state: "waiting",
          description: `${GAZE_DESCRIPTION[gaze.direction] ?? "Looking away"} (${(gaze.durationMs / 1000).toFixed(1)}s away)`,
        };
      }
      if (b?.frequency?.shiftsPerMinute > 0) {
        return {
          ...card,
          state: "ready",
          description: `${GAZE_DESCRIPTION[gaze.direction] ?? "Gaze centered"} · ${b.frequency.shiftsPerMinute}/min (${b.temporalPattern?.pattern ?? "Normal"})`,
        };
      }
      const state = gaze.direction === "Center" ? "ready" : "waiting";
      const description = GAZE_DESCRIPTION[gaze.direction] ?? card.description;
      return { ...card, state, description };
    }

    return card;
  });

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Monitoring status</h2>
      </div>
      <div className="status-grid">
        {cards.map((card) => (
          <StatusCard
            key={card.key}
            signalKey={card.key}
            label={card.label}
            state={card.state}
            description={card.description}
          />
        ))}
      </div>
    </section>
  );
}