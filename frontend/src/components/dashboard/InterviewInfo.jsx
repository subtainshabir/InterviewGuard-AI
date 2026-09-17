const STATUS_LABEL = {
  scheduled: "Ready",
  ready: "Ready",
  active: "Monitoring",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatTimestamp(value) {
  if (!value) return "—";
  return new Date(`${value}Z`).toLocaleString();
}

export default function InterviewInfo({ session, elapsedLabel }) {
  const fields = [
    { key: "candidate", label: "Candidate", value: session?.candidate?.name ?? "—" },
    { key: "sessionId", label: "Session ID", value: session?.session_code ?? "—" },
    { key: "duration", label: "Duration", value: session ? elapsedLabel : "00:00" },
    {
      key: "monitoringStatus",
      label: "Monitoring status",
      value: STATUS_LABEL[session?.status] ?? "Ready",
    },
    { key: "startTime", label: "Start time", value: formatTimestamp(session?.started_at) },
  ];

  return (
    <section className="panel info-card">
      <div className="panel-header">
        <h2>Interview information</h2>
      </div>
      <dl className="info-grid">
        {fields.map((field) => (
          <div key={field.key} className="info-row">
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}