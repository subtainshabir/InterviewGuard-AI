import { useEffect, useRef, useState, useMemo } from "react";

// Thresholds for Speech Behavior Analysis
export const MICRO_PAUSE_MAX_MS = 1500;       // < 1.5s is natural breathing / cognitive pause
export const HESITATION_PAUSE_MIN_MS = 1500;   // 1.5s - 3.5s indicates noticeable hesitation
export const LONG_PAUSE_MIN_MS = 3500;         // > 3.5s is a prolonged pause / candidate stuck
export const EXCESSIVE_PAUSE_MIN_MS = 7000;     // > 7.0s is critical dead silence

export const RESPONSE_DELAY_IMMEDIATE_MS = 1200; // < 1.2s is immediate confident response
export const RESPONSE_DELAY_NORMAL_MS = 2800;    // 1.2s - 2.8s is typical latency
export const RESPONSE_DELAY_LONG_MS = 5500;      // > 5.5s is excessive latency / consulting notes

export const MAX_STORED_PAUSES = 50;
export const MAX_STORED_DELAYS = 30;
export const MAX_STORED_TRANSITIONS = 50;
export const MAX_ALERTS = 10;
export const MAX_EVIDENCE = 10;

let nextAlertId = 1;
let nextEvidenceId = 1;

function formatDurationSec(ms) {
  if (!ms || ms < 0) return "0.0s";
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toTimeString().split(" ")[0];
}

export function useSpeechBehaviorAnalysis(
  audioState = {},
  transcriptState = {},
  isActive = false
) {
  const [behavior, setBehavior] = useState({
    longPauses: {
      currentPauseMs: 0,
      currentPauseFormatted: "0.0s",
      longPauseCount: 0,
      totalPauseTimeMs: 0,
      averagePauseMs: 0,
      averagePauseFormatted: "0.0s",
      longestPauseMs: 0,
      longestPauseFormatted: "0.0s",
      hesitationIndex: 0, // 0 - 100%
      isLongPauseActive: false,
      isExcessivePauseActive: false,
      distribution: {
        microPct: 100,
        hesitationPct: 0,
        longPct: 0,
      },
      classification: {
        level: "Natural Flow",
        severity: "ready",
        description: "Normal speech pause distribution",
      },
    },
    responseDelays: {
      currentDelayMs: 0,
      currentDelayFormatted: "0.0s",
      lastResponseDelayMs: 0,
      lastResponseDelayFormatted: "0.0s",
      averageDelayMs: 0,
      averageDelayFormatted: "0.0s",
      totalDelaysTracked: 0,
      delayedResponsesCount: 0,
      classification: {
        level: "Calibrating",
        label: "Calibrating response latency…",
        severity: "idle",
      },
      latencyScore: 100, // 0 - 100 response readiness
    },
    voiceTransitions: {
      totalTransitions: 0,
      transitionsPerMinute: 0,
      turnHandoffs: 0,
      pitchVariance: 0,
      smoothness: "Smooth",
      smoothnessSeverity: "ready",
      recentTransitions: [],
    },
    behavioralSignals: {
      pattern: "Natural Fluency",
      riskLevel: "Low Risk",
      severity: "ready",
      description: "Speech rhythm and pause duration reflect natural, unassisted cognitive delivery.",
      fluencyScore: 92,
      scriptReadingProbability: 0,
      coachingCorrelationScore: 0,
      riskScore: 0,
    },
    summary: {
      pattern: "Natural Fluency",
      hesitationIndex: 0,
      longPauseCount: 0,
      averageDelaySec: "0.0s",
      fluencyScore: 92,
      isLongPause: false,
      isDelayedResponse: false,
      isSuspectDelivery: false,
    },
    alerts: [],
    evidenceEvents: [],
  });

  // Internal Tracking References
  const prevIsSpeakingRef = useRef(false);
  const prevActiveSpeakerRef = useRef("none");
  const silenceStartMsRef = useRef(0);
  const speechStartMsRef = useRef(0);
  const lastSpeakerEndTimeRef = useRef(0);
  const lastSecondaryVoiceTimeRef = useRef(0);

  const pausesHistoryRef = useRef([]);
  const delaysHistoryRef = useRef([]);
  const transitionsHistoryRef = useRef([]);
  const pitchHistoryRef = useRef([]);
  const alertsRef = useRef([]);
  const evidenceRef = useRef([]);
  const lastAlertTimesRef = useRef(new Map());

  const totalMonitoredMsRef = useRef(0);
  const totalPauseDurationMsRef = useRef(0);
  const totalSpeechDurationMsRef = useRef(0);
  const longestPauseMsRef = useRef(0);

  useEffect(() => {
    if (!isActive) return;

    const now = Date.now();
    const isSpeaking = Boolean(audioState.isSpeaking);
    const speakerDiarization = audioState.speakerDiarization || {};
    const activeSpeaker = speakerDiarization.activeSpeaker || "none";
    const currentPitch = speakerDiarization.currentPitch || 0;
    const isAdditionalSpeaker =
      speakerDiarization.isAdditionalSpeakerActive ||
      activeSpeaker === "additional_speaker";

    let alertsChanged = false;
    let evidenceChanged = false;
    let currentAlerts = alertsRef.current;
    let currentEvidence = evidenceRef.current;
    const lastAlertTimes = lastAlertTimesRef.current;

    // ------------------------------------------------------------------------
    // 1. Long Pauses Analysis
    // ------------------------------------------------------------------------
    let currentPauseMs = 0;
    if (!isSpeaking) {
      if (!silenceStartMsRef.current) {
        silenceStartMsRef.current = now;
      }
      currentPauseMs = now - silenceStartMsRef.current;
    } else {
      silenceStartMsRef.current = 0;
    }

    // State transition: Speech -> Silence or Silence -> Speech
    if (prevIsSpeakingRef.current && !isSpeaking) {
      // Just stopped speaking -> silence begins
      silenceStartMsRef.current = now;
      lastSpeakerEndTimeRef.current = now;
    } else if (!prevIsSpeakingRef.current && isSpeaking) {
      // Just started speaking -> silence ends, record pause duration
      const pauseDuration = silenceStartMsRef.current ? now - silenceStartMsRef.current : 0;
      if (pauseDuration >= 600) {
        pausesHistoryRef.current = [
          { timestamp: now, durationMs: pauseDuration },
          ...pausesHistoryRef.current,
        ].slice(0, MAX_STORED_PAUSES);

        totalPauseDurationMsRef.current += pauseDuration;
        if (pauseDuration > longestPauseMsRef.current) {
          longestPauseMsRef.current = pauseDuration;
        }
      }

      // Check response delay from last speaker turn handoff
      if (lastSpeakerEndTimeRef.current > 0) {
        const responseDelay = now - lastSpeakerEndTimeRef.current;
        delaysHistoryRef.current = [
          { timestamp: now, delayMs: responseDelay },
          ...delaysHistoryRef.current,
        ].slice(0, MAX_STORED_DELAYS);
      }

      speechStartMsRef.current = now;
    }

    if (isSpeaking) {
      totalSpeechDurationMsRef.current += 100; // approximate frame increment
    }

    // Track secondary voice time for coaching correlation
    if (isAdditionalSpeaker || audioState.backgroundSpeech?.detected) {
      lastSecondaryVoiceTimeRef.current = now;
    }

    // Record pitch for acoustic transition variance
    if (currentPitch > 70 && currentPitch < 400 && isSpeaking) {
      pitchHistoryRef.current = [currentPitch, ...pitchHistoryRef.current].slice(0, 30);
    }

    // Voice transitions tracking (Speech/Silence boundary or speaker change)
    if (
      isSpeaking !== prevIsSpeakingRef.current ||
      (activeSpeaker !== "none" && activeSpeaker !== prevActiveSpeakerRef.current)
    ) {
      transitionsHistoryRef.current = [
        {
          timestamp: now,
          from: prevIsSpeakingRef.current ? prevActiveSpeakerRef.current : "silence",
          to: isSpeaking ? activeSpeaker : "silence",
        },
        ...transitionsHistoryRef.current,
      ].slice(0, MAX_STORED_TRANSITIONS);
    }

    prevIsSpeakingRef.current = isSpeaking;
    prevActiveSpeakerRef.current = activeSpeaker;
    totalMonitoredMsRef.current += 100;

    // ------------------------------------------------------------------------
    // Calculate Long Pause Metrics
    // ------------------------------------------------------------------------
    const pauseList = pausesHistoryRef.current;
    const longPauses = pauseList.filter((p) => p.durationMs >= LONG_PAUSE_MIN_MS);
    const hesitationPauses = pauseList.filter(
      (p) => p.durationMs >= HESITATION_PAUSE_MIN_MS && p.durationMs < LONG_PAUSE_MIN_MS
    );
    const microPauses = pauseList.filter((p) => p.durationMs < HESITATION_PAUSE_MIN_MS);

    const totalPausesCount = Math.max(1, pauseList.length);
    const microPct = Math.round((microPauses.length / totalPausesCount) * 100);
    const hesitationPct = Math.round((hesitationPauses.length / totalPausesCount) * 100);
    const longPct = Math.round((longPauses.length / totalPausesCount) * 100);

    const avgPauseMs =
      pauseList.length > 0
        ? Math.round(pauseList.reduce((acc, p) => acc + p.durationMs, 0) / pauseList.length)
        : 0;

    const totalPauseTime = totalPauseDurationMsRef.current + currentPauseMs;
    const totalSpeakingTime = totalSpeechDurationMsRef.current;
    const totalVoiceTime = totalPauseTime + totalSpeakingTime;
    const hesitationIndex =
      totalVoiceTime > 0 ? Math.min(100, Math.round((totalPauseTime / totalVoiceTime) * 100)) : 0;

    const isLongPauseActive = currentPauseMs >= LONG_PAUSE_MIN_MS;
    const isExcessivePauseActive = currentPauseMs >= EXCESSIVE_PAUSE_MIN_MS;

    let pauseClassification = {
      level: "Natural Flow",
      severity: "ready",
      description: "Speech pauses align with natural cognitive phrasing.",
    };

    if (isExcessivePauseActive) {
      pauseClassification = {
        level: "Excessive Dead Silence",
        severity: "critical",
        description: `Silence exceeds ${formatDurationSec(currentPauseMs)}. Candidate may be consulting notes or stuck.`,
      };
    } else if (isLongPauseActive || longPauses.length >= 3) {
      pauseClassification = {
        level: "Prolonged Hesitation",
        severity: "warning",
        description: `Multiple prolonged pauses (>3.5s) detected during speaking session.`,
      };
    } else if (hesitationPct > 45) {
      pauseClassification = {
        level: "Elevated Hesitation",
        severity: "warning",
        description: "Candidate exhibits frequent hesitation between sentences.",
      };
    }

    // Alert on Excessive Pause (>5.5s)
    if (currentPauseMs >= 5500) {
      const lastAlert = lastAlertTimes.get("long_pause") || 0;
      if (now - lastAlert > 12000) {
        lastAlertTimes.set("long_pause", now);

        const alertItem = {
          id: `alert-pause-${nextAlertId++}`,
          timestamp: formatTime(now),
          type: "Prolonged Speech Pause",
          severity: currentPauseMs >= EXCESSIVE_PAUSE_MIN_MS ? "critical" : "warning",
          description: `Candidate has been silent for ${formatDurationSec(currentPauseMs)} during response.`,
        };
        currentAlerts = [alertItem, ...currentAlerts].slice(0, MAX_ALERTS);
        alertsChanged = true;

        const evidenceItem = {
          id: `ev-pause-${nextEvidenceId++}`,
          timestamp: formatTime(now),
          type: "Prolonged Speech Pause",
          source: "Speech Behavior Analyzer",
          confidence: 94,
          duration: formatDurationSec(currentPauseMs),
          severity: "warning",
        };
        currentEvidence = [evidenceItem, ...currentEvidence].slice(0, MAX_EVIDENCE);
        evidenceChanged = true;
      }
    }

    // ------------------------------------------------------------------------
    // 2. Response Delays Analysis
    // ------------------------------------------------------------------------
    const delayList = delaysHistoryRef.current;
    const avgDelayMs =
      delayList.length > 0
        ? Math.round(delayList.reduce((acc, d) => acc + d.delayMs, 0) / delayList.length)
        : 0;

    const lastDelayMs = delayList.length > 0 ? delayList[0].delayMs : 0;
    const delayedResponses = delayList.filter((d) => d.delayMs >= RESPONSE_DELAY_NORMAL_MS);

    let delayClassification = {
      level: "Normal Latency",
      label: `Normal Response (${formatDurationSec(avgDelayMs)})`,
      severity: "ready",
    };

    if (delayList.length === 0) {
      delayClassification = {
        level: "Calibrating",
        label: "Calibrating turn latency…",
        severity: "idle",
      };
    } else if (avgDelayMs > RESPONSE_DELAY_LONG_MS || (lastDelayMs > RESPONSE_DELAY_LONG_MS && isSpeaking)) {
      delayClassification = {
        level: "Excessive Delay",
        label: `High Response Lag (${formatDurationSec(avgDelayMs)})`,
        severity: "critical",
      };
    } else if (avgDelayMs > RESPONSE_DELAY_NORMAL_MS) {
      delayClassification = {
        level: "Noticeable Delay",
        label: `Delayed Response (${formatDurationSec(avgDelayMs)})`,
        severity: "warning",
      };
    } else if (avgDelayMs < RESPONSE_DELAY_IMMEDIATE_MS) {
      delayClassification = {
        level: "Immediate",
        label: `Immediate / Prompt (${formatDurationSec(avgDelayMs)})`,
        severity: "ready",
      };
    }

    // Alert on Excessive Response Delay
    if (lastDelayMs >= RESPONSE_DELAY_LONG_MS && delayList.length > 0) {
      const lastAlert = lastAlertTimes.get("response_delay") || 0;
      if (now - lastAlert > 15000) {
        lastAlertTimes.set("response_delay", now);

        const delayAlert = {
          id: `alert-delay-${nextAlertId++}`,
          timestamp: formatTime(now),
          type: "Excessive Response Delay",
          severity: "warning",
          description: `Candidate took ${formatDurationSec(lastDelayMs)} to answer prompt. Possible off-screen consultation.`,
        };
        currentAlerts = [delayAlert, ...currentAlerts].slice(0, MAX_ALERTS);
        alertsChanged = true;

        const delayEvidence = {
          id: `ev-delay-${nextEvidenceId++}`,
          timestamp: formatTime(now),
          type: "Excessive Response Delay",
          source: "Speech Behavior Analyzer",
          confidence: 90,
          duration: formatDurationSec(lastDelayMs),
          severity: "warning",
        };
        currentEvidence = [delayEvidence, ...currentEvidence].slice(0, MAX_EVIDENCE);
        evidenceChanged = true;
      }
    }

    // ------------------------------------------------------------------------
    // 3. Voice Transitions Analysis
    // ------------------------------------------------------------------------
    const transList = transitionsHistoryRef.current;
    const monitoredMinutes = Math.max(0.2, totalMonitoredMsRef.current / 60000);
    const transPerMin = Math.round(transList.length / monitoredMinutes);

    // Calculate pitch variance during speech
    let pitchVariance = 0;
    const pitches = pitchHistoryRef.current;
    if (pitches.length >= 4) {
      const meanPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;
      const variance =
        pitches.reduce((acc, p) => acc + Math.pow(p - meanPitch, 2), 0) / pitches.length;
      pitchVariance = Math.round(Math.sqrt(variance)); // standard deviation in Hz
    }

    let smoothness = "Smooth";
    let smoothnessSeverity = "ready";
    if (transPerMin > 26 || (pitchVariance > 28 && pitches.length >= 6)) {
      smoothness = "Erratic / Fragmented";
      smoothnessSeverity = "critical";
    } else if (transPerMin > 16 || pitchVariance > 18) {
      smoothness = "Staccato / Hesitant";
      smoothnessSeverity = "warning";
    }

    // ------------------------------------------------------------------------
    // 4. Speech-Related Behavioral Signals Synthesis
    // ------------------------------------------------------------------------
    const speechStats = transcriptState.stats || {};
    const wpm = speechStats.averageWpm || (audioState.cadence?.burstsPerMinute ? audioState.cadence.burstsPerMinute * 3 : 0);

    // Teleprompter / Script-Reading Check: High speed + very low pause ratio + flat intonation
    let scriptReadingProb = 0;
    if (wpm > 150 && hesitationIndex < 12 && totalSpeechDurationMsRef.current > 15000) {
      scriptReadingProb = Math.min(95, Math.round(40 + (wpm - 150) * 1.5 + (12 - hesitationIndex) * 3));
    }

    // Coaching Correlation Check: Secondary voice occurred shortly before candidate speaking
    let coachingCorrelation = 0;
    if (lastSecondaryVoiceTimeRef.current > 0 && isSpeaking) {
      const timeSinceSecondary = now - lastSecondaryVoiceTimeRef.current;
      if (timeSinceSecondary >= 1000 && timeSinceSecondary <= 4500) {
        coachingCorrelation = 88;
      }
    }

    // Verbal Fluency Score (0 - 100)
    let fluencyScore = 95;
    if (hesitationIndex > 50) fluencyScore -= Math.round((hesitationIndex - 50) * 0.7);
    if (longPauses.length > 0) fluencyScore -= Math.min(25, longPauses.length * 6);
    if (avgDelayMs > RESPONSE_DELAY_NORMAL_MS) fluencyScore -= 12;
    if (smoothnessSeverity === "warning") fluencyScore -= 10;
    if (smoothnessSeverity === "critical") fluencyScore -= 20;
    fluencyScore = Math.max(15, Math.min(100, fluencyScore));

    // Behavioral Pattern Verdict
    let pattern = "Natural Fluency";
    let patternDesc = "Speech rhythm, cadence, and pause profile reflect authentic cognitive formulation.";
    let patternSeverity = "ready";
    let patternRiskLevel = "Low Risk";
    let behaviorRiskScore = 0;

    if (coachingCorrelation >= 80) {
      pattern = "Suspect Prompt Relaying";
      patternDesc = "Candidate response closely followed an off-camera secondary acoustic voice event.";
      patternSeverity = "critical";
      patternRiskLevel = "High Risk";
      behaviorRiskScore = 45;
    } else if (scriptReadingProb >= 70) {
      pattern = "Script / Teleprompter Reading";
      patternDesc = "Unnaturally rapid delivery (>150 WPM) with minimal cognitive pausing suggests reading off-screen text.";
      patternSeverity = "warning";
      patternRiskLevel = "Elevated Risk";
      behaviorRiskScore = 35;
    } else if (isExcessivePauseActive || longPauses.length >= 4) {
      pattern = "Prolonged Hesitation";
      patternDesc = "Recurrent long pauses (>3.5s) suggest difficulty recalling or consulting external materials.";
      patternSeverity = "warning";
      patternRiskLevel = "Moderate Risk";
      behaviorRiskScore = 20;
    } else if (smoothnessSeverity === "critical") {
      pattern = "Choppy / Fragmented Speech";
      patternDesc = "Speech contains abrupt stops and high vocal pitch variance.";
      patternSeverity = "warning";
      patternRiskLevel = "Moderate Risk";
      behaviorRiskScore = 15;
    }

    if (alertsChanged) alertsRef.current = currentAlerts;
    if (evidenceChanged) evidenceRef.current = currentEvidence;

    setBehavior({
      longPauses: {
        currentPauseMs,
        currentPauseFormatted: formatDurationSec(currentPauseMs),
        longPauseCount: longPauses.length,
        totalPauseTimeMs: totalPauseTime,
        averagePauseMs: avgPauseMs,
        averagePauseFormatted: formatDurationSec(avgPauseMs),
        longestPauseMs: longestPauseMsRef.current,
        longestPauseFormatted: formatDurationSec(longestPauseMsRef.current),
        hesitationIndex,
        isLongPauseActive,
        isExcessivePauseActive,
        distribution: {
          microPct,
          hesitationPct,
          longPct,
        },
        classification: pauseClassification,
      },
      responseDelays: {
        currentDelayMs: lastSpeakerEndTimeRef.current && !isSpeaking ? now - lastSpeakerEndTimeRef.current : 0,
        currentDelayFormatted: formatDurationSec(
          lastSpeakerEndTimeRef.current && !isSpeaking ? now - lastSpeakerEndTimeRef.current : 0
        ),
        lastResponseDelayMs: lastDelayMs,
        lastResponseDelayFormatted: formatDurationSec(lastDelayMs),
        averageDelayMs: avgDelayMs,
        averageDelayFormatted: formatDurationSec(avgDelayMs),
        totalDelaysTracked: delayList.length,
        delayedResponsesCount: delayedResponses.length,
        classification: delayClassification,
        latencyScore: Math.max(0, 100 - Math.round(avgDelayMs / 60)),
      },
      voiceTransitions: {
        totalTransitions: transList.length,
        transitionsPerMinute: transPerMin,
        turnHandoffs: speakerDiarization.stats?.speakerTurnCount || 0,
        pitchVariance,
        smoothness,
        smoothnessSeverity,
        recentTransitions: transList.slice(0, 8),
      },
      behavioralSignals: {
        pattern,
        riskLevel: patternRiskLevel,
        severity: patternSeverity,
        description: patternDesc,
        fluencyScore,
        scriptReadingProbability: scriptReadingProb,
        coachingCorrelationScore: coachingCorrelation,
        riskScore: behaviorRiskScore,
      },
      summary: {
        pattern,
        hesitationIndex,
        longPauseCount: longPauses.length,
        averageDelaySec: formatDurationSec(avgDelayMs),
        fluencyScore,
        isLongPause: isLongPauseActive,
        isDelayedResponse: delayClassification.severity === "warning" || delayClassification.severity === "critical",
        isSuspectDelivery: scriptReadingProb > 60 || coachingCorrelation > 60,
      },
      alerts: currentAlerts,
      evidenceEvents: currentEvidence,
      risk: {
        score: behaviorRiskScore,
        maxScore: 100,
        level: patternRiskLevel,
        note: patternDesc,
      },
    });
  }, [
    isActive,
    audioState.isSpeaking,
    audioState.vadState,
    audioState.volume,
    audioState.cadence,
    audioState.speakerDiarization,
    audioState.backgroundSpeech,
    transcriptState.stats,
  ]);

  return behavior;
}
