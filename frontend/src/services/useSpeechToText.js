import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_PREFIX = "interviewguard.transcript.";
const SUSPECT_KEYWORDS = [
  "answer is",
  "the answer is",
  "option a",
  "option b",
  "option c",
  "option d",
  "solution",
  "hint",
  "leetcode",
  "chatgpt",
  "google it",
  "cheat",
  "whisper",
  "help me",
  "don't say that",
];

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toTimeString().split(" ")[0]; // "HH:mm:ss"
}

function formatRelativeTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `+${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function useSpeechToText({
  isActive = false,
  isMuted = false,
  speakerDiarization = null,
  sessionId = "default",
  sessionStartTime = null,
}) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [segments, setSegments] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState("all"); // "all" | "candidate" | "additional_speaker" | "suspect"
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const isManuallyStoppedRef = useRef(false);
  const segmentsRef = useRef([]);
  const currentSegmentStartTimeRef = useRef(0);
  const sessionStartMsRef = useRef(Date.now());
  const speakerDiarizationRef = useRef(speakerDiarization);
  const isMutedRef = useRef(isMuted);
  const isActiveRef = useRef(isActive);
  const restartTimeoutRef = useRef(null);

  // Keep refs synced to latest values to avoid stale closures in recognition callbacks
  speakerDiarizationRef.current = speakerDiarization;
  isMutedRef.current = isMuted;
  isActiveRef.current = isActive;
  segmentsRef.current = segments;

  // Track session start time
  useEffect(() => {
    if (sessionStartTime) {
      sessionStartMsRef.current = new Date(sessionStartTime).getTime();
    }
  }, [sessionStartTime]);

  // Load existing transcript from storage on mount or when sessionId changes
  useEffect(() => {
    try {
      const storageKey = STORAGE_PREFIX + (sessionId || "default");
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSegments(parsed);
          segmentsRef.current = parsed;
        }
      }
    } catch (err) {
      console.warn("Failed to load transcript from localStorage:", err);
    }
  }, [sessionId]);

  // Save segments to localStorage whenever they change
  const saveToStorage = useCallback(
    (newSegments) => {
      try {
        const storageKey = STORAGE_PREFIX + (sessionId || "default");
        window.localStorage.setItem(storageKey, JSON.stringify(newSegments.slice(-500)));
      } catch (err) {
        console.warn("Failed to save transcript to localStorage:", err);
      }
    },
    [sessionId]
  );

  // Initialize SpeechRecognition
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setError("Speech recognition is not supported natively in this browser.");
      return;
    }

    setIsSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      if (!currentSegmentStartTimeRef.current) {
        currentSegmentStartTimeRef.current = Date.now();
      }
    };

    recognition.onresult = (event) => {
      if (isMutedRef.current) return;

      let accumulatedInterim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcriptText = result[0].transcript.trim();
        const confidence = Math.round((result[0].confidence || 0.9) * 100);

        if (result.isFinal && transcriptText.length > 0) {
          const now = Date.now();
          const startTimeMs = currentSegmentStartTimeRef.current || now - 2000;
          const durationMs = Math.max(800, now - startTimeMs);
          const diarization = speakerDiarizationRef.current || {};
          const activeSpeaker = diarization.activeSpeaker || "candidate";
          const currentPitch = diarization.currentPitch || 0;
          const baselinePitch = diarization.candidateBaselinePitch || 0;
          const isAdditionalSpeaker =
            activeSpeaker === "additional_speaker" ||
            diarization.isAdditionalSpeakerActive ||
            (diarization.pitchDiff > 35 && diarization.isCalibrated);

          const speaker = isAdditionalSpeaker ? "additional_speaker" : "candidate";
          const speakerLabel = isAdditionalSpeaker
            ? "Speaker 2 (Possible Additional Speaker)"
            : "Speaker 1 (Primary Candidate)";

          // Check for suspect keywords or off-camera assistance
          const lowerText = transcriptText.toLowerCase();
          const hasSuspectKeyword = SUSPECT_KEYWORDS.some((kw) =>
            lowerText.includes(kw)
          );
          const isSuspect = isAdditionalSpeaker || hasSuspectKeyword;

          const wordCount = transcriptText.split(/\s+/).filter(Boolean).length;
          const durationSec = (durationMs / 1000).toFixed(1);
          const relativeMs = Math.max(0, startTimeMs - sessionStartMsRef.current);

          const newSegment = {
            id: `seg-${now}-${Math.random().toString(36).slice(2, 6)}`,
            speaker,
            speakerLabel,
            text: transcriptText,
            confidence,
            startTimeMs,
            endTimeMs: now,
            formattedTime: formatTime(startTimeMs),
            relativeTime: formatRelativeTime(relativeMs),
            durationFormatted: `${durationSec}s`,
            durationMs,
            wordsCount: wordCount,
            wordsPerMinute: Math.round((wordCount / (durationMs / 60000)) || 0),
            pitchHz: currentPitch,
            baselinePitchHz: baselinePitch,
            isSuspect,
            suspectReason: isAdditionalSpeaker
              ? `Spoken by unauthorized second speaker (Pitch: ${currentPitch} Hz)`
              : hasSuspectKeyword
              ? "Contains flagged assistance phrase"
              : null,
          };

          const updated = [...segmentsRef.current, newSegment];
          setSegments(updated);
          segmentsRef.current = updated;
          saveToStorage(updated);

          accumulatedInterim = "";
          currentSegmentStartTimeRef.current = Date.now();
        } else {
          accumulatedInterim += transcriptText + " ";
          if (!currentSegmentStartTimeRef.current) {
            currentSegmentStartTimeRef.current = Date.now();
          }
        }
      }

      setInterimText(accumulatedInterim.trim());
    };

    recognition.onerror = (event) => {
      // Ignore normal no-speech / abort events
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
      if (event.error === "not-allowed") {
        setError("Microphone permission denied for speech recognition.");
        setIsListening(false);
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText("");
      currentSegmentStartTimeRef.current = 0;

      // Auto-restart if still active and not manually stopped
      if (isActiveRef.current && !isMutedRef.current && !isManuallyStoppedRef.current) {
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = setTimeout(() => {
          if (isActiveRef.current && !isMutedRef.current && !isManuallyStoppedRef.current) {
            try {
              recognition.start();
            } catch (e) {
              // Ignore already started errors
            }
          }
        }, 300);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      isManuallyStoppedRef.current = true;
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      try {
        recognition.stop();
      } catch (e) {
        // cleanup safe
      }
    };
  }, [saveToStorage]);

  // Start or stop recognition based on isActive and isMuted props
  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (isActive && !isMuted) {
      isManuallyStoppedRef.current = false;
      try {
        recognition.start();
      } catch (e) {
        // If already started, do nothing
      }
    } else {
      isManuallyStoppedRef.current = true;
      try {
        recognition.stop();
      } catch (e) {
        // safe
      }
    }
  }, [isActive, isMuted]);

  // Actions & Storage Exports
  const clearTranscript = useCallback(() => {
    setSegments([]);
    segmentsRef.current = [];
    setInterimText("");
    try {
      const storageKey = STORAGE_PREFIX + (sessionId || "default");
      window.localStorage.removeItem(storageKey);
    } catch (err) {
      console.warn("Failed to clear transcript storage:", err);
    }
  }, [sessionId]);

  const copyToClipboard = useCallback(async () => {
    if (segments.length === 0) return false;
    const lines = segments.map(
      (s) => `[${s.formattedTime}] (${s.relativeTime}) ${s.speakerLabel}: ${s.text}`
    );
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      return true;
    } catch (err) {
      console.warn("Failed to copy transcript to clipboard:", err);
      return false;
    }
  }, [segments]);

  const exportJSON = useCallback(() => {
    const data = {
      sessionId,
      exportedAt: new Date().toISOString(),
      totalSegments: segments.length,
      totalWords: segments.reduce((sum, s) => sum + (s.wordsCount || 0), 0),
      segments,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `interview_transcript_${sessionId}_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [sessionId, segments]);

  const exportTXT = useCallback(() => {
    const lines = [
      `=======================================================`,
      `INTERVIEWGUARD - SPEECH TRANSCRIPT AUDIT LOG`,
      `Session ID: ${sessionId}`,
      `Exported At: ${new Date().toLocaleString()}`,
      `Total Segments: ${segments.length}`,
      `=======================================================`,
      ``,
    ];

    segments.forEach((s) => {
      const prefix = s.isSuspect ? `[⚠️ SUSPECT / ${s.speakerLabel}]` : `[${s.speakerLabel}]`;
      lines.push(`[${s.formattedTime}] (${s.relativeTime}) ${prefix}:`);
      lines.push(`"${s.text}"`);
      if (s.suspectReason) {
        lines.push(`  ↳ Flag: ${s.suspectReason}`);
      }
      lines.push(``);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `interview_transcript_${sessionId}_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }, [sessionId, segments]);

  // Add demo speech segment (useful for testing or automated walkthrough)
  const addDemoSegment = useCallback(
    (customText, isSecondSpeaker = false) => {
      const now = Date.now();
      const relativeMs = Math.max(0, now - sessionStartMsRef.current);
      const text =
        customText ||
        (isSecondSpeaker
          ? "Remember to mention time complexity of O(N log N) here."
          : "I am implementing the binary search tree traversal algorithm.");
      const wordCount = text.split(/\s+/).filter(Boolean).length;

      const newSegment = {
        id: `seg-demo-${now}-${Math.random().toString(36).slice(2, 6)}`,
        speaker: isSecondSpeaker ? "additional_speaker" : "candidate",
        speakerLabel: isSecondSpeaker
          ? "Speaker 2 (Possible Additional Speaker)"
          : "Speaker 1 (Primary Candidate)",
        text,
        confidence: 96,
        startTimeMs: now - 3200,
        endTimeMs: now,
        formattedTime: formatTime(now - 3200),
        relativeTime: formatRelativeTime(relativeMs),
        durationFormatted: "3.2s",
        durationMs: 3200,
        wordsCount: wordCount,
        wordsPerMinute: 135,
        pitchHz: isSecondSpeaker ? 220 : 138,
        baselinePitchHz: 138,
        isSuspect: isSecondSpeaker,
        suspectReason: isSecondSpeaker ? "Secondary voice detected off-camera" : null,
      };

      const updated = [...segmentsRef.current, newSegment];
      setSegments(updated);
      segmentsRef.current = updated;
      saveToStorage(updated);
    },
    [saveToStorage]
  );

  // Filtered segments for display
  const filteredSegments = segments.filter((s) => {
    // Speaker filter
    if (speakerFilter === "candidate" && s.speaker !== "candidate") return false;
    if (
      speakerFilter === "additional_speaker" &&
      s.speaker !== "additional_speaker"
    )
      return false;
    if (speakerFilter === "suspect" && !s.isSuspect) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        s.text.toLowerCase().includes(q) ||
        s.speakerLabel.toLowerCase().includes(q) ||
        s.formattedTime.includes(q)
      );
    }
    return true;
  });

  // Calculate statistics
  const totalWords = segments.reduce((sum, s) => sum + (s.wordsCount || 0), 0);
  const candidateSegments = segments.filter((s) => s.speaker === "candidate");
  const additionalSegments = segments.filter((s) => s.speaker === "additional_speaker");
  const suspectSegments = segments.filter((s) => s.isSuspect);

  const candidateWords = candidateSegments.reduce(
    (sum, s) => sum + (s.wordsCount || 0),
    0
  );
  const additionalWords = additionalSegments.reduce(
    (sum, s) => sum + (s.wordsCount || 0),
    0
  );

  const totalSpeakingDurationSec = segments.reduce(
    (sum, s) => sum + ((s.durationMs || 0) / 1000),
    0
  );
  const averageWpm =
    totalSpeakingDurationSec > 0
      ? Math.round((totalWords / (totalSpeakingDurationSec / 60)))
      : 0;

  return {
    isSupported,
    isListening,
    interimText,
    segments,
    filteredSegments,
    searchQuery,
    setSearchQuery,
    speakerFilter,
    setSpeakerFilter,
    error,
    clearTranscript,
    copyToClipboard,
    exportJSON,
    exportTXT,
    addDemoSegment,
    stats: {
      totalSegments: segments.length,
      candidateSegmentsCount: candidateSegments.length,
      additionalSegmentsCount: additionalSegments.length,
      suspectSegmentsCount: suspectSegments.length,
      totalWords,
      candidateWords,
      additionalWords,
      averageWpm,
    },
  };
}
