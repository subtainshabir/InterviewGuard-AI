export const mockSession = {
  candidate: "Awaiting candidate",
  sessionId: "—",
  duration: "00:00:00",
  monitoringStatus: "Ready",
  startTime: "—",
};

export const mockRisk = {
  score: 0,
  maxScore: 100,
  level: "Low Risk",
  note: "No signals evaluated yet.",
};

export const mockStatusCards = [
  { key: "face", label: "Face", state: "ready", description: "Face detection idle" },
  { key: "gaze", label: "Gaze", state: "waiting", description: "Gaze tracking idle" },
  { key: "headPose", label: "Head Pose", state: "ready", description: "Head pose idle" },
  { key: "audio", label: "Audio", state: "offline", description: "Microphone not connected" },
  { key: "objects", label: "Objects", state: "waiting", description: "Object detection idle" },
  { key: "system", label: "System Activity", state: "ready", description: "Browser activity idle" },
];

export const mockAlerts = [];

export const mockDetections = {
  objects: [],
  people: [],
};

export const mockEvidenceEvents = [];