import { useCallback, useEffect, useRef, useState } from "react";

const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: false,
};

const MESSAGES = {
  permission_denied:
    "Microphone permission was denied. Please allow microphone access in your browser settings to enable audio monitoring.",
  unavailable: "No microphone was found on this device.",
  error: "Something went wrong while accessing the microphone.",
};

export function useMicrophone() {
  const [status, setStatus] = useState("idle"); // "idle" | "requesting" | "active" | "muted" | "stopped" | "permission_denied" | "unavailable" | "error"
  const [errorMessage, setErrorMessage] = useState(null);
  const [stream, setStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const streamRef = useRef(null);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    setIsMuted(false);
  }, []);

  const start = useCallback(async () => {
    if (status === "requesting" || status === "active" || status === "muted") return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("unavailable");
      setErrorMessage("This browser does not support microphone access.");
      return;
    }

    setStatus("requesting");
    setErrorMessage(null);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setIsMuted(false);
      setStatus("active");
    } catch (err) {
      stopTracks();
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setStatus("permission_denied");
        setErrorMessage(MESSAGES.permission_denied);
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setStatus("unavailable");
        setErrorMessage(MESSAGES.unavailable);
      } else {
        setStatus("error");
        setErrorMessage(err.message || MESSAGES.error);
      }
    }
  }, [status, stopTracks]);

  const stop = useCallback(() => {
    stopTracks();
    setStatus("stopped");
    setErrorMessage(null);
  }, [stopTracks]);

  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;
    const audioTracks = streamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;

    const nextMuted = !isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
    setStatus(nextMuted ? "muted" : "active");
  }, [isMuted]);

  const setMuted = useCallback((muted) => {
    if (!streamRef.current) return;
    const audioTracks = streamRef.current.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = !muted;
    });
    setIsMuted(muted);
    setStatus(muted ? "muted" : "active");
  }, []);

  useEffect(() => {
    return () => {
      stopTracks();
    };
  }, [stopTracks]);

  return {
    status,
    errorMessage,
    stream,
    isMuted,
    start,
    stop,
    toggleMute,
    setMuted,
  };
}
