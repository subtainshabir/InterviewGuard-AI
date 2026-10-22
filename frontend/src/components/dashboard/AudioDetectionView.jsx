import { useState } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  Activity,
  History,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Radio,
  Zap,
  Users,
  CheckCircle2,
  AlertCircle,
  Filter,
  UserCheck,
  UserX,
  ArrowRightLeft,
  Layers,
  FileText,
} from "lucide-react";
import TranscriptView from "./TranscriptView";

export default function AudioDetectionView({
  microphone,
  audioState,
  transcriptState,
}) {
  const [viewMode, setViewMode] = useState("speakers"); // "speakers" | "transcript" | "vad" | "spectrum" | "events"
  const [eventFilter, setEventFilter] = useState("all"); // "all" | "speakers" | "speech" | "security" | "alerts"
  const [speakerLogFilter, setSpeakerLogFilter] = useState("all"); // "all" | "transitions" | "alerts"

  const {
    status = "idle",
    isMuted = false,
    errorMessage = null,
    toggleMute,
    start,
  } = microphone || {};

  const {
    volume = 0,
    peakVolume = 0,
    db = -60,
    isSpeaking = false,
    currentSegmentDurationFormatted = "0s",
    noiseFloor = 6,
    voiceActivityConfidence = 0,
    vocalEnergyRatio = 0,
    zeroCrossingRate = 0,
    cadence = { burstsPerMinute: 0, rhythm: "Quiet" },
    speakerDiarization = {},
    backgroundSpeech = { detected: false, confidence: 0, type: "none", message: "No background voices" },
    whisperDetected = false,
    multipleSpeakersDetected = false,
    spectrum = [],
    stats = {},
    audioEvents = [],
    risk = { score: 0, level: "Low Risk", note: "Normal" },
  } = audioState || {};

  const {
    isCalibrated = false,
    candidateBaselinePitch = 0,
    currentPitch = 0,
    pitchDiff = 0,
    activeSpeaker = "none",
    isAdditionalSpeakerActive = false,
    isMultipleSpeakersActive = false,
    stats: diarizationStats = {},
    statusMessage = "Monitoring speaker channels…",
  } = speakerDiarization;

  const {
    candidateSpeakingTimeMs = 0,
    additionalSpeakerTimeMs = 0,
    overlapSpeakingTimeMs = 0,
    speakerTurnCount = 0,
    candidateRatioPct = 100,
    additionalRatioPct = 0,
  } = diarizationStats;

  const isDenied = status === "permission_denied";

  if (status === "idle" || status === "stopped") {
    return (
      <div className="empty-state">
        <Mic size={24} strokeWidth={1.5} />
        <p className="empty-title">Voice Activity & Multiple Speaker Detector Offline</p>
        <p className="empty-sub">
          Start the interview camera or click &quot;Enable Microphone&quot; to initialize real-time acoustic analysis.
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
          {errorMessage || "Could not access audio stream. Please check browser microphone permissions."}
        </p>
      </div>
    );
  }

  const speakingSeconds = Math.round((stats.speechTimeMs || 0) / 1000);
  const silenceSeconds = Math.round((stats.silenceTimeMs || 0) / 1000);
  const speakingPct = stats.speakingPercentage || 0;

  const candidateSec = Math.round(candidateSpeakingTimeMs / 1000);
  const additionalSec = Math.round(additionalSpeakerTimeMs / 1000);
  const overlapSec = Math.round(overlapSpeakingTimeMs / 1000);

  // Filter audio events for main events tab
  const filteredEvents = audioEvents.filter((evt) => {
    if (eventFilter === "speakers") {
      return (
        evt.type === "speaker_transition" ||
        evt.type === "additional_speaker_detected" ||
        evt.type === "multiple_speakers" ||
        evt.type === "candidate_speech_started"
      );
    }
    if (eventFilter === "speech") {
      return evt.type === "candidate_speech_started" || evt.type === "prolonged_silence";
    }
    if (eventFilter === "security") {
      return (
        evt.type === "background_speech" ||
        evt.type === "whispering_detected" ||
        evt.type === "additional_speaker_detected" ||
        evt.type === "multiple_speakers"
      );
    }
    if (eventFilter === "alerts") {
      return evt.severity === "warning" || evt.severity === "critical";
    }
    return true;
  });

  // Dedicated speaker events for Diarization Tab
  const speakerEvents = audioEvents.filter((evt) => {
    const isSpeakerEvt =
      evt.type === "speaker_transition" ||
      evt.type === "additional_speaker_detected" ||
      evt.type === "multiple_speakers" ||
      evt.type === "candidate_speech_started";
    if (!isSpeakerEvt) return false;
    if (speakerLogFilter === "transitions") return evt.type === "speaker_transition";
    if (speakerLogFilter === "alerts") {
      return evt.type === "additional_speaker_detected" || evt.type === "multiple_speakers";
    }
    return true;
  });

  // Pitch divergence needle position: 0 Hz to 100 Hz mapped to 0% - 100%
  const pitchGaugePct = Math.min(100, Math.max(0, Math.round((pitchDiff / 100) * 100)));

  return (
    <div className="audio-detection-container">
      {/* 1. Top Status Banner */}
      <div
        className={`audio-status-banner ${
          isMuted
            ? "audio-banner-muted"
            : isMultipleSpeakersActive || multipleSpeakersDetected
            ? "audio-banner-critical"
            : isAdditionalSpeakerActive || backgroundSpeech.detected || whisperDetected
            ? "audio-banner-warning"
            : isSpeaking
            ? "audio-banner-speaking"
            : "audio-banner-ready"
        }`}
      >
        <div className="audio-banner-left">
          <div className="audio-status-pill">
            {isMuted ? (
              <MicOff size={16} className="text-warn" />
            ) : isMultipleSpeakersActive ? (
              <Layers size={16} className="text-danger animate-pulse" />
            ) : isAdditionalSpeakerActive ? (
              <Users size={16} className="text-danger animate-pulse" />
            ) : multipleSpeakersDetected ? (
              <Users size={16} className="text-warn animate-pulse" />
            ) : whisperDetected || backgroundSpeech.detected ? (
              <AlertTriangle size={16} className="text-warn animate-pulse" />
            ) : isSpeaking ? (
              <Mic size={16} className="text-accent animate-pulse" />
            ) : (
              <Volume2 size={16} />
            )}
            <span className="audio-status-label">
              {isMuted
                ? "Microphone Muted"
                : isMultipleSpeakersActive
                ? "⚠️ Multiple Voices Active Simultaneously"
                : isAdditionalSpeakerActive
                ? `⚠️ Possible Additional Speaker (${currentPitch} Hz)`
                : activeSpeaker === "candidate"
                ? `Candidate Speaking · ${currentPitch} Hz (${currentSegmentDurationFormatted})`
                : multipleSpeakersDetected
                ? "⚠️ Multiple Voices Detected in Session"
                : backgroundSpeech.detected
                ? "⚠️ Secondary Background Voice Active"
                : whisperDetected
                ? "⚠️ Whispering Pattern Detected"
                : isSpeaking
                ? `Voice Activity (${currentSegmentDurationFormatted})`
                : `Silence (${currentSegmentDurationFormatted})`}
            </span>
          </div>

          <span
            className={`badge ${
              isMuted
                ? "badge-warn"
                : isMultipleSpeakersActive || isAdditionalSpeakerActive
                ? "badge-critical animate-pulse"
                : multipleSpeakersDetected || backgroundSpeech.detected || whisperDetected
                ? "badge-warn animate-pulse"
                : isSpeaking
                ? "badge-active"
                : "badge-ready"
            }`}
          >
            {isMuted
              ? "MUTED"
              : isMultipleSpeakersActive
              ? "DUAL SPEECH"
              : isAdditionalSpeakerActive
              ? "SPEAKER 2"
              : activeSpeaker === "candidate"
              ? "SPEAKER 1"
              : `VAD: ${voiceActivityConfidence}% (${volume}%)`}
          </span>
        </div>

        {/* View Switcher */}
        <div className="audio-mode-switch">
          <button
            className={`mode-btn ${viewMode === "speakers" ? "mode-btn-active" : ""}`}
            onClick={() => setViewMode("speakers")}
          >
            <Users size={12} />
            Multiple Speakers
            {(isMultipleSpeakersActive || isAdditionalSpeakerActive || multipleSpeakersDetected) && (
              <span className="tab-pill-dot animate-pulse" />
            )}
          </button>
          <button
            className={`mode-btn ${viewMode === "transcript" ? "mode-btn-active" : ""}`}
            onClick={() => setViewMode("transcript")}
          >
            <FileText size={12} />
            Transcript ({transcriptState?.segments?.length || 0})
          </button>
          <button
            className={`mode-btn ${viewMode === "vad" ? "mode-btn-active" : ""}`}
            onClick={() => setViewMode("vad")}
          >
            <Zap size={12} />
            VAD Intelligence
          </button>
          <button
            className={`mode-btn ${viewMode === "spectrum" ? "mode-btn-active" : ""}`}
            onClick={() => setViewMode("spectrum")}
          >
            <Radio size={12} />
            Spectrum
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

      {/* Warning Alert Banner for Multiple Voices or Additional Speaker */}
      {(isMultipleSpeakersActive || isAdditionalSpeakerActive || multipleSpeakersDetected) && (
        <div className="vad-security-alert-box diarization-alert-box">
          <AlertCircle size={20} className="text-danger flex-shrink-0" />
          <div className="vad-alert-body">
            <span className="vad-alert-title">
              {isMultipleSpeakersActive
                ? "Multiple Voices Clashing: Simultaneous Overlapping Speech"
                : isAdditionalSpeakerActive
                ? "Unauthorized Voice Detected: Possible Off-Camera Speaker"
                : "Multiple Speaker Incidents Recorded"}
            </span>
            <span className="vad-alert-desc">
              {isMultipleSpeakersActive
                ? "Candidate and a second speaker are speaking at the same time. Dual harmonic resonance detected in human vocal bands."
                : isAdditionalSpeakerActive
                ? `Acoustic fundamental frequency (${currentPitch} Hz) deviates by +${pitchDiff} Hz from candidate calibrated baseline (${candidateBaselinePitch} Hz).`
                : "Acoustic diarization identified secondary vocal tract activity during this session."}
            </span>
          </div>
        </div>
      )}

      {/* ====================================================================
          VIEW 1: MULTIPLE SPEAKER DETECTION & DIARIZATION
          ==================================================================== */}
      {viewMode === "speakers" && (
        <div className="speaker-diarization-container">
          {/* Top Speaker Spotlight Bar */}
          <div className="speaker-spotlight-bar">
            <div className="spotlight-left">
              <span className="spotlight-tag">Live Active Voice:</span>
              <div
                className={`spotlight-badge ${
                  isMultipleSpeakersActive
                    ? "spotlight-multiple animate-pulse"
                    : isAdditionalSpeakerActive
                    ? "spotlight-additional animate-pulse"
                    : activeSpeaker === "candidate"
                    ? "spotlight-candidate"
                    : "spotlight-none"
                }`}
              >
                {isMultipleSpeakersActive ? (
                  <>
                    <Layers size={14} />
                    <span>Both Overlapping (Simultaneous)</span>
                  </>
                ) : isAdditionalSpeakerActive ? (
                  <>
                    <UserX size={14} />
                    <span>Speaker 2 (Possible Additional Speaker)</span>
                  </>
                ) : activeSpeaker === "candidate" ? (
                  <>
                    <UserCheck size={14} />
                    <span>Speaker 1 (Primary Candidate)</span>
                  </>
                ) : (
                  <>
                    <MicOff size={14} />
                    <span>No Active Voice (Silence / Ambient)</span>
                  </>
                )}
              </div>
            </div>

            <div className="spotlight-right">
              <div className="spotlight-stat">
                <span className="spotlight-stat-label">Speaker Turns:</span>
                <span className="spotlight-stat-value">{speakerTurnCount} turns</span>
              </div>
              <div className="spotlight-stat">
                <span className="spotlight-stat-label">Overlapping Duration:</span>
                <span className={`spotlight-stat-value ${overlapSec > 0 ? "text-danger" : ""}`}>
                  {overlapSec}s
                </span>
              </div>
            </div>
          </div>

          {/* Section 1: Speaker Activity Dual Cards */}
          <div className="speaker-cards-grid">
            {/* Speaker 1: Primary Candidate */}
            <div
              className={`speaker-card ${
                activeSpeaker === "candidate" || isMultipleSpeakersActive
                  ? "speaker-card-active candidate-glow"
                  : ""
              }`}
            >
              <div className="speaker-card-header">
                <div className="speaker-card-title-group">
                  <div className="speaker-avatar avatar-candidate">
                    <UserCheck size={16} />
                  </div>
                  <div>
                    <h3 className="speaker-name">Speaker 1 · Candidate</h3>
                    <span className="speaker-role">Primary Interviewee</span>
                  </div>
                </div>

                <span
                  className={`badge ${
                    activeSpeaker === "candidate"
                      ? "badge-active animate-pulse"
                      : isMultipleSpeakersActive
                      ? "badge-active"
                      : "badge-ready"
                  }`}
                >
                  {activeSpeaker === "candidate"
                    ? "Speaking Now"
                    : isMultipleSpeakersActive
                    ? "Overlapping"
                    : "Listening"}
                </span>
              </div>

              {/* Candidate Metrics */}
              <div className="speaker-metrics-list">
                <div className="speaker-metric-row">
                  <span className="speaker-metric-label">Speaking Time</span>
                  <span className="speaker-metric-val">{candidateSec}s ({candidateRatioPct}%)</span>
                </div>
                <div className="speaker-metric-row">
                  <span className="speaker-metric-label">Calibrated Pitch (F₀)</span>
                  <span className="speaker-metric-val text-accent">
                    {candidateBaselinePitch > 0 ? `${candidateBaselinePitch} Hz` : "Calibrating…"}
                  </span>
                </div>
                <div className="speaker-metric-row">
                  <span className="speaker-metric-label">Acoustic Status</span>
                  <span className="speaker-metric-val">
                    {isCalibrated ? "Profile Verified" : "Learning Voice Profile"}
                  </span>
                </div>
              </div>

              {/* Candidate Share Bar */}
              <div className="speaker-share-track">
                <div
                  className="speaker-share-fill share-candidate"
                  style={{ width: `${Math.max(5, candidateRatioPct)}%` }}
                  title={`Candidate voice share: ${candidateRatioPct}%`}
                />
              </div>
            </div>

            {/* Speaker 2: Possible Additional Speaker */}
            <div
              className={`speaker-card ${
                isAdditionalSpeakerActive || isMultipleSpeakersActive
                  ? "speaker-card-active additional-glow"
                  : additionalSec > 0
                  ? "speaker-card-warn"
                  : ""
              }`}
            >
              <div className="speaker-card-header">
                <div className="speaker-card-title-group">
                  <div
                    className={`speaker-avatar ${
                      additionalSec > 0 ? "avatar-additional-alert" : "avatar-additional"
                    }`}
                  >
                    <Users size={16} />
                  </div>
                  <div>
                    <h3 className="speaker-name">Speaker 2 · Additional</h3>
                    <span className="speaker-role">Off-Camera / Secondary Voice</span>
                  </div>
                </div>

                <span
                  className={`badge ${
                    isAdditionalSpeakerActive
                      ? "badge-critical animate-pulse"
                      : isMultipleSpeakersActive
                      ? "badge-critical"
                      : additionalSec > 0
                      ? "badge-warn"
                      : "badge-ready"
                  }`}
                >
                  {isAdditionalSpeakerActive
                    ? "⚠️ Speaking Now"
                    : isMultipleSpeakersActive
                    ? "⚠️ Dual Speech"
                    : additionalSec > 0
                    ? `${additionalSec}s Recorded`
                    : "No Voice Detected"}
                </span>
              </div>

              {/* Additional Speaker Metrics */}
              <div className="speaker-metrics-list">
                <div className="speaker-metric-row">
                  <span className="speaker-metric-label">Speaking Time</span>
                  <span
                    className={`speaker-metric-val ${
                      additionalSec > 0 ? "text-danger" : ""
                    }`}
                  >
                    {additionalSec}s ({additionalRatioPct}%)
                  </span>
                </div>
                <div className="speaker-metric-row">
                  <span className="speaker-metric-label">Detected Pitch (F₀)</span>
                  <span
                    className={`speaker-metric-val ${
                      isAdditionalSpeakerActive ? "text-danger" : ""
                    }`}
                  >
                    {currentPitch > 0 && isAdditionalSpeakerActive
                      ? `${currentPitch} Hz (+${pitchDiff} Hz)`
                      : additionalSec > 0
                      ? "Off-baseline detected"
                      : "—"}
                  </span>
                </div>
                <div className="speaker-metric-row">
                  <span className="speaker-metric-label">Proctor Threat</span>
                  <span
                    className={`speaker-metric-val ${
                      additionalSec > 0 ? "text-danger" : "text-accent"
                    }`}
                  >
                    {additionalSec > 0 ? "⚠️ Unauthorized Assistance" : "Clear (Single Speaker)"}
                  </span>
                </div>
              </div>

              {/* Additional Speaker Share Bar */}
              <div className="speaker-share-track">
                <div
                  className="speaker-share-fill share-additional"
                  style={{ width: `${Math.min(100, additionalRatioPct)}%` }}
                  title={`Additional speaker voice share: ${additionalRatioPct}%`}
                />
              </div>
            </div>
          </div>

          {/* Conversational Share-of-Voice Stacked Bar */}
          <div className="speaker-timeline-card">
            <div className="speaker-timeline-header">
              <span className="timeline-title">Conversational Share-of-Voice Breakdown</span>
              <span className="timeline-subtitle">
                {speakerTurnCount > 0
                  ? `${speakerTurnCount} speaker turn handoffs recorded`
                  : "Continuous candidate stream"}
              </span>
            </div>

            <div className="diarization-ratio-bar">
              <div
                className="diarization-seg seg-candidate"
                style={{ width: `${candidateRatioPct}%` }}
                title={`Candidate: ${candidateRatioPct}%`}
              >
                {candidateRatioPct > 15 && `Candidate ${candidateRatioPct}%`}
              </div>
              <div
                className="diarization-seg seg-additional"
                style={{ width: `${additionalRatioPct}%` }}
                title={`Additional Speaker: ${additionalRatioPct}%`}
              >
                {additionalRatioPct > 12 && `Speaker 2 ${additionalRatioPct}%`}
              </div>
            </div>

            <div className="diarization-legend">
              <div className="legend-item">
                <span className="legend-dot dot-candidate" />
                <span>Candidate (Speaker 1): {candidateSec}s</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot dot-additional" />
                <span>Additional Voice: {additionalSec}s</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot dot-overlap" />
                <span>Simultaneous Overlap: {overlapSec}s</span>
              </div>
            </div>
          </div>

          {/* Section 2 & 3: Multiple Voices & Possible Additional Speaker Diarization Gauge */}
          <div className="speaker-analysis-grid">
            {/* Pillar 2: Multiple Voices (Simultaneous Overlapping Speech) */}
            <div className="analysis-card">
              <div className="analysis-header">
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-secondary" />
                  <span className="analysis-title">Multiple Voices (Simultaneous)</span>
                </div>
                <span
                  className={`badge ${
                    isMultipleSpeakersActive
                      ? "badge-critical animate-pulse"
                      : overlapSec > 0
                      ? "badge-warn"
                      : "badge-ready"
                  }`}
                >
                  {isMultipleSpeakersActive
                    ? "⚠️ Dual Speech Active"
                    : overlapSec > 0
                    ? `${overlapSec}s Incident`
                    : "Single Voice Stream"}
                </span>
              </div>

              <div className="analysis-body">
                <p className="analysis-text">
                  Detects clashing harmonic comb frequencies when two people speak simultaneously over
                  the same microphone.
                </p>

                <div className="harmonic-status-row">
                  <div className="harmonic-item">
                    <span className="harmonic-label">Harmonic Coexistence:</span>
                    <span
                      className={`harmonic-val ${
                        isMultipleSpeakersActive ? "text-danger" : "text-accent"
                      }`}
                    >
                      {isMultipleSpeakersActive ? "Dual Harmonics Clashing" : "Single Harmonic Set"}
                    </span>
                  </div>
                  <div className="harmonic-item">
                    <span className="harmonic-label">Overlap Incidents:</span>
                    <span className="harmonic-val">{overlapSec > 0 ? `${overlapSec}s total` : "None"}</span>
                  </div>
                </div>

                <div className="proctor-penalty-chip">
                  <ShieldAlert size={12} />
                  <span>Proctoring Penalty: {isMultipleSpeakersActive ? "+40 points" : "0 points"}</span>
                </div>
              </div>
            </div>

            {/* Pillar 3: Possible Additional Speaker (Acoustic Pitch Diarization) */}
            <div className="analysis-card">
              <div className="analysis-header">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft size={14} className="text-secondary" />
                  <span className="analysis-title">Possible Additional Speaker</span>
                </div>
                <span
                  className={`badge ${
                    isAdditionalSpeakerActive
                      ? "badge-critical animate-pulse"
                      : isCalibrated
                      ? "badge-ready"
                      : "badge-warn"
                  }`}
                >
                  {isAdditionalSpeakerActive
                    ? "⚠️ Speaker Divergence"
                    : isCalibrated
                    ? "Baseline Calibrated"
                    : "Calibrating…"}
                </span>
              </div>

              <div className="analysis-body">
                <div className="pitch-readout-row">
                  <div className="pitch-readout-col">
                    <span className="pitch-readout-label">Candidate Baseline (F₀)</span>
                    <span className="pitch-readout-num text-accent">
                      {candidateBaselinePitch > 0 ? `${candidateBaselinePitch} Hz` : "—"}
                    </span>
                  </div>
                  <div className="pitch-readout-col">
                    <span className="pitch-readout-label">Current Pitch (F₀)</span>
                    <span
                      className={`pitch-readout-num ${
                        pitchDiff > 35 ? "text-danger" : "text-primary"
                      }`}
                    >
                      {currentPitch > 0 ? `${currentPitch} Hz` : "0 Hz"}
                    </span>
                  </div>
                  <div className="pitch-readout-col">
                    <span className="pitch-readout-label">Divergence (ΔF₀)</span>
                    <span
                      className={`pitch-readout-num ${
                        pitchDiff > 35 ? "text-danger" : "text-accent"
                      }`}
                    >
                      Δ {pitchDiff} Hz
                    </span>
                  </div>
                </div>

                {/* Pitch Divergence Visual Gauge */}
                <div className="pitch-gauge-container">
                  <div className="pitch-gauge-labels">
                    <span>0 Hz (Match)</span>
                    <span className="text-warn">35 Hz (Threshold)</span>
                    <span>100+ Hz</span>
                  </div>
                  <div className="pitch-gauge-track">
                    <div className="gauge-safe-zone" style={{ width: "35%" }} />
                    <div className="gauge-alarm-zone" style={{ width: "65%" }} />
                    <div
                      className="gauge-needle"
                      style={{ left: `${pitchGaugePct}%` }}
                      title={`Current pitch divergence: ${pitchDiff} Hz`}
                    />
                  </div>
                </div>

                <p className="pitch-explanation">
                  {pitchDiff > 35
                    ? `⚠️ Current voice pitch diverges by ${pitchDiff} Hz from candidate baseline. High likelihood of off-camera coach.`
                    : isCalibrated
                    ? `Pitch variation (Δ ${pitchDiff} Hz) falls within candidate natural intonation tolerance (±32 Hz).`
                    : "Speaking to establish candidate baseline vocal frequency…"}
                </p>
              </div>
            </div>
          </div>

          {/* Section 4: Speaker Events Stream */}
          <div className="speaker-events-section">
            <div className="speaker-events-header">
              <div className="flex items-center gap-2">
                <History size={14} className="text-secondary" />
                <span className="section-title">Speaker Events & Audit Trail</span>
                <span className="badge badge-ready">{speakerEvents.length} events</span>
              </div>

              <div className="speaker-filter-chips">
                <button
                  className={`chip-btn ${speakerLogFilter === "all" ? "chip-active" : ""}`}
                  onClick={() => setSpeakerLogFilter("all")}
                >
                  All ({speakerEvents.length})
                </button>
                <button
                  className={`chip-btn ${speakerLogFilter === "transitions" ? "chip-active" : ""}`}
                  onClick={() => setSpeakerLogFilter("transitions")}
                >
                  Speaker Turns
                </button>
                <button
                  className={`chip-btn ${speakerLogFilter === "alerts" ? "chip-active" : ""}`}
                  onClick={() => setSpeakerLogFilter("alerts")}
                >
                  Security Alerts
                </button>
              </div>
            </div>

            <div className="speaker-events-feed">
              {speakerEvents.length === 0 ? (
                <div className="empty-sub py-4 text-center">
                  No speaker transition or multi-speaker events recorded yet.
                </div>
              ) : (
                speakerEvents.slice(0, 15).map((evt) => (
                  <div
                    key={evt.id}
                    className={`speaker-event-row ${
                      evt.severity === "critical"
                        ? "evt-critical"
                        : evt.severity === "warning"
                        ? "evt-warning"
                        : "evt-ready"
                    }`}
                  >
                    <div className="evt-left">
                      <Clock size={11} className="text-secondary" />
                      <span className="evt-time">{evt.formattedTime}</span>
                      <span
                        className={`badge ${
                          evt.severity === "critical"
                            ? "badge-critical"
                            : evt.severity === "warning"
                            ? "badge-warn"
                            : "badge-active"
                        }`}
                      >
                        {evt.type.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="evt-msg">{evt.message}</div>

                    {evt.duration && (
                      <span className="event-duration-tag">{evt.duration}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          VIEW: SPEECH-TO-TEXT TRANSCRIPT (TRANSCRIPTION, TIMESTAMPS, SEGMENTS)
          ==================================================================== */}
      {viewMode === "transcript" && (
        <TranscriptView
          transcriptState={transcriptState}
          microphone={microphone}
        />
      )}

      {/* ====================================================================
          VIEW 2: VAD INTELLIGENCE (SPEECH/SILENCE & VOICE ACTIVITY)
          ==================================================================== */}
      {viewMode === "vad" && (
        <div className="vad-pillars-grid">
          {/* Pillar 1: Speech / Silence Analysis */}
          <div className="vad-card">
            <div className="vad-card-header">
              <span className="vad-card-title">1. Speech / Silence Analysis</span>
              <span className={`badge ${isSpeaking ? "badge-active" : "badge-ready"}`}>
                {isSpeaking ? "Active Speech" : "Silence"}
              </span>
            </div>

            <div className="vad-metric-row">
              <span className="vad-label">Speaking Ratio</span>
              <span className="vad-val-bold">{speakingPct}%</span>
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

            <div className="vad-substats-row">
              <span>Speech: {speakingSeconds}s ({stats.speechBurstsCount || 0} bursts)</span>
              <span>Silence: {silenceSeconds}s</span>
            </div>

            <div className="vad-cadence-box">
              <span className="vad-cadence-label">Speech Cadence:</span>
              <span className="vad-cadence-badge">{cadence.rhythm}</span>
              <span className="vad-cadence-rate">({cadence.burstsPerMinute} bursts/min)</span>
            </div>
          </div>

          {/* Pillar 2: Voice Activity Metrics */}
          <div className="vad-card">
            <div className="vad-card-header">
              <span className="vad-card-title">2. Voice Activity Confidence</span>
              <span className="badge badge-ready">{voiceActivityConfidence}% VAD</span>
            </div>

            <div className="vad-metric-row">
              <span className="vad-label">Formant Band Ratio (250Hz - 3.2kHz)</span>
              <span className="vad-val-bold">{vocalEnergyRatio}%</span>
            </div>
            <div className="audio-meter-bar-track">
              <div
                className="audio-meter-bar-fill meter-speech"
                style={{ width: `${Math.min(100, vocalEnergyRatio)}%` }}
              />
            </div>

            <div className="vad-substats-row">
              <span>ZCR: {zeroCrossingRate}</span>
              <span>Noise Floor: {noiseFloor}%</span>
            </div>

            <div className="vad-level-row">
              <div className="vad-level-col">
                <span className="vad-sublabel">RMS Volume</span>
                <span className="vad-subnum">{volume}%</span>
              </div>
              <div className="vad-level-col">
                <span className="vad-sublabel">Decibels</span>
                <span className="vad-subnum">{db} dB</span>
              </div>
              <div className="vad-level-col">
                <span className="vad-sublabel">Peak</span>
                <span className="vad-subnum">{peakVolume}%</span>
              </div>
            </div>
          </div>

          {/* Pillar 3: Background Speech & Whispering Security Guard */}
          <div className="vad-card vad-card-security">
            <div className="vad-card-header">
              <span className="vad-card-title">3. Background Speech Guard</span>
              <span
                className={`badge ${
                  backgroundSpeech.detected ? "badge-critical animate-pulse" : "badge-ready"
                }`}
              >
                {backgroundSpeech.detected ? "⚠️ Disturbance" : "Clear"}
              </span>
            </div>

            <div className="vad-security-indicators">
              <div className="vad-sec-item">
                <span className="vad-sec-name">Off-Camera Voice:</span>
                <span
                  className={`vad-sec-status ${
                    backgroundSpeech.type === "background_voice" || isAdditionalSpeakerActive
                      ? "sec-status-warn"
                      : "sec-status-ok"
                  }`}
                >
                  {isAdditionalSpeakerActive || backgroundSpeech.type === "background_voice"
                    ? "⚠️ Detected"
                    : "Clear"}
                </span>
              </div>

              <div className="vad-sec-item">
                <span className="vad-sec-name">Whispering / Coaching:</span>
                <span
                  className={`vad-sec-status ${
                    whisperDetected ? "sec-status-warn" : "sec-status-ok"
                  }`}
                >
                  {whisperDetected ? "⚠️ Detected" : "Clear"}
                </span>
              </div>

              <div className="vad-sec-item">
                <span className="vad-sec-name">Multiple Speakers:</span>
                <span
                  className={`vad-sec-status ${
                    isMultipleSpeakersActive || multipleSpeakersDetected
                      ? "sec-status-danger"
                      : "sec-status-ok"
                  }`}
                >
                  {isMultipleSpeakersActive || multipleSpeakersDetected ? "⚠️ Active" : "1 Speaker"}
                </span>
              </div>
            </div>

            <div className="vad-risk-box">
              <span className="vad-risk-label">Acoustic Risk Impact:</span>
              <span
                className={`vad-risk-level ${
                  risk.score >= 50
                    ? "text-danger"
                    : risk.score >= 20
                    ? "text-warn"
                    : "text-accent"
                }`}
              >
                +{risk.score} pts ({risk.level})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          VIEW 3: VOCAL FORMANT SPECTRUM EQUALIZER
          ==================================================================== */}
      {viewMode === "spectrum" && (
        <div className="spectrum-card">
          <div className="spectrum-header">
            <span className="spectrum-title">Real-Time Vocal Formant Spectrum</span>
            <span className="spectrum-meta">
              {isMuted
                ? "Muted"
                : isMultipleSpeakersActive
                ? "Multiple Voice Formants Active"
                : isSpeaking
                ? "Human Vocal Band Dominant"
                : "Ambient Baseline"}
            </span>
          </div>

          <div className="spectrum-bars-row">
            {spectrum.map((val, idx) => (
              <div key={idx} className="spectrum-bar-col">
                <div
                  className={`spectrum-bar-fill ${
                    isMuted
                      ? "spectrum-fill-muted"
                      : isMultipleSpeakersActive && val > 30
                      ? "spectrum-fill-high"
                      : val > 65
                      ? "spectrum-fill-high"
                      : idx >= 2 && idx <= 10 && val > 20
                      ? "spectrum-fill-speech"
                      : "spectrum-fill-idle"
                  }`}
                  style={{ height: `${Math.max(6, val)}%` }}
                />
              </div>
            ))}
          </div>

          <div className="spectrum-labels-row">
            <span>Bass / Hum (0-250Hz)</span>
            <span className="text-accent">Primary Vocal Formants (250Hz - 3.2kHz)</span>
            <span>Whisper / Fricatives (3.2kHz - 6kHz)</span>
          </div>
        </div>
      )}

      {/* ====================================================================
          VIEW 4: COMPREHENSIVE AUDIO EVENTS & EVIDENCE TIMELINE
          ==================================================================== */}
      {viewMode === "events" && (
        <div className="audio-events-container">
          {/* Quick Filters */}
          <div className="audio-event-filter-bar">
            <Filter size={12} className="text-secondary" />
            <span className="filter-label">Filter:</span>
            <button
              className={`filter-btn ${eventFilter === "all" ? "filter-btn-active" : ""}`}
              onClick={() => setEventFilter("all")}
            >
              All ({audioEvents.length})
            </button>
            <button
              className={`filter-btn ${eventFilter === "speakers" ? "filter-btn-active" : ""}`}
              onClick={() => setEventFilter("speakers")}
            >
              Speaker Diarization
            </button>
            <button
              className={`filter-btn ${eventFilter === "speech" ? "filter-btn-active" : ""}`}
              onClick={() => setEventFilter("speech")}
            >
              Speech & Silence
            </button>
            <button
              className={`filter-btn ${eventFilter === "security" ? "filter-btn-active" : ""}`}
              onClick={() => setEventFilter("security")}
            >
              Security Disturbance
            </button>
            <button
              className={`filter-btn ${eventFilter === "alerts" ? "filter-btn-active" : ""}`}
              onClick={() => setEventFilter("alerts")}
            >
              Alerts
            </button>
          </div>

          <div className="audio-events-list">
            {filteredEvents.length === 0 ? (
              <div className="empty-sub py-6 text-center">
                No events matching the selected filter.
              </div>
            ) : (
              filteredEvents.map((evt) => (
                <div
                  key={evt.id}
                  className={`audio-event-item ${
                    evt.severity === "critical"
                      ? "audio-event-critical"
                      : evt.severity === "warning"
                      ? "audio-event-warning"
                      : "audio-event-ready"
                  }`}
                >
                  <div className="audio-event-time">
                    <Clock size={11} />
                    <span>{evt.formattedTime}</span>
                  </div>
                  <div className="audio-event-msg">{evt.message}</div>
                  <div className="audio-event-tags">
                    {evt.duration && evt.duration !== "0s" && (
                      <span className="event-duration-tag">{evt.duration}</span>
                    )}
                    <span
                      className={`badge ${
                        evt.severity === "critical"
                          ? "badge-critical"
                          : evt.severity === "warning"
                          ? "badge-warn"
                          : "badge-active"
                      }`}
                    >
                      {evt.type.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
