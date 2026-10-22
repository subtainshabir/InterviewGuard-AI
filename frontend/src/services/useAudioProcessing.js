import { useEffect, useRef, useState } from "react";

const FFT_SIZE = 512;
const NUM_SPECTRUM_BANDS = 16;
const HANG_OVER_TIME_MS = 380;          // Hang-over window to bridge natural pauses between words
const PROLONGED_SILENCE_MS = 20000;      // 20s continuous silence warning during active interview
const BACKGROUND_CONFIRM_MS = 450;       // 450ms sustained background speech confirms an event
const WHISPER_CONFIRM_MS = 400;          // 400ms sustained whisper confirms an event
const ADDITIONAL_SPEAKER_CONFIRM_MS = 450; // 450ms sustained secondary pitch confirms additional speaker
const PITCH_DEVIATION_THRESHOLD_HZ = 35; // 35 Hz pitch difference indicates a different speaker
const MAX_AUDIO_EVENTS = 25;
const MAX_ALERTS = 8;
const MAX_EVIDENCE = 12;

let nextEventId = 1;
let nextAlertId = 1;
let nextEvidenceId = 1;

export function formatDurationSec(ms) {
  if (!ms || ms < 0) return "0s";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export function formatTime(timestamp) {
  if (!timestamp) return "00:00";
  const date = new Date(timestamp);
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Normalized Autocorrelation Fundamental Pitch (F0) Detector
 * Extracts pitch in Hz (75Hz - 400Hz for human voice pitch range)
 */
function detectFundamentalPitch(timeData, sampleRate = 44100) {
  const size = timeData.length;
  const buffer = new Float32Array(size);
  let energy0 = 0;

  for (let i = 0; i < size; i++) {
    const val = (timeData[i] - 128) / 128;
    buffer[i] = val;
    energy0 += val * val;
  }

  const rms = Math.sqrt(energy0 / size);
  if (rms < 0.035) return null;

  const minPeriod = Math.floor(sampleRate / 400); // 400 Hz maximum pitch
  const maxPeriod = Math.floor(sampleRate / 75);  // 75 Hz minimum pitch
  const maxLag = Math.min(maxPeriod, Math.floor(size / 2));

  let bestLag = -1;
  let bestCorrelation = -1;
  let secondaryPeaks = 0;

  for (let lag = minPeriod; lag <= maxLag; lag++) {
    let crossCorr = 0;
    let energyLag = 0;
    for (let i = 0; i < size - lag; i++) {
      crossCorr += buffer[i] * buffer[i + lag];
      energyLag += buffer[i + lag] * buffer[i + lag];
    }
    const norm = Math.sqrt(energy0 * energyLag);
    const r = norm > 0 ? crossCorr / norm : 0;

    if (r > bestCorrelation) {
      bestCorrelation = r;
      bestLag = lag;
    }
    if (r > 0.45 && lag > bestLag + 12) {
      secondaryPeaks++;
    }
  }

  if (bestLag > 0 && bestCorrelation >= 0.36) {
    const pitchHz = Math.round(sampleRate / bestLag);
    return {
      pitchHz,
      confidence: Number(bestCorrelation.toFixed(2)),
      hasMultiplePeriodicPeaks: secondaryPeaks >= 2,
    };
  }
  return null;
}

const EMPTY_VAD_STATE = {
  isProcessing: false,
  volume: 0,
  peakVolume: 0,
  db: -60,
  // 1. Speech / Silence
  vadState: "silence", // "silence" | "speech" | "background_speech" | "whisper" | "multiple_speakers" | "muted" | "idle"
  isSpeaking: false,
  currentSegmentDurationMs: 0,
  currentSegmentDurationFormatted: "0s",
  stats: {
    speechTimeMs: 0,
    silenceTimeMs: 0,
    speakingPercentage: 0,
    speechBurstsCount: 0,
    averageBurstDurationSec: 0,
    totalTrackedMs: 0,
  },
  // 2. Voice Activity
  voiceActivityConfidence: 0,
  vocalEnergyRatio: 0,
  zeroCrossingRate: 0,
  cadence: {
    burstsPerMinute: 0,
    rhythm: "Quiet",
  },
  // 3. Multiple Speaker Detection & Diarization
  speakerDiarization: {
    isCalibrated: false,
    candidateBaselinePitch: 140,
    currentPitch: 0,
    pitchDiff: 0,
    activeSpeaker: "none", // "none" | "candidate" | "additional_speaker" | "both_overlapping"
    isAdditionalSpeakerActive: false,
    isMultipleSpeakersActive: false,
    stats: {
      candidateSpeakingTimeMs: 0,
      additionalSpeakerTimeMs: 0,
      overlapSpeakingTimeMs: 0,
      speakerTurnCount: 0,
      candidateRatioPct: 100,
      additionalRatioPct: 0,
    },
    statusMessage: "Calibrating candidate voice profile…",
  },
  // 4. Background Speech & Whispering
  backgroundSpeech: {
    detected: false,
    confidence: 0,
    type: "none",
    message: "No background voices detected.",
  },
  whisperDetected: false,
  multipleSpeakersDetected: false,
  noiseFloor: 6,
  spectrum: new Array(NUM_SPECTRUM_BANDS).fill(0),
  // 5. Audio Events, Alerts & Risk
  audioEvents: [],
  alerts: [],
  evidenceEvents: [],
  risk: {
    score: 0,
    maxScore: 100,
    level: "Low Risk",
    note: "Normal acoustic environment.",
  },
};

/**
 * Advanced Voice Activity Detection (VAD) & Multiple Speaker Detection Hook
 * - Speech / Silence classification with 380ms hang-over debouncing
 * - Voice Activity confidence & vocal formant ratio analysis
 * - Multiple Speaker Detection (Speaker 1 Candidate vs Speaker 2 Additional Speaker)
 * - Fundamental pitch (F0) tracking & speaker diarization turn tracking
 * - Background speech & whisper detection with proctoring alerts
 */
export function useAudioProcessing(stream, active, isMuted = false) {
  const [audioState, setAudioState] = useState(EMPTY_VAD_STATE);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animFrameRef = useRef(null);

  // VAD state machine tracking refs
  const noiseFloorRef = useRef(6);
  const currentVadStateRef = useRef("silence");
  const isSpeakingRef = useRef(false);
  const segmentStartTimeRef = useRef(Date.now());
  const lastActiveSpeechTimeRef = useRef(Date.now());

  // Multiple Speaker Diarization tracking refs
  const candidatePitchHistoryRef = useRef([]);
  const candidateBaselinePitchRef = useRef(140);
  const isProfileCalibratedRef = useRef(false);
  const currentActiveSpeakerRef = useRef("none");
  const previousActiveSpeakerRef = useRef("none");
  const additionalSpeakerStartTimeRef = useRef(0);
  const candidateSpeakingTimeRef = useRef(0);
  const additionalSpeakerTimeRef = useRef(0);
  const overlapSpeakingTimeRef = useRef(0);
  const speakerTurnCountRef = useRef(0);

  // Background speech & whisper sustained counters
  const backgroundSpeechStartTimeRef = useRef(0);
  const whisperStartTimeRef = useRef(0);
  const lastAlertTimesRef = useRef(new Map());

  // Aggregate stats
  const speechTimeRef = useRef(0);
  const silenceTimeRef = useRef(0);
  const burstsCountRef = useRef(0);
  const burstDurationsRef = useRef([]);

  // Events & Alerts lists
  const eventsRef = useRef([]);
  const alertsRef = useRef([]);
  const evidenceRef = useRef([]);
  const hasLoggedFirstSpeechRef = useRef(false);

  useEffect(() => {
    if (!active || !stream || isMuted) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }

      setAudioState((prev) => ({
        ...prev,
        isProcessing: false,
        vadState: isMuted ? "muted" : "idle",
        isSpeaking: false,
        volume: 0,
        voiceActivityConfidence: 0,
        spectrum: new Array(NUM_SPECTRUM_BANDS).fill(0),
      }));
      return undefined;
    }

    let isCancelled = false;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn("[useAudioProcessing] Web Audio API not supported in this browser.");
        return undefined;
      }

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.72;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      const timeData = new Uint8Array(analyser.frequencyBinCount);
      const freqData = new Uint8Array(analyser.frequencyBinCount);

      let lastTick = Date.now();
      const sessionStartTime = Date.now();

      const analyzeFrame = () => {
        if (isCancelled) return;

        analyser.getByteTimeDomainData(timeData);
        analyser.getByteFrequencyData(freqData);

        const now = Date.now();
        const deltaMs = Math.min(200, now - lastTick);
        lastTick = now;

        const binCount = analyser.frequencyBinCount; // 256 bins
        const sampleRate = audioCtx.sampleRate || 44100;
        const binHz = sampleRate / (binCount * 2); // ~86 Hz per bin

        // ====================================================================
        // 1. RMS Energy, Volume & Zero-Crossing Rate (ZCR)
        // ====================================================================
        let sumSquares = 0;
        let peakRaw = 0;
        let zeroCrossings = 0;

        for (let i = 0; i < timeData.length; i++) {
          const val = (timeData[i] - 128) / 128;
          sumSquares += val * val;
          const abs = Math.abs(val);
          if (abs > peakRaw) peakRaw = abs;

          if (i > 0) {
            const prevVal = (timeData[i - 1] - 128) / 128;
            if ((val >= 0 && prevVal < 0) || (val < 0 && prevVal >= 0)) {
              zeroCrossings++;
            }
          }
        }

        const rms = Math.sqrt(sumSquares / timeData.length);
        const rawVolume = Math.min(100, Math.round(rms * 280));
        const peakVolume = Math.min(100, Math.round(peakRaw * 100));
        const db = rms > 0 ? Math.max(-60, Math.round(20 * Math.log10(rms))) : -60;
        const zcr = Number((zeroCrossings / (timeData.length - 1)).toFixed(3));

        // ====================================================================
        // 2. Frequency Spectral Bands Analysis
        // ====================================================================
        const vocalStartBin = Math.max(1, Math.round(250 / binHz));
        const vocalEndBin = Math.min(binCount - 1, Math.round(3200 / binHz));
        const whisperStartBin = Math.max(1, Math.round(2500 / binHz));
        const whisperEndBin = Math.min(binCount - 1, Math.round(5500 / binHz));

        let totalEnergy = 0;
        let vocalBandEnergy = 0;
        let whisperBandEnergy = 0;
        let harmonicPeaksCount = 0;

        for (let b = 0; b < binCount; b++) {
          const mag = freqData[b];
          totalEnergy += mag;
          if (b >= vocalStartBin && b <= vocalEndBin) {
            vocalBandEnergy += mag;
            if (b > 1 && b < binCount - 1) {
              if (mag > 40 && mag > freqData[b - 1] + 8 && mag > freqData[b + 1] + 8) {
                harmonicPeaksCount++;
              }
            }
          }
          if (b >= whisperStartBin && b <= whisperEndBin) {
            whisperBandEnergy += mag;
          }
        }

        const vocalEnergyRatio = totalEnergy > 0 ? vocalBandEnergy / totalEnergy : 0;
        const whisperEnergyRatio = totalEnergy > 0 ? whisperBandEnergy / totalEnergy : 0;

        // Dynamic Noise Floor update
        if (rawVolume < noiseFloorRef.current) {
          noiseFloorRef.current = Math.max(2, Math.round(noiseFloorRef.current * 0.95 + rawVolume * 0.05));
        } else {
          noiseFloorRef.current = Math.min(25, Math.round(noiseFloorRef.current * 0.999 + rawVolume * 0.001));
        }

        // ====================================================================
        // 3. Fundamental Pitch (F0) Tracking
        // ====================================================================
        const pitchData = detectFundamentalPitch(timeData, sampleRate);
        const currentPitch = pitchData?.pitchHz || 0;

        // Calibrate Candidate Voice Baseline (first 10 valid speech pitch frames)
        if (currentPitch >= 80 && currentPitch <= 320 && rawVolume >= 16) {
          if (!isProfileCalibratedRef.current) {
            candidatePitchHistoryRef.current.push(currentPitch);
            if (candidatePitchHistoryRef.current.length >= 8) {
              const sorted = [...candidatePitchHistoryRef.current].sort((a, b) => a - b);
              candidateBaselinePitchRef.current = sorted[Math.floor(sorted.length / 2)];
              isProfileCalibratedRef.current = true;
            }
          }
        }

        const baselinePitch = candidateBaselinePitchRef.current;
        const pitchDiff = currentPitch > 0 ? Math.abs(currentPitch - baselinePitch) : 0;

        // ====================================================================
        // 4. Multiple Speaker Detection & Diarization Logic
        // ====================================================================
        const speechVolumeThreshold = Math.max(12, noiseFloorRef.current + 8);
        const isVoiceActive = rawVolume >= speechVolumeThreshold && vocalEnergyRatio >= 0.38;

        // Condition A: Simultaneous Overlapping Voices
        const isSimultaneousOverlapping =
          isVoiceActive && (harmonicPeaksCount >= 4 || pitchData?.hasMultiplePeriodicPeaks);

        // Condition B: Additional Speaker speaking alone (Pitch deviation from Candidate Baseline)
        const isSignificantPitchDeviation =
          isProfileCalibratedRef.current &&
          currentPitch > 0 &&
          pitchDiff >= PITCH_DEVIATION_THRESHOLD_HZ &&
          isVoiceActive;

        let activeSpeaker = "none";
        let isAdditionalSpeakerConfirmed = false;
        let isMultipleVoicesConfirmed = false;

        if (isSimultaneousOverlapping) {
          activeSpeaker = "both_overlapping";
          isMultipleVoicesConfirmed = true;
          overlapSpeakingTimeRef.current += deltaMs;
        } else if (isSignificantPitchDeviation) {
          activeSpeaker = "additional_speaker";
          if (!additionalSpeakerStartTimeRef.current) {
            additionalSpeakerStartTimeRef.current = now;
          } else if (now - additionalSpeakerStartTimeRef.current >= ADDITIONAL_SPEAKER_CONFIRM_MS) {
            isAdditionalSpeakerConfirmed = true;
          }
          additionalSpeakerTimeRef.current += deltaMs;
        } else if (isVoiceActive) {
          activeSpeaker = "candidate";
          additionalSpeakerStartTimeRef.current = 0;
          candidateSpeakingTimeRef.current += deltaMs;
        } else {
          activeSpeaker = "none";
          additionalSpeakerStartTimeRef.current = 0;
        }

        // Speaker turn transitions (Speaker 1 to Speaker 2 or vice versa)
        let didSpeakerTransition = false;
        let transitionDetails = null;
        if (
          activeSpeaker !== "none" &&
          previousActiveSpeakerRef.current !== "none" &&
          activeSpeaker !== previousActiveSpeakerRef.current
        ) {
          speakerTurnCountRef.current += 1;
          didSpeakerTransition = true;
          transitionDetails = {
            from: previousActiveSpeakerRef.current,
            to: activeSpeaker,
          };
        }
        previousActiveSpeakerRef.current = activeSpeaker;
        currentActiveSpeakerRef.current = activeSpeaker;

        // ====================================================================
        // 5. Background Speech & Whispering Proctor Guard
        // ====================================================================
        const isCandidateNearFieldSpeech = activeSpeaker === "candidate" || activeSpeaker === "both_overlapping";

        const isBackgroundSpeechCandidate =
          !isCandidateNearFieldSpeech &&
          rawVolume >= noiseFloorRef.current + 3 &&
          rawVolume < speechVolumeThreshold + 2 &&
          vocalEnergyRatio >= 0.46;

        const isWhisperCandidate =
          !isCandidateNearFieldSpeech &&
          rawVolume >= 8 &&
          rawVolume <= 30 &&
          zcr >= 0.22 &&
          whisperEnergyRatio >= 0.38;

        let vadConfidence = 0;
        if (isCandidateNearFieldSpeech) {
          vadConfidence = Math.min(99, Math.round(50 + Math.min(25, rawVolume * 0.5) + vocalEnergyRatio * 25));
        } else if (isAdditionalSpeakerConfirmed) {
          vadConfidence = Math.min(95, Math.round(55 + vocalEnergyRatio * 35));
        } else if (isBackgroundSpeechCandidate || isWhisperCandidate) {
          vadConfidence = Math.min(88, Math.round(45 + vocalEnergyRatio * 35));
        } else {
          vadConfidence = Math.max(0, Math.round((rawVolume / speechVolumeThreshold) * 20));
        }

        // Temporal Debouncing (Hang-over)
        let nextVadState = "silence";
        let isSpeakingActive = false;

        if (isVoiceActive || isCandidateNearFieldSpeech) {
          isSpeakingActive = true;
          lastActiveSpeechTimeRef.current = now;
          nextVadState = isMultipleVoicesConfirmed
            ? "multiple_speakers"
            : isAdditionalSpeakerConfirmed
            ? "additional_speaker"
            : "speech";
        } else {
          const timeSinceSpeech = now - lastActiveSpeechTimeRef.current;
          if (timeSinceSpeech < HANG_OVER_TIME_MS) {
            isSpeakingActive = true;
            nextVadState = "speech";
          } else {
            isSpeakingActive = false;
            if (isWhisperCandidate) nextVadState = "whisper";
            else if (isBackgroundSpeechCandidate) nextVadState = "background_speech";
            else nextVadState = "silence";
          }
        }

        // Background / Whisper confirmed flags
        let backgroundConfirmed = false;
        if (isBackgroundSpeechCandidate) {
          if (!backgroundSpeechStartTimeRef.current) {
            backgroundSpeechStartTimeRef.current = now;
          } else if (now - backgroundSpeechStartTimeRef.current >= BACKGROUND_CONFIRM_MS) {
            backgroundConfirmed = true;
          }
        } else {
          backgroundSpeechStartTimeRef.current = 0;
        }

        let whisperConfirmed = false;
        if (isWhisperCandidate) {
          if (!whisperStartTimeRef.current) {
            whisperStartTimeRef.current = now;
          } else if (now - whisperStartTimeRef.current >= WHISPER_CONFIRM_MS) {
            whisperConfirmed = true;
          }
        } else {
          whisperStartTimeRef.current = 0;
        }

        // Cumulative Speech / Silence Time
        if (isSpeakingActive) {
          speechTimeRef.current += deltaMs;
        } else {
          silenceTimeRef.current += deltaMs;
        }

        if (nextVadState !== currentVadStateRef.current) {
          if (currentVadStateRef.current === "speech" || currentVadStateRef.current === "multiple_speakers") {
            const burstDurationMs = now - segmentStartTimeRef.current;
            if (burstDurationMs >= 400) {
              burstsCountRef.current += 1;
              burstDurationsRef.current = [...burstDurationsRef.current, burstDurationMs].slice(-20);
            }
          }
          segmentStartTimeRef.current = now;
          currentVadStateRef.current = nextVadState;
        }

        isSpeakingRef.current = isSpeakingActive;
        const currentSegmentDurationMs = Math.max(0, now - segmentStartTimeRef.current);

        const totalTrackedMs = speechTimeRef.current + silenceTimeRef.current;
        const speakingPercentage =
          totalTrackedMs > 0 ? Math.round((speechTimeRef.current / totalTrackedMs) * 100) : 0;

        const totalMinutes = Math.max(0.2, (now - sessionStartTime) / 60000);
        const burstsPerMinute = Math.round(burstsCountRef.current / totalMinutes);

        let rhythm = "Quiet";
        if (burstsPerMinute >= 16) rhythm = "Intermittent";
        else if (burstsPerMinute >= 6) rhythm = "Natural";
        else if (speakingPercentage > 60) rhythm = "Monologue";

        const avgBurstMs =
          burstDurationsRef.current.length > 0
            ? burstDurationsRef.current.reduce((a, b) => a + b, 0) / burstDurationsRef.current.length
            : 0;
        const averageBurstDurationSec = Number((avgBurstMs / 1000).toFixed(1));

        // Speaker Ratio Calculations
        const totalSpeakerTime = candidateSpeakingTimeRef.current + additionalSpeakerTimeRef.current;
        const candidateRatioPct =
          totalSpeakerTime > 0
            ? Math.round((candidateSpeakingTimeRef.current / totalSpeakerTime) * 100)
            : 100;
        const additionalRatioPct =
          totalSpeakerTime > 0
            ? Math.round((additionalSpeakerTimeRef.current / totalSpeakerTime) * 100)
            : 0;

        // 16-band Spectrum
        const bandSize = Math.floor(binCount / NUM_SPECTRUM_BANDS);
        const spectrum = [];
        for (let b = 0; b < NUM_SPECTRUM_BANDS; b++) {
          let sum = 0;
          for (let i = 0; i < bandSize; i++) {
            sum += freqData[b * bandSize + i];
          }
          spectrum.push(Math.min(100, Math.round((sum / bandSize / 255) * 100)));
        }

        // ====================================================================
        // 6. Audio Events & Alerts Pipeline
        // ====================================================================
        let currentEvents = eventsRef.current;
        let currentAlerts = alertsRef.current;
        let currentEvidence = evidenceRef.current;
        let eventsChanged = false;
        let alertsChanged = false;
        let evidenceChanged = false;

        const lastAlertTimes = lastAlertTimesRef.current;

        // Event: First candidate speech
        if (isSpeakingActive && !hasLoggedFirstSpeechRef.current) {
          hasLoggedFirstSpeechRef.current = true;
          const firstEvt = {
            id: `aud-ev-${nextEventId++}`,
            type: "candidate_speech_started",
            timestamp: now,
            formattedTime: formatTime(now),
            duration: "0s",
            confidence: vadConfidence,
            message: `Candidate voice verified (${baselinePitch} Hz baseline, ${rawVolume}% vol)`,
            severity: "ready",
          };
          currentEvents = [firstEvt, ...currentEvents].slice(0, MAX_AUDIO_EVENTS);
          eventsChanged = true;
        }

        // Event: Speaker Turn Handoff (Speaker 1 <-> Speaker 2 Transition)
        if (didSpeakerTransition && transitionDetails) {
          const lastTransTime = lastAlertTimes.get("speaker_transition") || 0;
          if (now - lastTransTime > 2500) {
            lastAlertTimes.set("speaker_transition", now);
            const fromName =
              transitionDetails.from === "candidate"
                ? "Candidate (Speaker 1)"
                : transitionDetails.from === "additional_speaker"
                ? "Additional Speaker (Speaker 2)"
                : "Multiple Voices";
            const toName =
              transitionDetails.to === "candidate"
                ? "Candidate (Speaker 1)"
                : transitionDetails.to === "additional_speaker"
                ? "Additional Speaker (Speaker 2)"
                : "Multiple Voices";

            const transEvt = {
              id: `aud-ev-${nextEventId++}`,
              type: "speaker_transition",
              speakerFrom: transitionDetails.from,
              speakerTo: transitionDetails.to,
              timestamp: now,
              formattedTime: formatTime(now),
              duration: `Turn #${speakerTurnCountRef.current}`,
              confidence: vadConfidence,
              message: `Speaker transition: ${fromName} → ${toName} (Detected pitch: ${currentPitch} Hz)`,
              severity:
                transitionDetails.to === "additional_speaker"
                  ? "warning"
                  : transitionDetails.to === "both_overlapping"
                  ? "critical"
                  : "ready",
            };
            currentEvents = [transEvt, ...currentEvents].slice(0, MAX_AUDIO_EVENTS);
            eventsChanged = true;
          }
        }

        // Event & Alert: Additional Speaker Detected (Speaker 2 Diarization)
        if (isAdditionalSpeakerConfirmed) {
          const lastAlert = lastAlertTimes.get("additional_speaker") || 0;
          if (now - lastAlert > 8000) {
            lastAlertTimes.set("additional_speaker", now);

            const addSpeakerEvt = {
              id: `aud-ev-${nextEventId++}`,
              type: "additional_speaker_detected",
              timestamp: now,
              formattedTime: formatTime(now),
              duration: formatDurationSec(now - additionalSpeakerStartTimeRef.current),
              confidence: vadConfidence,
              message: `⚠️ Possible additional speaker detected (Pitch: ${currentPitch} Hz vs candidate baseline ${baselinePitch} Hz, +${pitchDiff} Hz divergence)`,
              severity: "warning",
            };
            currentEvents = [addSpeakerEvt, ...currentEvents].slice(0, MAX_AUDIO_EVENTS);
            eventsChanged = true;

            const addAlert = {
              id: `alert-aud-${nextAlertId++}`,
              timestamp: formatTime(now),
              type: "Additional Speaker Detected",
              severity: "warning",
              description: `A distinct second voice spoke (${currentPitch} Hz vs ${baselinePitch} Hz baseline). Possible off-camera coaching.`,
            };
            currentAlerts = [addAlert, ...currentAlerts].slice(0, MAX_ALERTS);
            alertsChanged = true;

            const addEvidence = {
              id: `ev-aud-${nextEvidenceId++}`,
              timestamp: formatTime(now),
              type: "Additional Speaker Detected",
              source: "Multiple Speaker Detector",
              confidence: vadConfidence,
              duration: formatDurationSec(now - additionalSpeakerStartTimeRef.current),
              severity: "warning",
            };
            currentEvidence = [addEvidence, ...currentEvidence].slice(0, MAX_EVIDENCE);
            evidenceChanged = true;
          }
        }

        // Event & Alert: Simultaneous Overlapping Voices
        if (isMultipleVoicesConfirmed) {
          const lastAlert = lastAlertTimes.get("multiple_speakers") || 0;
          if (now - lastAlert > 8000) {
            lastAlertTimes.set("multiple_speakers", now);

            const multEvt = {
              id: `aud-ev-${nextEventId++}`,
              type: "multiple_speakers",
              timestamp: now,
              formattedTime: formatTime(now),
              duration: "Simultaneous",
              confidence: vadConfidence,
              message: `⚠️ Multiple overlapping voice frequencies detected in audio feed`,
              severity: "critical",
            };
            currentEvents = [multEvt, ...currentEvents].slice(0, MAX_AUDIO_EVENTS);
            eventsChanged = true;

            const multAlert = {
              id: `alert-aud-${nextAlertId++}`,
              timestamp: formatTime(now),
              type: "Multiple Speakers Detected",
              severity: "critical",
              description: `Simultaneous vocal harmonics detected in interview audio`,
            };
            currentAlerts = [multAlert, ...currentAlerts].slice(0, MAX_ALERTS);
            alertsChanged = true;

            const multEvidence = {
              id: `ev-aud-${nextEvidenceId++}`,
              timestamp: formatTime(now),
              type: "Multiple Speakers Detected",
              source: "Multiple Speaker Detector",
              confidence: vadConfidence,
              duration: "Simultaneous",
              severity: "critical",
            };
            currentEvidence = [multEvidence, ...currentEvidence].slice(0, MAX_EVIDENCE);
            evidenceChanged = true;
          }
        }

        // Event & Alert: Whispering Detected
        if (whisperConfirmed) {
          const lastAlert = lastAlertTimes.get("whisper") || 0;
          if (now - lastAlert > 8000) {
            lastAlertTimes.set("whisper", now);

            const whisperEvt = {
              id: `aud-ev-${nextEventId++}`,
              type: "whispering_detected",
              timestamp: now,
              formattedTime: formatTime(now),
              duration: formatDurationSec(now - whisperStartTimeRef.current),
              confidence: vadConfidence,
              message: `⚠️ Whispering / covert audio pattern detected (ZCR: ${zcr}, ${rawVolume}% vol)`,
              severity: "warning",
            };
            currentEvents = [whisperEvt, ...currentEvents].slice(0, MAX_AUDIO_EVENTS);
            eventsChanged = true;

            const whisperAlert = {
              id: `alert-aud-${nextAlertId++}`,
              timestamp: formatTime(now),
              type: "Whispering / Coaching Pattern",
              severity: "warning",
              description: `Acoustic whisper formants detected in audio feed (possible off-camera coaching)`,
            };
            currentAlerts = [whisperAlert, ...currentAlerts].slice(0, MAX_ALERTS);
            alertsChanged = true;

            const whisperEvidence = {
              id: `ev-aud-${nextEvidenceId++}`,
              timestamp: formatTime(now),
              type: "Whispering Detected",
              source: "Voice Activity Detector",
              confidence: vadConfidence,
              duration: formatDurationSec(now - whisperStartTimeRef.current),
              severity: "warning",
            };
            currentEvidence = [whisperEvidence, ...currentEvidence].slice(0, MAX_EVIDENCE);
            evidenceChanged = true;
          }
        }

        // Event & Alert: Background Speech
        if (backgroundConfirmed) {
          const lastAlert = lastAlertTimes.get("bg_speech") || 0;
          if (now - lastAlert > 8000) {
            lastAlertTimes.set("bg_speech", now);

            const bgEvent = {
              id: `aud-ev-${nextEventId++}`,
              type: "background_speech",
              timestamp: now,
              formattedTime: formatTime(now),
              duration: formatDurationSec(now - backgroundSpeechStartTimeRef.current),
              confidence: vadConfidence,
              message: `⚠️ Secondary background voice detected (${rawVolume}% volume, formant ratio: ${Math.round(vocalEnergyRatio * 100)}%)`,
              severity: "warning",
            };
            currentEvents = [bgEvent, ...currentEvents].slice(0, MAX_AUDIO_EVENTS);
            eventsChanged = true;

            const bgAlert = {
              id: `alert-aud-${nextAlertId++}`,
              timestamp: formatTime(now),
              type: "Background Voice Detected",
              severity: "warning",
              description: `Off-camera or secondary voice detected in candidate audio feed (${rawVolume}%)`,
            };
            currentAlerts = [bgAlert, ...currentAlerts].slice(0, MAX_ALERTS);
            alertsChanged = true;

            const bgEvidence = {
              id: `ev-aud-${nextEvidenceId++}`,
              timestamp: formatTime(now),
              type: "Background Voice Detected",
              source: "Voice Activity Detector",
              confidence: vadConfidence,
              duration: formatDurationSec(now - backgroundSpeechStartTimeRef.current),
              severity: "warning",
            };
            currentEvidence = [bgEvidence, ...currentEvidence].slice(0, MAX_EVIDENCE);
            evidenceChanged = true;
          }
        }

        if (eventsChanged) eventsRef.current = currentEvents;
        if (alertsChanged) alertsRef.current = currentAlerts;
        if (evidenceChanged) evidenceRef.current = currentEvidence;

        // Calculate Proctoring Risk Score
        let audioRiskPenalty = 0;
        let riskNote = "Normal acoustic environment.";
        if (isMultipleVoicesConfirmed) {
          audioRiskPenalty += 40;
          riskNote = "CRITICAL: Multiple overlapping voices detected.";
        } else if (isAdditionalSpeakerConfirmed) {
          audioRiskPenalty += 30;
          riskNote = "ALERT: Possible additional speaker detected.";
        } else if (whisperConfirmed) {
          audioRiskPenalty += 30;
          riskNote = "ALERT: Whispering / covert speech detected.";
        } else if (backgroundConfirmed) {
          audioRiskPenalty += 25;
          riskNote = "ALERT: Secondary background voice active.";
        }

        const riskScore = Math.min(100, audioRiskPenalty);
        const riskLevel =
          riskScore >= 60 ? "High Risk" : riskScore >= 25 ? "Elevated Risk" : "Low Risk";

        const speakerDiarizationSummary = {
          isCalibrated: isProfileCalibratedRef.current,
          candidateBaselinePitch: baselinePitch,
          currentPitch,
          pitchDiff,
          activeSpeaker,
          isAdditionalSpeakerActive: isAdditionalSpeakerConfirmed,
          isMultipleSpeakersActive: isMultipleVoicesConfirmed,
          stats: {
            candidateSpeakingTimeMs: candidateSpeakingTimeRef.current,
            additionalSpeakerTimeMs: additionalSpeakerTimeRef.current,
            overlapSpeakingTimeMs: overlapSpeakingTimeRef.current,
            speakerTurnCount: speakerTurnCountRef.current,
            candidateRatioPct,
            additionalRatioPct,
          },
          statusMessage: isMultipleVoicesConfirmed
            ? "Multiple overlapping voices active"
            : isAdditionalSpeakerConfirmed
            ? `Possible additional speaker (${currentPitch} Hz vs ${baselinePitch} Hz baseline)`
            : activeSpeaker === "candidate"
            ? `Candidate verified (${currentPitch} Hz)`
            : isProfileCalibratedRef.current
            ? `Candidate profile calibrated (${baselinePitch} Hz)`
            : "Calibrating candidate voice profile…",
        };

        const backgroundSummary = {
          detected: backgroundConfirmed || whisperConfirmed || isMultipleVoicesConfirmed || isAdditionalSpeakerConfirmed,
          confidence: vadConfidence,
          type: isMultipleVoicesConfirmed
            ? "multiple_speakers"
            : isAdditionalSpeakerConfirmed
            ? "additional_speaker"
            : whisperConfirmed
            ? "whispering"
            : backgroundConfirmed
            ? "background_voice"
            : "none",
          message: isMultipleVoicesConfirmed
            ? "Multiple overlapping voices detected"
            : isAdditionalSpeakerConfirmed
            ? "Possible additional speaker detected"
            : whisperConfirmed
            ? "Whispering / off-camera coaching pattern detected"
            : backgroundConfirmed
            ? "Secondary background voice detected"
            : "No background voices detected",
        };

        setAudioState({
          isProcessing: true,
          volume: rawVolume,
          peakVolume,
          db,
          vadState: nextVadState,
          isSpeaking: isSpeakingActive,
          currentSegmentDurationMs,
          currentSegmentDurationFormatted: formatDurationSec(currentSegmentDurationMs),
          stats: {
            speechTimeMs: speechTimeRef.current,
            silenceTimeMs: silenceTimeRef.current,
            speakingPercentage,
            speechBurstsCount: burstsCountRef.current,
            averageBurstDurationSec,
            totalTrackedMs,
          },
          voiceActivityConfidence: vadConfidence,
          vocalEnergyRatio: Math.round(vocalEnergyRatio * 100),
          zeroCrossingRate: zcr,
          cadence: {
            burstsPerMinute,
            rhythm,
          },
          speakerDiarization: speakerDiarizationSummary,
          backgroundSpeech: backgroundSummary,
          whisperDetected: whisperConfirmed,
          multipleSpeakersDetected: isMultipleVoicesConfirmed || isAdditionalSpeakerConfirmed,
          noiseFloor: noiseFloorRef.current,
          spectrum,
          audioEvents: eventsRef.current,
          alerts: alertsRef.current,
          evidenceEvents: evidenceRef.current,
          risk: {
            score: riskScore,
            maxScore: 100,
            level: riskLevel,
            note: riskNote,
          },
        });

        animFrameRef.current = requestAnimationFrame(analyzeFrame);
      };

      animFrameRef.current = requestAnimationFrame(analyzeFrame);
    } catch (err) {
      console.error("[useAudioProcessing] VAD/Speaker Initialization error:", err);
    }

    return () => {
      isCancelled = true;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [stream, active, isMuted]);

  return audioState;
}
