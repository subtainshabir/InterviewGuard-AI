const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export function fetchHealth() {
  return request("/health");
}

export function createCandidate(payload) {
  return request("/candidates", { method: "POST", body: JSON.stringify(payload) });
}

export function createInterview(payload) {
  return request("/interviews", { method: "POST", body: JSON.stringify(payload) });
}

export function getInterview(sessionId) {
  return request(`/interviews/${sessionId}`);
}

export function startInterview(sessionId) {
  return request(`/interviews/${sessionId}/start`, { method: "POST" });
}

export function pauseInterview(sessionId) {
  return request(`/interviews/${sessionId}/pause`, { method: "POST" });
}

export function resumeInterview(sessionId) {
  return request(`/interviews/${sessionId}/resume`, { method: "POST" });
}

export function endInterview(sessionId) {
  return request(`/interviews/${sessionId}/end`, { method: "POST" });
}