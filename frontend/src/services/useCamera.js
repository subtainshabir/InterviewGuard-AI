import { useCallback, useEffect, useRef, useState } from "react";

const VIDEO_CONSTRAINTS = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: "user",
  },
  audio: false,
};

const MESSAGES = {
  permission_denied:
    "Camera permission was denied. Please allow camera access in your browser settings to use interview monitoring.",
  unavailable: "No camera was found on this device.",
  error: "Something went wrong while accessing the camera.",
};

export function useCamera() {
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState(null);
  const [stream, setStream] = useState(null);
  const streamRef = useRef(null);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
  }, []);

  const start = useCallback(async () => {
    if (status === "requesting" || status === "active") return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("unavailable");
      setErrorMessage("This browser does not support camera access.");
      return;
    }

    setStatus("requesting");
    setErrorMessage(null);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
      streamRef.current = mediaStream;
      setStream(mediaStream);
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

  useEffect(() => {
    return () => {
      stopTracks();
    };
  }, [stopTracks]);

  return { status, errorMessage, stream, start, stop };
}