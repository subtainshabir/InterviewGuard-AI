import { mockSession } from "../../data/mockDashboardData";

const FIELDS = [
  { key: "candidate", label: "Candidate" },
  { key: "sessionId", label: "Session ID" },
  { key: "duration", label: "Duration" },
  { key: "monitoringStatus", label: "Monitoring status" },
  { key: "startTime", label: "Start time" },
];

export default function InterviewInfo() {
  return (
    <section className="panel info-card">
      <div className="panel-header">
        <h2>Interview information</h2>
      </div>
      <dl className="info-grid">
        {FIELDS.map((field) => (
          <div key={field.key} className="info-row">
            <dt>{field.label}</dt>
            <dd>{mockSession[field.key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}