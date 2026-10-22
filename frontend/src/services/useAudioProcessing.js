import { useEffect, useRef, useState } from "react";

const FFT_SIZE = 512;
const NUM_SPECTRUM_BANDS = 16;
const SPEECH_THRESHOLD_VOLUME = 14;     // Volume > 14% indicates active speech
const LOUD_THRESHOLD_VOLUME = 80;       // Volume > 80% indicates loud acoustic spike
const LONG_SILENCE_THRESHOLD_MS = 15000; // 15 seconds continuous silence warning
const MAX_AUDIO_EVENTS = 15;

let nextEventId = 1;
let nextAlertId = 1;

function formatTime(timestamp) {
  if (!timestamp) return "00:00";
  const date = new Date(timestamp);
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${m}:${s}`;
}

const EMPTY_AUDIO_STATE = {
  isProcessing: false,
  volume: 0,
  peakVolume: 0,
  db: -60,
  voiceState: "idle", // "idle" | "silence" | "speaking" | "loud" | "muted"
  isSpeaking: false,
  noiseFloor: 5,
  spectrum: new Array(NUM_SPECTRUM_BANDS).fill(0),
  stats: {
    speakingTimeMs: 0,
    silenceTimeMs: 0,
    speakingPercentage: 0,
    totalTrackedMs: 0,
  },
  audioEvents: [],
  alerts: [],
};

/**
 * Audio Processing Foundation Hook
 * Real-time Web Audio API signal processing:
 * - RMS Volume & Decibel calculation
 * - 16-band Frequency Spectrum analysis for live waveform visualization
 * - Voice Activity Detection (VAD: Speaking vs Silence vs Noise)
 * - Dynamic Ambient Noise Floor tracking
 * - Acoustic event timeline logging & alert generation
 */
export function useAudioProcessing(stream, active, isMuted = false) {
  const [audioState, setAudioState] = useState(EMPTY_AUDIO_STATE);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animFrameRef = useRef(null);

  // Persistent tracking refs
  const noiseFloorRef = useRef(8);
  const speakingTimeRef = useRef(0);
  const silenceTimeRef = useRef(0);
  const lastStateChangeRef = useRef(Date.now());
  const lastSilenceAlertRef = useRef(0);
  const eventsRef = useRef([]);
  const alertsRef = useRef([]);
  const hasDetectedFirstSpeechRef = useRef(false);

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
        voiceState: isMuted ? "muted" : "idle",
        volume: 0,
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

      // Handle suspended audio context (browser autoplay policies)
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.75;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      const timeData = new Uint8Array(analyser.frequencyBinCount);
      const freqData = new Uint8Array(analyser.frequencyBinCount);

      let lastTick = Date.now();

      const analyzeFrame = () => {
        if (isCancelled) return;

        analyser.getByteTimeDomainData(timeData);
        analyser.getByteFrequencyData(freqData);

        const now = Date.now();
        const deltaMs = Math.min(200, now - lastTick);
        lastTick = now;

        // 1. Calculate RMS Amplitude & Volume (0 to 100)
        let sumSquares = 0;
        let peakRaw = 0;
        for (let i = 0; i < timeData.length; i++) {
          const normalized = (timeData[i] - 128) / 128; // -1.0 to 1.0
          sumSquares += normalized * normalized;
          const abs = Math.abs(normalized);
          if (abs > peakRaw) peakRaw = abs;
        }

        const rms = Math.sqrt(sumSquares / timeData.length);
        // Exponential volume curve for natural human auditory perception
        const rawVolume = Math.min(100, Math.round(rms * 280));
        const peakVolume = Math.min(100, Math.round(peakRaw * 100));
        const db = rms > 0 ? Math.max(-60, Math.round(20 * Math.log10(rms))) : -60;

        // 2. Ambient Noise Floor Tracking (smoothed minimum)
        if (rawVolume < noiseFloorRef.current) {
          noiseFloorRef.current = Math.max(2, Math.round(noiseFloorRef.current * 0.95 + rawVolume * 0.05));
        } else {
          noiseFloorRef.current = Math.min(25, Math.round(noiseFloorRef.current * 0.999 + rawVolume * 0.001));
        }

        // 3. Voice Activity Detection (VAD)
        let currentVoiceState = "silence";
        let isSpeaking = false;

        const dynamicSpeechThreshold = Math.max(SPEECH_THRESHOLD_VOLUME, noiseFloorRef.current + 8);

        if (rawVolume >= LOUD_THRESHOLD_VOLUME) {
          currentVoiceState = "loud";
          isSpeaking = true;
        } else if (rawVolume >= dynamicSpeechThreshold) {
          currentVoiceState = "speaking";
          isSpeaking = true;
        } else {
          currentVoiceState = "silence";
          isSpeaking = false;
        }

        // 4. Update Time Statistics
        if (isSpeaking) {
          speakingTimeRef.current += deltaMs;
        } else {
          silenceTimeRef.current += deltaMs;
        }

        const totalTrackedMs = speakingTimeRef.current + silenceTimeRef.current;
        const speakingPercentage =
          totalTrackedMs > 0
            ? Math.round((speakingTimeRef.current / totalTrackedMs) * 100)
            : 0;

        // 5. Compute 16-band Frequency Spectrum for Visualizer
        const bandSize = Math.floor(freqData.length / NUM_SPECTRUM_BANDS);
        const spectrum = [];
        for (let b = 0; b < NUM_SPECTRUM_BANDS; b++) {
          let bandSum = 0;
          for (let i = 0; i < bandSize; i++) {
            bandSum += freqData[b * bandSize + i];
          }
          const avg = bandSum / bandSize;
          spectrum.push(Math.min(100, Math.round((avg / 255) * 100)));
        }

        // 6. Acoustic Event Logging & Alerts
        let currentEvents = eventsRef.current;
        let currentAlerts = alertsRef.current;
        let eventsChanged = false;
        let alertsChanged = false;

        // Event: First candidate speech
        if (isSpeaking && !hasDetectedFirstSpeechRef.current) {
          hasDetectedFirstSpeechRef.current = true;
          const firstSpeechEvent = {
            id: `aud-ev-${nextEventId++}`,
            type: "first_speech",
            timestamp: now,
            formattedTime: formatTime(now),
            message: `Candidate voice active (Volume: ${rawVolume}%, ${db} dB)`,
            severity: "ready",
          };
          currentEvents = [firstSpeechEvent, ...currentEvents].slice(0, MAX_AUDIO_EVENTS);
          eventsChanged = true;
        }

        // Event: Sudden Loud Noise Spike
        if (currentVoiceState === "loud" && now - lastStateChangeRef.current > 8000) {
          lastStateChangeRef.current = now;
          const loudEvent = {
            id: `aud-ev-${nextEventId++}`,
            type: "loud_noise",
            timestamp: now,
            formattedTime: formatTime(now),
            message: `Acoustic spike detected (${rawVolume}% volume, ${db} dB)`,
            severity: "warning",
          };
          currentEvents = [loudEvent, ...currentEvents].slice(0, MAX_AUDIO_EVENTS);
          eventsChanged = true;

          const newAlert = {
            id: `alert-aud-${nextAlertId++}`,
            timestamp: formatTime(now),
            type: "Acoustic Disturbance",
            severity: "warning",
            description: `Sudden loud noise spike in candidate audio feed (${rawVolume}%)`,
          };
          currentAlerts = [newAlert, ...currentAlerts].slice(0, 8);
          alertsChanged = true;
        }

        if (eventsChanged) eventsRef.current = currentEvents;
        if (alertsChanged) alertsRef.current = currentAlerts;

        // 7. Update UI state
        setAudioState({
          isProcessing: true,
          volume: rawVolume,
          peakVolume,
          db,
          voiceState: currentVoiceState,
          isSpeaking,
          noiseFloor: noiseFloorRef.current,
          spectrum,
          stats: {
            speakingTimeMs: speakingTimeRef.current,
            silenceTimeMs: silenceTimeRef.current,
            speakingPercentage,
            totalTrackedMs,
          },
          audioEvents: eventsRef.current,
          alerts: alertsRef.current,
        });

        animFrameRef.current = requestAnimationFrame(analyzeFrame);
      };

      animFrameRef.current = requestAnimationFrame(analyzeFrame);
    } catch (err) {
      console.error("[useAudioProcessing] Initialization error:", err);
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
