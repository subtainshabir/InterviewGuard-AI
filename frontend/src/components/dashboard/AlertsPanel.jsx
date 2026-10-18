import { BellOff } from "lucide-react";
import { mockAlerts } from "../../data/mockDashboardData";

export default function AlertsPanel({ alerts }) {
  const list = alerts ?? mockAlerts;
  const hasAlerts = list.length > 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Alerts</h2>
        <span className={`badge ${hasAlerts ? "badge-critical" : "badge-idle"}`}>{list.length}</span>
      </div>

      {hasAlerts ? (
        <ul className="alert-list">
          {list.map((alert) => (
            <li key={alert.id} className={`alert-item alert-${alert.severity}`}>
              <span className="alert-time">{alert.timestamp}</span>
              <span className="alert-type">{alert.type}</span>
              <span className="alert-desc">{alert.description}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <BellOff size={22} strokeWidth={1.5} />
          <p className="empty-title">No alerts</p>
          <p className="empty-sub">Monitoring alerts will appear here during the interview.</p>
        </div>
      )}
    </section>
  );
}