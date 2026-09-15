import { mockRisk } from "../../data/mockDashboardData";

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function RiskPanel() {
  const { score, maxScore, level, note } = mockRisk;
  const fraction = Math.min(Math.max(score / maxScore, 0), 1);
  const offset = CIRCUMFERENCE * (1 - fraction);

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
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="risk-ring-center">
          <span className="risk-score">{score}</span>
          <span className="risk-max">/ {maxScore}</span>
        </div>
      </div>

      <div className="risk-level">{level}</div>
      <p className="risk-explanation">{note}</p>
    </section>
  );
}