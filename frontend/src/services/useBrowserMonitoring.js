import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Security & Integrity Thresholds
export const MAX_STORED_EVENTS = 50;
export const AWAY_DURATION_WARNING_MS = 2500;
export const AWAY_DURATION_CRITICAL_MS = 6000;
export const BLUR_DURATION_WARNING_MS = 3000;
export const BLUR_DURATION_CRITICAL_MS = 8000;

function formatDurationSec(ms) {
  if (!ms || ms < 0) return "0.0s";
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toTimeString().split(" ")[0];
}

export function useBrowserMonitoring(options = {}) {
  const {
    isActive = true,
    initialPolicies = {
      blockCopyPaste: false,
      blockContextMenu: false,
      requireFullscreen: false,
      blockRestrictedShortcuts: false,
    },
  } = options;

  const [policies, setPolicies] = useState(initialPolicies);

  // Core state
  const [tabActivity, setTabActivity] = useState({
    switchCount: 0,
    isTabHidden: typeof document !== "undefined" ? document.hidden : false,
    currentAwayDurationMs: 0,
    totalAwayDurationMs: 0,
    lastSwitchedAt: null,
    recentSwitches: [],
  });

  const [windowFocus, setWindowFocus] = useState({
    blurCount: 0,
    isFocused: typeof document !== "undefined" ? document.hasFocus() : true,
    currentBlurDurationMs: 0,
    totalBlurDurationMs: 0,
    lastBlurAt: null,
    recentBlurs: [],
  });

  const [fullscreen, setFullscreen] = useState({
    isFullscreen:
      typeof document !== "undefined" ? Boolean(document.fullscreenElement) : false,
    exitCount: 0,
    lastExitAt: null,
    isSupported:
      typeof document !== "undefined" ? Boolean(document.fullscreenEnabled) : false,
  });

  const [clipboard, setClipboard] = useState({
    copyCount: 0,
    pasteCount: 0,
    cutCount: 0,
    totalClipboardEvents: 0,
    lastAction: null,
    lastTextLength: 0,
    lastTimestamp: null,
    recentEvents: [],
  });

  const [shortcuts, setShortcuts] = useState({
    blockedCount: 0,
    lastShortcut: null,
    lastTimestamp: null,
    recentShortcuts: [],
  });

  const [systemMetrics, setSystemMetrics] = useState({
    mouseLeaveCount: 0,
    contextMenuCount: 0,
    resizeCount: 0,
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    viewport:
      typeof window !== "undefined"
        ? { width: window.innerWidth, height: window.innerHeight }
        : { width: 1920, height: 1080 },
  });

  const [browserEvents, setBrowserEvents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [evidenceEvents, setEvidenceEvents] = useState([]);

  // Refs for tracking timestamps across renders
  const hiddenStartTimeRef = useRef(null);
  const blurStartTimeRef = useRef(null);
  const resizeTimeoutRef = useRef(null);
  const nextEventIdRef = useRef(1);
  const nextAlertIdRef = useRef(1);
  const nextEvidenceIdRef = useRef(1);
  const policiesRef = useRef(policies);
  policiesRef.current = policies;

  // Helper to add structured browser event
  const recordEvent = useCallback(
    ({ category, type, label, description, severity = "info", details = {} }) => {
      const now = Date.now();
      const timeStr = formatTime(now);
      const eventId = `bevt-${nextEventIdRef.current++}`;

      const newEvent = {
        id: eventId,
        timestamp: timeStr,
        rawTimestamp: now,
        category, // "tab" | "focus" | "fullscreen" | "clipboard" | "shortcut" | "system"
        type,
        label,
        description,
        severity, // "info" | "warning" | "critical"
        details,
      };

      setBrowserEvents((prev) => [newEvent, ...prev].slice(0, MAX_STORED_EVENTS));

      // If warning or critical, also push to Alerts list
      if (severity === "warning" || severity === "critical") {
        const alertId = `balert-${nextAlertIdRef.current++}`;
        const newAlert = {
          id: alertId,
          type: label,
          severity,
          description,
          message: description,
          timestamp: timeStr,
        };
        setAlerts((prev) => [newAlert, ...prev].slice(0, 10));

        // Create Evidence Event for timeline
        const evidenceId = `bevid-${nextEvidenceIdRef.current++}`;
        const newEvidence = {
          id: evidenceId,
          type: label,
          source: `Browser Monitor (${category})`,
          confidence: 100,
          duration: details.durationMs ? formatDurationSec(details.durationMs) : "Instant",
          severity,
          timestamp: timeStr,
        };
        setEvidenceEvents((prev) => [newEvidence, ...prev].slice(0, 10));
      }
    },
    []
  );

  // Toggle Policy Handlers
  const togglePolicy = useCallback((key) => {
    setPolicies((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  // Fullscreen Request Handlers
  const enterFullscreen = useCallback(async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        await document.documentElement.webkitRequestFullscreen();
      } else if (document.documentElement.msRequestFullscreen) {
        await document.documentElement.msRequestFullscreen();
      }
    } catch {
      // Permission denied or user cancelled
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore
    }
  }, []);

  // Clear Events
  const clearEvents = useCallback(() => {
    setBrowserEvents([]);
    setAlerts([]);
    setEvidenceEvents([]);
  }, []);

  // Event Listeners Lifecycle
  useEffect(() => {
    if (!isActive || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    // 1. Tab Visibility Change (Tab Switching)
    const handleVisibilityChange = () => {
      const isHidden = document.hidden;
      const now = Date.now();
      const timeStr = formatTime(now);

      if (isHidden) {
        hiddenStartTimeRef.current = now;
        setTabActivity((prev) => ({
          ...prev,
          switchCount: prev.switchCount + 1,
          isTabHidden: true,
          lastSwitchedAt: timeStr,
        }));

        recordEvent({
          category: "tab",
          type: "TAB_SWITCH_OUT",
          label: "Tab Switched",
          description: "Candidate switched away from the examination tab.",
          severity: "warning",
          details: { switchedAt: timeStr },
        });
      } else {
        const awayDurationMs = hiddenStartTimeRef.current
          ? Math.max(0, now - hiddenStartTimeRef.current)
          : 0;
        hiddenStartTimeRef.current = null;

        const isProlonged = awayDurationMs >= AWAY_DURATION_CRITICAL_MS;
        const isNoticeable = awayDurationMs >= AWAY_DURATION_WARNING_MS;
        const severity = isProlonged ? "critical" : isNoticeable ? "warning" : "info";

        setTabActivity((prev) => {
          const newSwitches = [
            {
              timestamp: timeStr,
              durationMs: awayDurationMs,
              formatted: formatDurationSec(awayDurationMs),
            },
            ...prev.recentSwitches,
          ].slice(0, 10);

          return {
            ...prev,
            isTabHidden: false,
            currentAwayDurationMs: 0,
            totalAwayDurationMs: prev.totalAwayDurationMs + awayDurationMs,
            recentSwitches: newSwitches,
          };
        });

        recordEvent({
          category: "tab",
          type: "TAB_SWITCH_IN",
          label: isProlonged ? "Prolonged Tab Absence" : "Tab Restored",
          description: `Candidate returned to tab after ${formatDurationSec(awayDurationMs)} away.`,
          severity,
          details: { durationMs: awayDurationMs },
        });
      }
    };

    // 2. Window Blur / Focus
    const handleWindowBlur = () => {
      const now = Date.now();
      const timeStr = formatTime(now);
      blurStartTimeRef.current = now;

      setWindowFocus((prev) => ({
        ...prev,
        blurCount: prev.blurCount + 1,
        isFocused: false,
        lastBlurAt: timeStr,
      }));

      recordEvent({
        category: "focus",
        type: "WINDOW_BLUR",
        label: "Window Focus Lost",
        description: "Candidate unfocused browser window (clicked outside or Alt+Tabbed).",
        severity: "warning",
        details: { blurAt: timeStr },
      });
    };

    const handleWindowFocus = () => {
      const now = Date.now();
      const timeStr = formatTime(now);
      const blurDurationMs = blurStartTimeRef.current
        ? Math.max(0, now - blurStartTimeRef.current)
        : 0;
      blurStartTimeRef.current = null;

      const isProlonged = blurDurationMs >= BLUR_DURATION_CRITICAL_MS;
      const isNoticeable = blurDurationMs >= BLUR_DURATION_WARNING_MS;
      const severity = isProlonged ? "critical" : isNoticeable ? "warning" : "info";

      setWindowFocus((prev) => {
        const newBlurs = [
          {
            timestamp: timeStr,
            durationMs: blurDurationMs,
            formatted: formatDurationSec(blurDurationMs),
          },
          ...prev.recentBlurs,
        ].slice(0, 10);

        return {
          ...prev,
          isFocused: true,
          currentBlurDurationMs: 0,
          totalBlurDurationMs: prev.totalBlurDurationMs + blurDurationMs,
          recentBlurs: newBlurs,
        };
      });

      recordEvent({
        category: "focus",
        type: "WINDOW_FOCUS",
        label: isProlonged ? "Prolonged Window Unfocus" : "Window Focus Regained",
        description: `Window focus restored after ${formatDurationSec(blurDurationMs)}.`,
        severity,
        details: { durationMs: blurDurationMs },
      });
    };

    // 3. Fullscreen Change
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = Boolean(
        document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement
      );
      const now = Date.now();
      const timeStr = formatTime(now);

      setFullscreen((prev) => {
        const exited = prev.isFullscreen && !isCurrentlyFullscreen;
        return {
          ...prev,
          isFullscreen: isCurrentlyFullscreen,
          exitCount: exited ? prev.exitCount + 1 : prev.exitCount,
          lastExitAt: exited ? timeStr : prev.lastExitAt,
        };
      });

      if (!isCurrentlyFullscreen) {
        recordEvent({
          category: "fullscreen",
          type: "FULLSCREEN_EXIT",
          label: "Fullscreen Exited",
          description: "Candidate exited fullscreen proctoring mode.",
          severity: "critical",
          details: { exitedAt: timeStr },
        });
      } else {
        recordEvent({
          category: "fullscreen",
          type: "FULLSCREEN_ENTER",
          label: "Fullscreen Enabled",
          description: "Fullscreen proctoring mode active.",
          severity: "info",
          details: { enteredAt: timeStr },
        });
      }
    };

    // 4. Clipboard Events (Copy, Paste, Cut)
    const handleCopy = (e) => {
      const now = Date.now();
      const timeStr = formatTime(now);
      const selection = window.getSelection ? window.getSelection().toString() : "";
      const textLen = selection.length;

      if (policiesRef.current.blockCopyPaste) {
        e.preventDefault();
      }

      setClipboard((prev) => ({
        ...prev,
        copyCount: prev.copyCount + 1,
        totalClipboardEvents: prev.totalClipboardEvents + 1,
        lastAction: "copy",
        lastTextLength: textLen,
        lastTimestamp: timeStr,
        recentEvents: [
          { action: "copy", length: textLen, timestamp: timeStr },
          ...prev.recentEvents,
        ].slice(0, 10),
      }));

      recordEvent({
        category: "clipboard",
        type: "COPY_DETECTED",
        label: policiesRef.current.blockCopyPaste ? "Blocked Copy Attempt" : "Copy Action",
        description: policiesRef.current.blockCopyPaste
          ? `Blocked copying of text (${textLen} characters) by policy.`
          : `Candidate copied text (${textLen} characters).`,
        severity: policiesRef.current.blockCopyPaste ? "warning" : "info",
        details: { characters: textLen },
      });
    };

    const handlePaste = (e) => {
      const now = Date.now();
      const timeStr = formatTime(now);
      let pastedLength = 0;

      try {
        if (e.clipboardData) {
          pastedLength = e.clipboardData.getData("text").length;
        }
      } catch {
        pastedLength = 0;
      }

      if (policiesRef.current.blockCopyPaste) {
        e.preventDefault();
      }

      setClipboard((prev) => ({
        ...prev,
        pasteCount: prev.pasteCount + 1,
        totalClipboardEvents: prev.totalClipboardEvents + 1,
        lastAction: "paste",
        lastTextLength: pastedLength,
        lastTimestamp: timeStr,
        recentEvents: [
          { action: "paste", length: pastedLength, timestamp: timeStr },
          ...prev.recentEvents,
        ].slice(0, 10),
      }));

      const isLargePaste = pastedLength > 100;

      recordEvent({
        category: "clipboard",
        type: "PASTE_DETECTED",
        label: policiesRef.current.blockCopyPaste ? "Blocked Paste Attempt" : "Paste Detected",
        description: policiesRef.current.blockCopyPaste
          ? `Blocked paste operation (${pastedLength} characters) by proctoring policy.`
          : `Candidate pasted text into the session (${pastedLength} characters).`,
        severity: isLargePaste ? "critical" : "warning",
        details: { characters: pastedLength },
      });
    };

    const handleCut = (e) => {
      const now = Date.now();
      const timeStr = formatTime(now);

      if (policiesRef.current.blockCopyPaste) {
        e.preventDefault();
      }

      setClipboard((prev) => ({
        ...prev,
        cutCount: prev.cutCount + 1,
        totalClipboardEvents: prev.totalClipboardEvents + 1,
        lastAction: "cut",
        lastTimestamp: timeStr,
      }));

      recordEvent({
        category: "clipboard",
        type: "CUT_DETECTED",
        label: policiesRef.current.blockCopyPaste ? "Blocked Cut Attempt" : "Cut Action",
        description: "Candidate cut text in the document.",
        severity: "info",
        details: {},
      });
    };

    // 5. Keyboard Shortcuts
    const handleKeyDown = (e) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const key = e.key ? e.key.toUpperCase() : "";
      const isShift = e.shiftKey;
      const isAlt = e.altKey;

      let shortcutLabel = null;
      let severity = "warning";
      let isProhibited = false;

      // Check DevTools shortcuts
      if (
        e.key === "F12" ||
        (isCtrlOrMeta && isShift && (key === "I" || key === "J" || key === "C"))
      ) {
        shortcutLabel = `Developer Tools (${e.key === "F12" ? "F12" : `Ctrl+Shift+${key}`})`;
        severity = "critical";
        isProhibited = true;
      }
      // Print page
      else if (isCtrlOrMeta && key === "P") {
        shortcutLabel = `Print Page (${isCtrlOrMeta ? "Ctrl+P" : "Cmd+P"})`;
        severity = "warning";
        isProhibited = true;
      }
      // Save page
      else if (isCtrlOrMeta && key === "S") {
        shortcutLabel = `Save Page (${isCtrlOrMeta ? "Ctrl+S" : "Cmd+S"})`;
        severity = "info";
        isProhibited = true;
      }
      // Screenshot key
      else if (e.key === "PrintScreen") {
        shortcutLabel = "Screenshot Attempt (PrintScreen)";
        severity = "critical";
        isProhibited = true;
      }
      // Open new tab / window
      else if (isCtrlOrMeta && (key === "T" || key === "N")) {
        shortcutLabel = `Open New Tab/Window (Ctrl+${key})`;
        severity = "warning";
      }
      // Close window
      else if (isCtrlOrMeta && key === "W") {
        shortcutLabel = "Close Tab Shortcut (Ctrl+W)";
        severity = "warning";
      }
      // Window switch (Alt+Tab / Alt+F4)
      else if (isAlt && (key === "TAB" || key === "F4")) {
        shortcutLabel = `Window Switch (${isAlt ? "Alt+" : ""}${key})`;
        severity = "warning";
      }
      // Windows Key
      else if (e.key === "Meta" || e.key === "OS") {
        shortcutLabel = "OS Start Menu (Windows/Meta Key)";
        severity = "info";
      }

      if (shortcutLabel) {
        const now = Date.now();
        const timeStr = formatTime(now);

        if (policiesRef.current.blockRestrictedShortcuts && isProhibited) {
          e.preventDefault();
        }

        setShortcuts((prev) => ({
          ...prev,
          blockedCount: prev.blockedCount + 1,
          lastShortcut: shortcutLabel,
          lastTimestamp: timeStr,
          recentShortcuts: [
            { label: shortcutLabel, severity, timestamp: timeStr },
            ...prev.recentShortcuts,
          ].slice(0, 10),
        }));

        recordEvent({
          category: "shortcut",
          type: "KEYBOARD_SHORTCUT",
          label: shortcutLabel,
          description: `Shortcut pressed: ${shortcutLabel}`,
          severity,
          details: { key: e.key, ctrl: isCtrlOrMeta, alt: isAlt, shift: isShift },
        });
      }
    };

    // 6. Mouse Leave Viewport
    const handleMouseLeave = () => {
      setSystemMetrics((prev) => ({
        ...prev,
        mouseLeaveCount: prev.mouseLeaveCount + 1,
      }));

      recordEvent({
        category: "system",
        type: "MOUSE_LEAVE",
        label: "Cursor Left Window",
        description: "Mouse pointer moved outside the browser examination viewport.",
        severity: "info",
        details: {},
      });
    };

    // 7. Right-Click Context Menu
    const handleContextMenu = (e) => {
      if (policiesRef.current.blockContextMenu) {
        e.preventDefault();
      }

      setSystemMetrics((prev) => ({
        ...prev,
        contextMenuCount: prev.contextMenuCount + 1,
      }));

      recordEvent({
        category: "system",
        type: "CONTEXT_MENU",
        label: policiesRef.current.blockContextMenu
          ? "Blocked Right-Click"
          : "Right-Click Context Menu",
        description: policiesRef.current.blockContextMenu
          ? "Blocked right-click context menu attempt by policy."
          : "Candidate right-clicked on page content.",
        severity: policiesRef.current.blockContextMenu ? "warning" : "info",
        details: { x: e.clientX, y: e.clientY },
      });
    };

    // 8. Window Resize / Split Screen Docking
    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      resizeTimeoutRef.current = setTimeout(() => {
        const newW = window.innerWidth;
        const newH = window.innerHeight;

        setSystemMetrics((prev) => ({
          ...prev,
          resizeCount: prev.resizeCount + 1,
          viewport: { width: newW, height: newH },
        }));

        recordEvent({
          category: "system",
          type: "WINDOW_RESIZE",
          label: "Window Resized",
          description: `Viewport dimension changed to ${newW}x${newH}px.`,
          severity: "info",
          details: { width: newW, height: newH },
        });
      }, 500);
    };

    // 9. Online / Offline Status
    const handleOnline = () => {
      setSystemMetrics((prev) => ({ ...prev, isOnline: true }));
      recordEvent({
        category: "system",
        type: "NETWORK_ONLINE",
        label: "Network Restored",
        description: "Browser network connection active.",
        severity: "info",
      });
    };

    const handleOffline = () => {
      setSystemMetrics((prev) => ({ ...prev, isOnline: false }));
      recordEvent({
        category: "system",
        type: "NETWORK_OFFLINE",
        label: "Network Disconnected",
        description: "Candidate went offline (network connection lost).",
        severity: "critical",
      });
    };

    // Attach listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenchange", handleFullscreenChange);
    window.addEventListener("copy", handleCopy);
    window.addEventListener("paste", handlePaste);
    window.addEventListener("cut", handleCut);
    window.addEventListener("keydown", handleKeyDown);
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("resize", handleResize);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenchange", handleFullscreenChange);
      window.removeEventListener("copy", handleCopy);
      window.removeEventListener("paste", handlePaste);
      window.removeEventListener("cut", handleCut);
      window.removeEventListener("keydown", handleKeyDown);
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);

      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [isActive, recordEvent]);

  // Live timer tick for active away or blur duration
  useEffect(() => {
    if (!tabActivity.isTabHidden && windowFocus.isFocused) return;

    const timer = setInterval(() => {
      const now = Date.now();
      if (tabActivity.isTabHidden && hiddenStartTimeRef.current) {
        setTabActivity((prev) => ({
          ...prev,
          currentAwayDurationMs: now - hiddenStartTimeRef.current,
        }));
      }
      if (!windowFocus.isFocused && blurStartTimeRef.current) {
        setWindowFocus((prev) => ({
          ...prev,
          currentBlurDurationMs: now - blurStartTimeRef.current,
        }));
      }
    }, 500);

    return () => clearInterval(timer);
  }, [tabActivity.isTabHidden, windowFocus.isFocused]);

  // Dynamic Session Integrity & Risk Calculation
  const integrityScore = useMemo(() => {
    let score = 100;

    // Deductions
    score -= tabActivity.switchCount * 12;
    score -= Math.floor(tabActivity.totalAwayDurationMs / 1000) * 1.5;
    score -= windowFocus.blurCount * 8;
    score -= Math.floor(windowFocus.totalBlurDurationMs / 1000) * 1.0;
    score -= fullscreen.exitCount * 20;
    score -= clipboard.pasteCount * 15;
    score -= clipboard.copyCount * 4;
    score -= shortcuts.blockedCount * 8;
    score -= systemMetrics.contextMenuCount * 3;

    // If requireFullscreen policy is active and not fullscreen, deduct 20
    if (policies.requireFullscreen && !fullscreen.isFullscreen) {
      score -= 20;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }, [
    tabActivity.switchCount,
    tabActivity.totalAwayDurationMs,
    windowFocus.blurCount,
    windowFocus.totalBlurDurationMs,
    fullscreen.exitCount,
    fullscreen.isFullscreen,
    clipboard.pasteCount,
    clipboard.copyCount,
    shortcuts.blockedCount,
    systemMetrics.contextMenuCount,
    policies.requireFullscreen,
  ]);

  const risk = useMemo(() => {
    const rawScore = 100 - integrityScore;
    let level = "Low Risk";
    let note = "Clean browser activity — window focused and steady.";

    if (
      rawScore >= 65 ||
      tabActivity.switchCount >= 3 ||
      fullscreen.exitCount >= 2 ||
      clipboard.pasteCount >= 2 ||
      shortcuts.blockedCount >= 3
    ) {
      level = "High Risk";
      note =
        tabActivity.switchCount >= 3
          ? `Repeated tab switching detected (${tabActivity.switchCount}x).`
          : fullscreen.exitCount >= 2
          ? `Multiple fullscreen exits detected (${fullscreen.exitCount}x).`
          : clipboard.pasteCount >= 2
          ? `Multiple external text paste actions detected (${clipboard.pasteCount}x).`
          : "Severe browser anomalies recorded.";
    } else if (
      rawScore >= 40 ||
      tabActivity.switchCount >= 1 ||
      windowFocus.blurCount >= 2 ||
      clipboard.pasteCount >= 1 ||
      fullscreen.exitCount >= 1
    ) {
      level = "Elevated Risk";
      note =
        tabActivity.switchCount >= 1
          ? `Candidate left examination tab (${tabActivity.switchCount}x).`
          : clipboard.pasteCount >= 1
          ? "External paste action detected."
          : fullscreen.exitCount >= 1
          ? "Candidate exited fullscreen mode."
          : `Window lost focus (${windowFocus.blurCount}x).`;
    } else if (rawScore >= 15 || windowFocus.blurCount >= 1 || clipboard.copyCount >= 1) {
      level = "Moderate Risk";
      note = "Minor browser interactions observed.";
    }

    return {
      score: rawScore,
      maxScore: 100,
      level,
      note,
    };
  }, [
    integrityScore,
    tabActivity.switchCount,
    fullscreen.exitCount,
    clipboard.pasteCount,
    clipboard.copyCount,
    shortcuts.blockedCount,
    windowFocus.blurCount,
  ]);

  const summary = useMemo(() => {
    return {
      integrityScore,
      riskLevel: risk.level,
      isClean: integrityScore >= 85,
      isFocused: windowFocus.isFocused,
      isTabVisible: !tabActivity.isTabHidden,
      isFullscreen: fullscreen.isFullscreen,
      tabSwitchCount: tabActivity.switchCount,
      blurCount: windowFocus.blurCount,
      fullscreenExitCount: fullscreen.exitCount,
      pasteCount: clipboard.pasteCount,
      copyCount: clipboard.copyCount,
      blockedShortcutsCount: shortcuts.blockedCount,
      totalEventsCount: browserEvents.length,
      currentAwayFormatted: formatDurationSec(tabActivity.currentAwayDurationMs),
      totalAwayFormatted: formatDurationSec(tabActivity.totalAwayDurationMs),
      statusText: tabActivity.isTabHidden
        ? `⚠️ Away from tab (${formatDurationSec(tabActivity.currentAwayDurationMs)})`
        : !windowFocus.isFocused
        ? `⚠️ Window unfocused (${formatDurationSec(windowFocus.currentBlurDurationMs)})`
        : fullscreen.exitCount > 0
        ? `Fullscreen exited (${fullscreen.exitCount}x)`
        : clipboard.pasteCount > 0
        ? `Paste detected (${clipboard.pasteCount}x)`
        : tabActivity.switchCount > 0
        ? `Tab switched (${tabActivity.switchCount}x)`
        : fullscreen.isFullscreen
        ? "In Focus · Fullscreen secured"
        : "In Focus · Normal window",
    };
  }, [
    integrityScore,
    risk.level,
    windowFocus.isFocused,
    windowFocus.blurCount,
    windowFocus.currentBlurDurationMs,
    tabActivity.isTabHidden,
    tabActivity.switchCount,
    tabActivity.currentAwayDurationMs,
    tabActivity.totalAwayDurationMs,
    fullscreen.isFullscreen,
    fullscreen.exitCount,
    clipboard.pasteCount,
    clipboard.copyCount,
    shortcuts.blockedCount,
    browserEvents.length,
  ]);

  return {
    tabActivity,
    windowFocus,
    fullscreen,
    clipboard,
    shortcuts,
    systemMetrics,
    browserEvents,
    integrityScore,
    risk,
    summary,
    policies,
    togglePolicy,
    enterFullscreen,
    exitFullscreen,
    clearEvents,
    alerts,
    evidenceEvents,
  };
}
