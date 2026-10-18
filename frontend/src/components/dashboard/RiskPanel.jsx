import { mockRisk } from "../../data/mockDashboardData";

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function RiskPanel({ risk }) {
  const currentRisk = risk ?? mockRisk;
  const { score, maxScore, level, note } = currentRisk;
  const fraction = Math.min(Math.max(score / maxScore, 0), 1);
  const offset = CIRCUMFERENCE * (1 - fraction);

  const levelColor =
    score >= 70
      ? "var(--danger)"
      : score >= 45
      ? "var(--warn)"
      : score >= 20
      ? "var(--accent)"
      : "var(--ok)";

  return (
    <section className="panel risk-card">
      <div className="panel-header">
        <h2>Integrity risk</h2>
      </div>

      <div className="risk-visual">
        <svg viewBox="0 0 120 120" className="risk-ring">
          <circle cx="60" cy="60" r={RADIUS} className="risk-ring-track" />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            className="risk-ring-progress"
            style={{ stroke: levelColor }}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="risk-ring-center">
          <span className="risk-score">{score}</span>
          <span className="risk-max">/ {maxScore}</span>
        </div>
      </div>

      <div className="risk-level" style={{ color: levelColor }}>
        {level}
      </div>
      <p className="risk-explanation">{note}</p>
    </section>
  );
}