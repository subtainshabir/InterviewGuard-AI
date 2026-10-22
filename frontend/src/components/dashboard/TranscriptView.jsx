import { useState } from "react";
import {
  FileText,
  Search,
  Download,
  Copy,
  Trash2,
  Mic,
  MicOff,
  Clock,
  UserCheck,
  Users,
  AlertTriangle,
  Check,
  Sparkles,
  Filter,
  BarChart2,
  ShieldAlert,
} from "lucide-react";

export default function TranscriptView({ transcriptState, microphone }) {
  const [copied, setCopied] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const {
    isSupported = true,
    isListening = false,
    interimText = "",
    segments = [],
    filteredSegments = [],
    searchQuery = "",
    setSearchQuery = () => {},
    speakerFilter = "all",
    setSpeakerFilter = () => {},
    clearTranscript = () => {},
    copyToClipboard = async () => {},
    exportJSON = () => {},
    exportTXT = () => {},
    addDemoSegment = () => {},
    stats = {},
  } = transcriptState || {};

  const {
    isMuted = false,
    status: micStatus = "idle",
  } = microphone || {};

  const handleCopy = async () => {
    const success = await copyToClipboard();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClear = () => {
    clearTranscript();
    setShowClearConfirm(false);
  };

  return (
    <div className="transcript-container">
      {/* 1. Header Banner & Live Status */}
      <div className="transcript-header-bar">
        <div className="transcript-status-group">
          <div
            className={`transcript-status-pill ${
              isMuted
                ? "status-muted"
                : isListening
                ? interimText
                  ? "status-transcribing animate-pulse"
                  : "status-listening"
                : "status-offline"
            }`}
          >
            {isMuted ? (
              <MicOff size={14} className="text-warn" />
            ) : isListening ? (
              <Mic size={14} className="text-accent animate-pulse" />
            ) : (
              <MicOff size={14} />
            )}
            <span>
              {isMuted
                ? "Speech Recognition Muted"
                : isListening
                ? interimText
                  ? "Transcribing live speech…"
                  : "Speech-to-Text Active · Listening"
                : micStatus === "active"
                ? "Speech Recognition Standby"
                : "Microphone Offline"}
            </span>
          </div>

          <span className="badge badge-ready">
            {stats.totalWords || 0} words · {stats.totalSegments || 0} segments
          </span>
          {stats.suspectSegmentsCount > 0 && (
            <span className="badge badge-critical animate-pulse">
              ⚠️ {stats.suspectSegmentsCount} Flagged
            </span>
          )}
        </div>

        {/* Action Controls: Export, Copy, Clear */}
        <div className="transcript-actions-group">
          <button
            type="button"
            className="action-btn"
            onClick={exportTXT}
            disabled={segments.length === 0}
            title="Download transcript as formatted text file"
          >
            <Download size={13} />
            Export TXT
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={exportJSON}
            disabled={segments.length === 0}
            title="Export full transcript metadata as JSON"
          >
            <Download size={13} />
            Export JSON
          </button>
          <button
            type="button"
            className={`action-btn ${copied ? "action-btn-success" : ""}`}
            onClick={handleCopy}
            disabled={segments.length === 0}
            title="Copy entire transcript to clipboard"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied!" : "Copy"}
          </button>

          {showClearConfirm ? (
            <div className="clear-confirm-group">
              <span className="confirm-text">Clear all?</span>
              <button
                type="button"
                className="confirm-btn confirm-yes"
                onClick={handleClear}
              >
                Yes
              </button>
              <button
                type="button"
                className="confirm-btn confirm-no"
                onClick={() => setShowClearConfirm(false)}
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="action-btn action-btn-danger"
              onClick={() => setShowClearConfirm(true)}
              disabled={segments.length === 0}
              title="Clear transcript history from storage"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* 2. Stats Strip */}
      <div className="transcript-stats-strip">
        <div className="stat-pill">
          <span className="stat-label">Candidate Words:</span>
          <span className="stat-val text-accent">{stats.candidateWords || 0}</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">Speaker 2 Words:</span>
          <span
            className={`stat-val ${
              stats.additionalWords > 0 ? "text-danger" : "text-primary"
            }`}
          >
            {stats.additionalWords || 0}
          </span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">Speech Rate:</span>
          <span className="stat-val">{stats.averageWpm || 0} WPM</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">Storage:</span>
          <span className="stat-val text-secondary">Local Sync</span>
        </div>

        {/* Demo simulator helpers for live testing */}
        <div className="transcript-demo-actions">
          <button
            type="button"
            className="demo-chip-btn"
            onClick={() => addDemoSegment(null, false)}
            title="Simulate speech from Candidate"
          >
            <Sparkles size={11} /> + Candidate Voice
          </button>
          <button
            type="button"
            className="demo-chip-btn demo-chip-warn"
            onClick={() => addDemoSegment(null, true)}
            title="Simulate speech from Off-Camera Coach"
          >
            <AlertTriangle size={11} /> + Speaker 2 Voice
          </button>
        </div>
      </div>

      {/* 3. Live Interim Streaming Bubble (Word-by-word streaming typing preview) */}
      {interimText && (
        <div className="interim-speech-bubble">
          <div className="interim-bubble-header">
            <span className="interim-label">
              <span className="live-dot animate-pulse" />
              Live Speech Stream:
            </span>
            <span className="interim-hint">Processing acoustic phonemes…</span>
          </div>
          <div className="interim-text-content">
            &ldquo;{interimText}&rdquo;
            <span className="typing-cursor" />
          </div>
        </div>
      )}

      {/* 4. Search and Filter Bar */}
      <div className="transcript-filter-bar">
        <div className="transcript-search-box">
          <Search size={13} className="search-icon" />
          <input
            type="text"
            className="transcript-search-input"
            placeholder="Search words, phrases, or timestamps…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery("")}
            >
              ×
            </button>
          )}
        </div>

        <div className="transcript-chips-row">
          <Filter size={12} className="text-secondary" />
          <button
            type="button"
            className={`filter-chip ${speakerFilter === "all" ? "chip-active" : ""}`}
            onClick={() => setSpeakerFilter("all")}
          >
            All ({segments.length})
          </button>
          <button
            type="button"
            className={`filter-chip ${speakerFilter === "candidate" ? "chip-active" : ""}`}
            onClick={() => setSpeakerFilter("candidate")}
          >
            Candidate ({stats.candidateSegmentsCount || 0})
          </button>
          <button
            type="button"
            className={`filter-chip ${
              speakerFilter === "additional_speaker" ? "chip-active" : ""
            }`}
            onClick={() => setSpeakerFilter("additional_speaker")}
          >
            Speaker 2 ({stats.additionalSegmentsCount || 0})
          </button>
          <button
            type="button"
            className={`filter-chip ${speakerFilter === "suspect" ? "chip-active" : ""}`}
            onClick={() => setSpeakerFilter("suspect")}
          >
            Flagged ({stats.suspectSegmentsCount || 0})
          </button>
        </div>
      </div>

      {/* 5. Speech Segments Feed */}
      <div className="transcript-feed">
        {filteredSegments.length === 0 ? (
          <div className="transcript-empty">
            <FileText size={28} strokeWidth={1.5} />
            <p className="empty-title">
              {searchQuery
                ? `No speech segments matching "${searchQuery}"`
                : segments.length === 0
                ? "No speech transcribed yet"
                : "No segments match the selected filter"}
            </p>
            <p className="empty-sub">
              {segments.length === 0
                ? "Start speaking into the microphone or click '+ Candidate Voice' to generate sample dialogue."
                : "Try clearing your search query or filter chips above."}
            </p>
          </div>
        ) : (
          filteredSegments.map((seg) => {
            const isAdditional = seg.speaker === "additional_speaker";

            return (
              <div
                key={seg.id}
                className={`speech-segment-card ${
                  isAdditional
                    ? "segment-additional"
                    : seg.isSuspect
                    ? "segment-suspect"
                    : "segment-candidate"
                }`}
              >
                {/* Segment Header */}
                <div className="segment-header">
                  <div className="segment-speaker-group">
                    <div
                      className={`segment-avatar ${
                        isAdditional ? "avatar-additional-alert" : "avatar-candidate"
                      }`}
                    >
                      {isAdditional ? <Users size={14} /> : <UserCheck size={14} />}
                    </div>

                    <div className="segment-speaker-meta">
                      <span className="segment-speaker-name">
                        {seg.speakerLabel}
                      </span>
                      {seg.pitchHz > 0 && (
                        <span className="segment-pitch-tag">
                          {seg.pitchHz} Hz
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Timestamps */}
                  <div className="segment-time-group">
                    <span className="segment-relative-time" title="Elapsed interview time">
                      <Clock size={11} />
                      {seg.relativeTime}
                    </span>
                    <span className="segment-clock-time" title="Wall-clock timestamp">
                      {seg.formattedTime}
                    </span>
                    <span className="segment-duration-tag" title="Utterance duration">
                      {seg.durationFormatted}
                    </span>
                  </div>
                </div>

                {/* Transcribed Text */}
                <div className="segment-body">
                  <p className="segment-text">&ldquo;{seg.text}&rdquo;</p>
                </div>

                {/* Segment Footer & Proctoring Flags */}
                <div className="segment-footer">
                  <div className="segment-metrics">
                    <span className="metric-chip">
                      {seg.wordsCount} words
                    </span>
                    {seg.wordsPerMinute > 0 && (
                      <span className="metric-chip">
                        {seg.wordsPerMinute} WPM
                      </span>
                    )}
                    <span className="metric-chip">
                      {seg.confidence}% confidence
                    </span>
                  </div>

                  {seg.isSuspect && (
                    <div className="segment-suspect-flag">
                      <ShieldAlert size={12} />
                      <span>{seg.suspectReason || "Flagged speech anomaly"}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
