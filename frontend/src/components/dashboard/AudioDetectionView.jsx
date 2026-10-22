import { useState } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Activity,
  History,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Radio,
  Zap,
} from "lucide-react";

export default function AudioDetectionView({
  microphone,
  audioState,
}) {
  const [viewMode, setViewMode] = useState("telemetry"); // "telemetry" | "events"

  const {
    status = "idle",
    isMuted = false,
    errorMessage = null,
    toggleMute,
    start,
  } = microphone || {};

  const {
    isProcessing = false,
    volume = 0,
    peakVolume = 0,
    db = -60,
    voiceState = "idle",
    isSpeaking = false,
    noiseFloor = 8,
    spectrum = [],
    stats = {},
    audioEvents = [],
  } = audioState || {};

  const isActive = status === "active" || status === "muted";
  const isDenied = status === "permission_denied";

  if (status === "idle" || status === "stopped") {
    return (
      <div className="empty-state">
        <Mic size={24} strokeWidth={1.5} />
        <p className="empty-title">Microphone is offline</p>
        <p className="empty-sub">
          Start the camera or click &quot;Enable Microphone&quot; to begin audio monitoring.
        </p>
        <button
          type="button"
          className="control-button control-primary mt-3"
          onClick={start}
        >
          Enable Microphone
        </button>
      </div>
    );
  }

  if (status === "requesting") {
    return (
      <div className="empty-state">
        <Activity size={24} strokeWidth={1.5} className="animate-spin" />
        <p className="empty-title">Requesting microphone access…</p>
        <p className="empty-sub">Please allow microphone permissions in your browser dialog.</p>
      </div>
    );
  }

  if (isDenied || status === "unavailable" || status === "error") {
    return (
      <div className="empty-state">
        <ShieldAlert size={24} strokeWidth={1.5} className="text-danger" />
        <p className="empty-title">Microphone Access Error</p>
        <p className="empty-sub">
          {errorMessage || "Could not access the audio stream from your microphone."}
        </p>
      </div>
    );
  }

  const speakingSeconds = Math.round((stats.speakingTimeMs || 0) / 1000);
  const silenceSeconds = Math.round((stats.silenceTimeMs || 0) / 1000);
  const speakingPct = stats.speakingPercentage || 0;

  return (
    <div className="audio-detection-container">
      {/* Top Banner: Status & Mode Switch */}
      <div
        className={`audio-status-banner ${
          isMuted
            ? "audio-banner-muted"
            : isSpeaking
            ? "audio-banner-speaking"
            : "audio-banner-ready"
        }`}
      >
        <div className="audio-banner-left">
          <div className="audio-status-pill">
            {isMuted ? (
              <MicOff size={16} className="text-warn" />
            ) : isSpeaking ? (
              <Mic size={16} className="text-accent animate-pulse" />
            ) : (
              <Volume2 size={16} />
            )}
            <span className="audio-status-label">
              {isMuted
                ? "Microphone Muted"
                : isSpeaking
                ? "Candidate Speaking"
                : "Audio Clean · Silence"}
            </span>
          </div>

          <span
            className={`badge ${
              isMuted
                ? "badge-warn"
                : isSpeaking
                ? "badge-active animate-pulse"
                : "badge-ready"
            }`}
          >
            {isMuted ? "MUTED" : `${volume}% vol (${db} dB)`}
          </span>
        </div>

        <div className="audio-mode-switch">
          <button
            className={`mode-btn ${viewMode === "telemetry" ? "mode-btn-active" : ""}`}
            onClick={() => setViewMode("telemetry")}
          >
            Telemetry & Spectrum
          </button>
          <button
            className={`mode-btn ${viewMode === "events" ? "mode-btn-active" : ""}`}
            onClick={() => setViewMode("events")}
          >
            <History size={12} />
            Events ({audioEvents.length})
          </button>
          <button
            className="mode-btn mode-btn-mute"
            onClick={toggleMute}
            title={isMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {isMuted ? <Mic size={13} /> : <MicOff size={13} />}
            {isMuted ? "Unmute" : "Mute"}
          </button>
        </div>
      </div>

      {viewMode === "telemetry" ? (
        <>
          {/* Real-time 16-band Frequency Waveform Equalizer */}
          <div className="spectrum-card">
            <div className="spectrum-header">
              <span className="spectrum-title">Live Frequency Waveform</span>
              <span className="spectrum-meta">
                {isMuted ? "Muted" : isSpeaking ? "Active Speech Bands" : "Ambient Baseline"}
              </span>
            </div>

            <div className="spectrum-bars-row">
              {spectrum.map((val, idx) => (
                <div key={idx} className="spectrum-bar-col">
                  <div
                    className={`spectrum-bar-fill ${
                      isMuted
                        ? "spectrum-fill-muted"
                        : val > 65
                        ? "spectrum-fill-high"
                        : val > 25
                        ? "spectrum-fill-speech"
                        : "spectrum-fill-idle"
                    }`}
                    style={{ height: `${Math.max(6, val)}%` }}
                  />
                </div>
              ))}
            </div>

            <div className="spectrum-labels-row">
              <span>Low (85Hz)</span>
              <span>Mid Vocals (1kHz)</span>
              <span>High (4kHz)</span>
            </div>
          </div>

          {/* 4 Telemetry Metrics Cards */}
          <div className="audio-metrics-grid">
            <div className="audio-metric-card">
              <span className="audio-metric-label">Live Audio Level</span>
              <div className="audio-metric-val-row">
                <span className="audio-metric-num">{volume}%</span>
                <span className="audio-metric-sub">{db} dB</span>
              </div>
              <div className="audio-meter-bar-track">
                <div
                  className={`audio-meter-bar-fill ${
                    volume > 75 ? "meter-danger" : volume > 35 ? "meter-speech" : "meter-normal"
                  }`}
                  style={{ width: `${volume}%` }}
                />
              </div>
            </div>

            <div className="audio-metric-card">
              <span className="audio-metric-label">Speaking Ratio</span>
              <div className="audio-metric-val-row">
                <span className="audio-metric-num">{speakingPct}%</span>
                <span className="audio-metric-sub">{speakingSeconds}s speech</span>
              </div>
              <div className="audio-ratio-bar-track">
                <div
                  className="audio-ratio-bar-speech"
                  style={{ width: `${speakingPct}%` }}
                  title={`Speaking: ${speakingPct}%`}
                />
                <div
                  className="audio-ratio-bar-silence"
                  style={{ width: `${100 - speakingPct}%` }}
                  title={`Silence: ${100 - speakingPct}%`}
                />
              </div>
            </div>

            <div className="audio-metric-card">
              <span className="audio-metric-label">Background Noise Floor</span>
              <div className="audio-metric-val-row">
                <span className="audio-metric-num">{noiseFloor}%</span>
                <span className="audio-metric-sub">
                  {noiseFloor < 12 ? "Quiet Room" : noiseFloor < 22 ? "Moderate" : "Noisy Ambient"}
                </span>
              </div>
              <span className="audio-metric-footnote">Calibrated environmental baseline</span>
            </div>

            <div className="audio-metric-card">
              <span className="audio-metric-label">Peak Volume</span>
              <div className="audio-metric-val-row">
                <span className="audio-metric-num">{peakVolume}%</span>
                <span className="audio-metric-sub">
                  {peakVolume > 85 ? "Loud Acoustic Spike" : "Optimal"}
                </span>
              </div>
              <span className="audio-metric-footnote">Highest amplitude detected</span>
            </div>
          </div>
        </>
      ) : (
        /* Event History View */
        <div className="audio-events-list">
          {audioEvents.length === 0 ? (
            <div className="empty-sub py-6 text-center">
              No acoustic events logged yet. Speak into the microphone to log events.
            </div>
          ) : (
            audioEvents.map((evt) => (
              <div
                key={evt.id}
                className={`audio-event-item ${
                  evt.severity === "warning"
                    ? "audio-event-warning"
                    : "audio-event-ready"
                }`}
              >
                <div className="audio-event-time">
                  <Clock size={11} />
                  <span>{evt.formattedTime}</span>
                </div>
                <div className="audio-event-msg">{evt.message}</div>
                <span
                  className={`badge ${
                    evt.severity === "warning" ? "badge-warn" : "badge-active"
                  }`}
                >
                  {evt.type.replace("_", " ")}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
