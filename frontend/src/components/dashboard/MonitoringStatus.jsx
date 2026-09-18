import StatusCard from "./StatusCard";
import { mockStatusCards } from "../../data/mockDashboardData";

const FACE_STATE = {
  no_face: { state: "waiting", description: "No face detected" },
  face_detected: { state: "ready", description: "Face detected" },
  multiple_faces: { state: "waiting", description: "Multiple faces detected" },
};

export default function MonitoringStatus({ faceResult }) {
  const cards = mockStatusCards.map((card) => {
    if (card.key !== "face" || !faceResult || !faceResult.timestamp) return card;
    const override = FACE_STATE[faceResult.status] ?? FACE_STATE.no_face;
    return { ...card, ...override };
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