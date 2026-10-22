import {
  Activity,
  Clock,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  ArrowRightLeft,
  Waves,
  Zap,
  BookOpen,
  Volume2,
  ShieldAlert,
} from "lucide-react";

export default function SpeechBehaviorView({ behavior, microphone }) {
  if (!behavior || !behavior.longPauses) {
    return (
      <div className="empty-state">
        <Waves size={24} strokeWidth={1.5} />
        <p className="empty-title">Awaiting speech activity</p>
        <p className="empty-sub">
          Start the interview camera and microphone to begin streaming real-time speech pauses, response delays, vocal transitions, and verbal behavioral analysis.
        </p>
      </div>
    );
  }

  const {
    longPauses = {},
    responseDelays = {},
    voiceTransitions = {},
    behavioralSignals = {},
  } = behavior;

  const {
    currentPauseFormatted = "0.0s",
    longPauseCount = 0,
    averagePauseFormatted = "0.0s",
    longestPauseFormatted = "0.0s",
    hesitationIndex = 0,
    isLongPauseActive = false,
    distribution = { microPct: 100, hesitationPct: 0, longPct: 0 },
    classification: pauseClass = {},
  } = longPauses;

  const {
    averageDelayFormatted = "0.0s",
    lastResponseDelayFormatted = "0.0s",
    delayedResponsesCount = 0,
    classification: delayClass = {},
    latencyScore = 100,
  } = responseDelays;

  const {
    transitionsPerMinute = 0,
    turnHandoffs = 0,
    pitchVariance = 0,
    smoothness = "Smooth",
    smoothnessSeverity = "ready",
  } = voiceTransitions;

  const {
    pattern = "Natural Fluency",
    riskLevel = "Low Risk",
    severity = "ready",
    description = "Normal verbal rhythm and cognitive pause profile.",
    fluencyScore = 90,
    scriptReadingProbability = 0,
    coachingCorrelationScore = 0,
    riskScore = 0,
  } = behavioralSignals;

  return (
    <div className="speech-analytics-container">
      {/* 1. Top Behavioral Pattern Classification Banner */}
      <div className={`speech-pattern-banner speech-severity-${severity}`}>
        <div className="speech-pattern-header">
          <div className="speech-pattern-title-row">
            <Activity size={18} />
            <span className="speech-pattern-name">{pattern}</span>
          </div>
          <span className={`badge badge-${severity}`}>
            {riskLevel} {riskScore > 0 ? `(+${riskScore} pts)` : ""}
          </span>
        </div>
        <p className="speech-pattern-desc">{description}</p>
      </div>

      {/* 2. 2x2 Grid of the 4 Speech Behavior Dimensions */}
      <div className="speech-metrics-grid">
        {/* Pillar 1: Long Pauses */}
        <div
          className={`speech-metric-card ${
            isLongPauseActive ? "card-highlight-warn animate-pulse" : ""
          }`}
        >
          <div className="speech-metric-top">
            <span className="speech-metric-label">
              <Hourglass size={13} /> 1. Long Pauses
            </span>
            <span className={`badge badge-${pauseClass.severity || "ready"}`}>
              {pauseClass.level || "Natural Flow"}
            </span>
          </div>

          <div className="speech-metric-value-row">
            <span
              className={`speech-stat-large ${
                isLongPauseActive ? "text-warn" : ""
              }`}
            >
              {currentPauseFormatted}
            </span>
            <span className="speech-stat-unit">current pause</span>
          </div>

          <div className="speech-metric-sub">
            <span>Long pauses (&gt;3.5s): <strong>{longPauseCount}</strong></span>
            <span>Max pause: <strong>{longestPauseFormatted}</strong></span>
          </div>

          {/* Hesitation Index Track */}
          <div className="speech-progress-section">
            <div className="speech-progress-labels">
              <span>Hesitation Index</span>
              <span className="font-mono">{hesitationIndex}%</span>
            </div>
            <div className="speech-meter-track">
              <div
                className={`speech-meter-fill ${
                  hesitationIndex > 50 ? "fill-warn" : "fill-accent"
                }`}
                style={{ width: `${Math.min(100, hesitationIndex)}%` }}
              />
            </div>
          </div>

          {/* Pause Distribution */}
          <div className="speech-distribution-row">
            <div className="dist-col">
              <span className="dist-label">Micro (&lt;1.5s)</span>
              <span className="dist-val text-accent">{distribution.microPct}%</span>
            </div>
            <div className="dist-col">
              <span className="dist-label">Hesitation (1.5-3.5s)</span>
              <span className="dist-val text-warn">{distribution.hesitationPct}%</span>
            </div>
            <div className="dist-col">
              <span className="dist-label">Prolonged (&gt;3.5s)</span>
              <span
                className={`dist-val ${
                  distribution.longPct > 0 ? "text-danger" : ""
                }`}
              >
                {distribution.longPct}%
              </span>
            </div>
          </div>
        </div>

        {/* Pillar 2: Response Delays */}
        <div
          className={`speech-metric-card ${
            delayClass.severity === "critical"
              ? "card-highlight-danger"
              : delayClass.severity === "warning"
              ? "card-highlight-warn"
              : ""
          }`}
        >
          <div className="speech-metric-top">
            <span className="speech-metric-label">
              <Clock size={13} /> 2. Response Delays
            </span>
            <span className={`badge badge-${delayClass.severity || "ready"}`}>
              {delayClass.level || "Normal"}
            </span>
          </div>

          <div className="speech-metric-value-row">
            <span className="speech-stat-large">{averageDelayFormatted}</span>
            <span className="speech-stat-unit">avg latency</span>
          </div>

          <div className="speech-metric-sub">
            <span>Last response onset: <strong>{lastResponseDelayFormatted}</strong></span>
            <span>Lagged responses (&gt;2.8s): <strong>{delayedResponsesCount}</strong></span>
          </div>

          {/* Reaction Readiness Meter */}
          <div className="speech-progress-section">
            <div className="speech-progress-labels">
              <span>Turn Readiness Score</span>
              <span className="font-mono">{latencyScore}%</span>
            </div>
            <div className="speech-meter-track">
              <div
                className={`speech-meter-fill ${
                  latencyScore < 50 ? "fill-warn" : "fill-accent"
                }`}
                style={{ width: `${Math.max(5, latencyScore)}%` }}
              />
            </div>
          </div>

          <p className="speech-footnote">
            {delayClass.severity === "critical"
              ? "⚠️ Latency exceeds 5.5s. Extended latency correlates with reading external notes."
              : delayClass.severity === "warning"
              ? "Noticeable reaction delays observed between prompt and response."
              : "Prompt, confident verbal response latency."}
          </p>
        </div>

        {/* Pillar 3: Voice Transitions */}
        <div className="speech-metric-card">
          <div className="speech-metric-top">
            <span className="speech-metric-label">
              <ArrowRightLeft size={13} /> 3. Voice Transitions
            </span>
            <span className={`badge badge-${smoothnessSeverity}`}>
              {smoothness}
            </span>
          </div>

          <div className="speech-metric-value-row">
            <span className="speech-stat-large">{transitionsPerMinute}</span>
            <span className="speech-stat-unit">transitions / min</span>
          </div>

          <div className="speech-metric-sub">
            <span>Speaker turn handoffs: <strong>{turnHandoffs}</strong></span>
            <span>Pitch variance (σ): <strong>{pitchVariance} Hz</strong></span>
          </div>

          <div className="speech-stability-indicators">
            <div className="indicator-row">
              <span className="indicator-label">Vocal Delivery Cadence:</span>
              <span className="indicator-val text-accent">{smoothness}</span>
            </div>
            <div className="indicator-row">
              <span className="indicator-label">Acoustic Pitch Stability:</span>
              <span
                className={`indicator-val ${
                  pitchVariance > 25 ? "text-warn" : "text-accent"
                }`}
              >
                {pitchVariance > 25
                  ? "Elevated Tremor / Variance"
                  : pitchVariance > 0
                  ? "Stable Intonation"
                  : "Calibrating"}
              </span>
            </div>
          </div>

          <p className="speech-footnote">
            Measures speech-silence alternation rate and acoustic pitch stability across conversational turns.
          </p>
        </div>

        {/* Pillar 4: Speech-Related Behavioral Signals */}
        <div className="speech-metric-card speech-metric-signals">
          <div className="speech-metric-top">
            <span className="speech-metric-label">
              <Zap size={13} /> 4. Behavioral Signals
            </span>
            <span className="badge badge-ready">{fluencyScore}% Fluency</span>
          </div>

          <div className="speech-metric-value-row">
            <span className="speech-stat-large">{fluencyScore}</span>
            <span className="speech-stat-unit">/ 100 fluency index</span>
          </div>

          {/* Anomaly Indicators */}
          <div className="speech-anomalies-list">
            <div className="anomaly-item">
              <div className="anomaly-left">
                <BookOpen size={13} className="text-secondary" />
                <span className="anomaly-name">Teleprompter / Script Reading:</span>
              </div>
              <span
                className={`badge ${
                  scriptReadingProbability >= 70
                    ? "badge-critical animate-pulse"
                    : scriptReadingProbability >= 40
                    ? "badge-warn"
                    : "badge-ready"
                }`}
              >
                {scriptReadingProbability >= 70
                  ? `⚠️ Suspect (${scriptReadingProbability}%)`
                  : scriptReadingProbability >= 40
                  ? `Possible (${scriptReadingProbability}%)`
                  : "Clear"}
              </span>
            </div>

            <div className="anomaly-item">
              <div className="anomaly-left">
                <ShieldAlert size={13} className="text-secondary" />
                <span className="anomaly-name">Off-Camera Coaching Correlation:</span>
              </div>
              <span
                className={`badge ${
                  coachingCorrelationScore >= 80
                    ? "badge-critical animate-pulse"
                    : "badge-ready"
                }`}
              >
                {coachingCorrelationScore >= 80 ? "⚠️ Echo Detected" : "No Correlation"}
              </span>
            </div>
          </div>

          <div className="proctoring-risk-summary">
            <span className="risk-summary-label">Behavioral Risk Penalty:</span>
            <span
              className={`risk-summary-score ${
                riskScore > 30 ? "text-danger" : riskScore > 0 ? "text-warn" : "text-accent"
              }`}
            >
              +{riskScore} points ({riskLevel})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
