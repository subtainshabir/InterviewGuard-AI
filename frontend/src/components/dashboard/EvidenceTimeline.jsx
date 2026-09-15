import { History } from "lucide-react";
import { mockEvidenceEvents } from "../../data/mockDashboardData";

export default function EvidenceTimeline() {
  const hasEvents = mockEvidenceEvents.length > 0;

  return (
    <section className="panel timeline-card">
      <div className="panel-header">
        <h2>Evidence timeline</h2>
      </div>

      {hasEvents ? (
        <ul className="timeline-list">
          {mockEvidenceEvents.map((event) => (
            <li key={event.id} className="timeline-item">
              <span className="timeline-time">{event.timestamp}</span>
              <div className="timeline-body">
                <span className="timeline-type">{event.type}</span>
                <span className="timeline-meta">
                  {event.source} · {event.confidence}% confidence · {event.duration}
                </span>
              </div>
              <span className={`badge badge-${event.severity}`}>{event.severity}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state empty-state-wide">
          <History size={24} strokeWidth={1.5} />
          <p className="empty-title">No evidence events yet</p>
          <p className="empty-sub">Monitoring events and evidence will appear here.</p>
        </div>
      )}
    </section>
  );
}