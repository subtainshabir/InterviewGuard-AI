import StatusCard from "./StatusCard";
import { mockStatusCards } from "../../data/mockDashboardData";

export default function MonitoringStatus() {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Monitoring status</h2>
      </div>
      <div className="status-grid">
        {mockStatusCards.map((card) => (
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