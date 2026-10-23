import { useCallback, useEffect, useRef, useState, useMemo } from "react";

const MESSAGES = {
  permission_denied:
    "Screen sharing permission was denied. Please select a display to share for interview proctoring.",
  unavailable: "Screen capture is not supported on this browser or device.",
  error: "Something went wrong while accessing screen capture.",
  tab_warning:
    "Warning: Only a browser tab was shared. Proctors recommend sharing your Entire Screen.",
  window_warning:
    "Warning: Only an application window was shared. Proctors recommend sharing your Entire Screen.",
};

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toTimeString().split(" ")[0];
}

function formatDuration(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${remMins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function useScreenShare() {
  const [status, setStatus] = useState("idle"); // "idle" | "requesting" | "active" | "stopped" | "permission_denied" | "unavailable" | "error"
  const [errorMessage, setErrorMessage] = useState(null);
  const [stream, setStream] = useState(null);
  const [displaySurface, setDisplaySurface] = useState("unknown"); // "monitor" | "window" | "browser" | "unknown"
  const [resolution, setResolution] = useState({ width: 0, height: 0, frameRate: 0 });
  const [sharingDurationSec, setSharingDurationSec] = useState(0);
  const [snapshots, setSnapshots] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [evidenceEvents, setEvidenceEvents] = useState([]);

  const [stats, setStats] = useState({
    totalShares: 0,
    totalDurationSec: 0,
    screenDrops: 0,
    snapshotsTaken: 0,
  });

  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const nextAlertIdRef = useRef(1);
  const nextEvidenceIdRef = useRef(1);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    setStream(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Helper to record alerts & evidence
  const pushAlertAndEvidence = useCallback((label, description, severity = "warning") => {
    const timeStr = formatTime(Date.now());
    const alertId = `salert-${nextAlertIdRef.current++}`;
    const evidenceId = `sevid-${nextEvidenceIdRef.current++}`;

    setAlerts((prev) => [
      {
        id: alertId,
        type: label,
        severity,
        description,
        message: description,
        timestamp: timeStr,
      },
      ...prev,
    ].slice(0, 10));

    setEvidenceEvents((prev) => [
      {
        id: evidenceId,
        type: label,
        source: "Screen Sharing",
        confidence: 100,
        duration: "Instant",
        severity,
        timestamp: timeStr,
      },
      ...prev,
    ].slice(0, 10));
  }, []);

  // Native onended handler (fires when candidate clicks "Stop sharing" on the browser banner)
  const handleTrackEnded = useCallback(() => {
    stopTracks();
    setStatus("stopped");
    setStats((prev) => ({
      ...prev,
      screenDrops: prev.screenDrops + 1,
    }));

    pushAlertAndEvidence(
      "Screen Sharing Stopped",
      "Candidate stopped screen sharing stream.",
      "critical"
    );
  }, [stopTracks, pushAlertAndEvidence]);

  // Capture current frame snapshot to Canvas / DataURL
  const captureSnapshot = useCallback(() => {
    if (!streamRef.current) return null;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return null;

    try {
      const videoEl = document.createElement("video");
      videoEl.srcObject = streamRef.current;
      videoEl.muted = true;
      videoEl.play();

      return new Promise((resolve) => {
        videoEl.onloadedmetadata = () => {
          const w = videoEl.videoWidth || resolution.width || 1280;
          const h = videoEl.videoHeight || resolution.height || 720;
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(videoEl, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

          const now = Date.now();
          const snapshotObj = {
            id: `snap-${now}`,
            timestamp: formatTime(now),
            dataUrl,
            width: w,
            height: h,
          };

          setSnapshots((prev) => [snapshotObj, ...prev].slice(0, 10));
          setStats((prev) => ({ ...prev, snapshotsTaken: prev.snapshotsTaken + 1 }));

          // cleanup
          videoEl.pause();
          videoEl.srcObject = null;
          resolve(snapshotObj);
        };
      });
    } catch (err) {
      console.warn("Could not capture screen snapshot:", err);
      return null;
    }
  }, [resolution]);

  // Start Screen Sharing
  const start = useCallback(async () => {
    if (status === "requesting" || status === "active") return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setStatus("unavailable");
      setErrorMessage(MESSAGES.unavailable);
      return;
    }

    setStatus("requesting");
    setErrorMessage(null);

    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          displaySurface: "monitor",
        },
        audio: false,
      });

      const videoTrack = mediaStream.getVideoTracks()[0];

      // Inspect surface settings
      const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
      const surface = settings.displaySurface || "monitor";
      const w = settings.width || 1920;
      const h = settings.height || 1080;
      const fr = settings.frameRate ? Math.round(settings.frameRate) : 30;

      setDisplaySurface(surface);
      setResolution({ width: w, height: h, frameRate: fr });

      // Listen for when user clicks native "Stop sharing" button
      videoTrack.onended = handleTrackEnded;

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setStatus("active");
      startTimeRef.current = Date.now();
      setSharingDurationSec(0);

      // Start elapsed timer
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setSharingDurationSec(elapsed);
        }
      }, 1000);

      setStats((prev) => ({
        ...prev,
        totalShares: prev.totalShares + 1,
      }));

      // Check display surface compliance
      if (surface === "browser") {
        pushAlertAndEvidence("Partial Screen Share", MESSAGES.tab_warning, "warning");
      } else if (surface === "window") {
        pushAlertAndEvidence("Window-Only Screen Share", MESSAGES.window_warning, "warning");
      } else {
        pushAlertAndEvidence(
          "Screen Sharing Active",
          `Entire screen share established (${w}×${h} @ ${fr}fps).`,
          "info"
        );
      }
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
  }, [status, stopTracks, handleTrackEnded, pushAlertAndEvidence]);

  // Stop Screen Sharing
  const stop = useCallback(() => {
    stopTracks();
    setStatus("stopped");
    setErrorMessage(null);
    setStats((prev) => ({
      ...prev,
      totalDurationSec: prev.totalDurationSec + sharingDurationSec,
    }));
  }, [stopTracks, sharingDurationSec]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopTracks();
    };
  }, [stopTracks]);

  const isSharing = status === "active";
  const isEntireScreen = displaySurface === "monitor";

  const risk = useMemo(() => {
    if (status === "stopped" && stats.screenDrops > 0) {
      return {
        score: 35,
        level: "Elevated Risk",
        note: "Screen sharing was terminated during the active session.",
      };
    }
    if (isSharing && !isEntireScreen) {
      return {
        score: 20,
        level: "Moderate Risk",
        note: `Candidate shared a ${displaySurface} instead of entire desktop monitor.`,
      };
    }
    if (isSharing) {
      return {
        score: 0,
        level: "Low Risk",
        note: `Screen capture verified (${resolution.width}×${resolution.height}).`,
      };
    }
    return {
      score: 0,
      level: "Low Risk",
      note: "Screen sharing idle.",
    };
  }, [status, stats.screenDrops, isSharing, isEntireScreen, displaySurface, resolution]);

  const summary = useMemo(() => {
    return {
      status,
      isSharing,
      isEntireScreen,
      displaySurface,
      resolution,
      durationFormatted: formatDuration(sharingDurationSec),
      durationSec: sharingDurationSec,
      snapshotsCount: snapshots.length,
      statusLabel: isSharing
        ? `Sharing ${isEntireScreen ? "Entire Screen" : displaySurface} (${formatDuration(sharingDurationSec)})`
        : status === "permission_denied"
        ? "Permission Denied"
        : status === "requesting"
        ? "Requesting permission…"
        : status === "stopped"
        ? "Sharing stopped"
        : "Screen share offline",
    };
  }, [
    status,
    isSharing,
    isEntireScreen,
    displaySurface,
    resolution,
    sharingDurationSec,
    snapshots.length,
  ]);

  return {
    status,
    errorMessage,
    stream,
    isSharing,
    isEntireScreen,
    displaySurface,
    resolution,
    sharingDurationSec,
    sharingDurationFormatted: formatDuration(sharingDurationSec),
    snapshots,
    captureSnapshot,
    stats,
    start,
    stop,
    risk,
    summary,
    alerts,
    evidenceEvents,
  };
}
