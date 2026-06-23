import {
  patientFromApi,
  patientToApi,
  patientUpdateToApi,
  rehabSessionFromApi,
  rehabSessionToApi,
  reportFromApi,
  reportDataFromApi,
  reportToApi,
  sessionFromApi,
  sessionToApi,
} from "./mappers.js";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8010/api";
export const API_WS_BASE_URL = import.meta.env.VITE_API_WS_BASE_URL ?? API_BASE_URL.replace(/^http/, "ws").replace(/\/api$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  health: () => request("/health"),
  status: () => request("/settings/status"),
  dashboardSummary: async () => {
    const [kpis, clinicTrend, statusDistribution, scoreDistribution, pathologyBreakdown, recentAssessments] = await Promise.all([
      request("/dashboard/kpis"),
      request("/dashboard/clinic-trend?weeks=12"),
      request("/dashboard/patient-status-distribution"),
      request("/dashboard/score-distribution"),
      request("/dashboard/pathology-breakdown"),
      request("/dashboard/recent-assessments?limit=8"),
    ]);
    return {
      kpis,
      clinicTrend,
      statusDistribution,
      scoreDistribution,
      pathologyBreakdown,
      recentAssessments,
    };
  },
  seedDemoData: (reset = false) => request(`/demo/seed?reset=${reset}`, { method: "POST" }),
  patients: async () => (await request("/patients")).map(patientFromApi),
  createPatient: async (patient) => patientFromApi(await request("/patients", { method: "POST", body: JSON.stringify(patientToApi(patient)) })),
  updatePatient: async (id, patient) => patientFromApi(await request(`/patients/${id}`, { method: "PATCH", body: JSON.stringify(patientUpdateToApi(patient)) })),
  deletePatient: (id) => request(`/patients/${id}`, { method: "DELETE" }),
  sessions: async (patients = []) => {
    const patientLookup = new Map(patients.map((patient) => [patient.id, patient]));
    return (await request("/sessions")).map((session) => sessionFromApi(session, patientLookup));
  },
  patientSessions: async (patientId, patients = []) => {
    const patientLookup = new Map(patients.map((patient) => [patient.id, patient]));
    return (await request(`/patients/${patientId}/sessions`)).map((session) => sessionFromApi(session, patientLookup));
  },
  patientProgress: (patientId) => request(`/patients/${patientId}/progress`),
  patientProfile: (patientId) => request(`/patients/${patientId}/profile`),
  patientSessionTrend: (patientId) => request(`/patients/${patientId}/session-trend`),
  patientRadarLatest: (patientId) => request(`/patients/${patientId}/radar-latest`),
  sessionFullResults: (sessionId) => request(`/sessions/${sessionId}/full-results`),
  sessionSwayPath: (sessionId) => request(`/sessions/${sessionId}/sway-path`),
  sessionReportData: async (sessionId) => reportDataFromApi(await request(`/sessions/${sessionId}/report-data`)),
  createSession: async (session, patients = []) => {
    const patientLookup = new Map(patients.map((patient) => [patient.id, patient]));
    return sessionFromApi(await request("/sessions", { method: "POST", body: JSON.stringify(sessionToApi(session)) }), patientLookup);
  },
  updateSession: async (sessionId, payload, patients = []) => {
    const patientLookup = new Map(patients.map((patient) => [patient.id, patient]));
    return sessionFromApi(await request(`/sessions/${sessionId}`, { method: "PATCH", body: JSON.stringify(payload) }), patientLookup);
  },
  computeSession: async (sessionId, patients = []) => {
    const patientLookup = new Map(patients.map((patient) => [patient.id, patient]));
    return sessionFromApi(await request(`/sessions/${sessionId}/compute`, { method: "POST" }), patientLookup);
  },
  appendSensorSamples: async (sessionId, samples, patients = []) => {
    const patientLookup = new Map(patients.map((patient) => [patient.id, patient]));
    return sessionFromApi(await request(`/sessions/${sessionId}/sensor-samples`, { method: "POST", body: JSON.stringify({ samples }) }), patientLookup);
  },
  movementFeatures: (sessionId) => request(`/sessions/${sessionId}/movement-features`),
  movementLabels: (sessionId) => request(`/sessions/${sessionId}/movement-labels`),
  createMovementLabel: (sessionId, label) => request(`/sessions/${sessionId}/movement-labels`, { method: "POST", body: JSON.stringify(label) }),
  movementTrainingReadiness: () => request("/ml/movement-training/readiness"),
  movementTrainingDataset: () => request("/ml/movement-training/dataset"),
  movementModelStatus: () => request("/ml/movement-training/model"),
  trainMovementModel: () => request("/ml/movement-training/train", { method: "POST" }),
  esp32Ports: () => request("/esp32/ports"),
  esp32Status: () => request("/esp32/status"),
  esp32Connect: ({ port, baudRate = 115200, sessionId = null }) => request("/esp32/connect", { method: "POST", body: JSON.stringify({ port, baud_rate: baudRate, session_id: sessionId }) }),
  esp32Disconnect: () => request("/esp32/disconnect", { method: "POST" }),
  esp32AttachSession: (sessionId = null) => request("/esp32/session", { method: "POST", body: JSON.stringify({ session_id: sessionId }) }),
  esp32Calibrate: (durationSeconds = 4) => request("/esp32/calibrate", { method: "POST", body: JSON.stringify({ duration_seconds: durationSeconds }) }),
  esp32Zero: () => request("/esp32/zero", { method: "POST" }),
  reports: async () => (await request("/reports")).map(reportFromApi),
  createReport: async (report) => reportFromApi(await request("/reports", { method: "POST", body: JSON.stringify(reportToApi(report)) })),
  rehabSessions: async (patientId = null) => {
    const path = patientId != null ? `/rehab-games?patient_id=${patientId}` : "/rehab-games";
    return (await request(path)).map(rehabSessionFromApi);
  },
  createRehabSession: async (session) => rehabSessionFromApi(
    await request("/rehab-games", { method: "POST", body: JSON.stringify(rehabSessionToApi(session)) }),
  ),
};
