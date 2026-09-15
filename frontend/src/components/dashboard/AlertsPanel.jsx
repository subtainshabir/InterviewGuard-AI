import { BellOff } from "lucide-react";
import { mockAlerts } from "../../data/mockDashboardData";

export default function AlertsPanel() {
  const hasAlerts = mockAlerts.length > 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Alerts</h2>
        <span className="badge badge-idle">{mockAlerts.length}</span>
      </div>

      {hasAlerts ? (
        <ul className="alert-list">
          {mockAlerts.map((alert) => (
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