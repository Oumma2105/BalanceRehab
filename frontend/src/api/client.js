import {
  patientFromApi,
  patientToApi,
  patientUpdateToApi,
  reportFromApi,
  reportDataFromApi,
  reportToApi,
  sessionFromApi,
  sessionToApi,
} from "./mappers.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8010/api";

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
  dashboardSummary: () => request("/dashboard/summary"),
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
  sessionReportData: async (sessionId) => reportDataFromApi(await request(`/sessions/${sessionId}/report-data`)),
  createSession: async (session, patients = []) => {
    const patientLookup = new Map(patients.map((patient) => [patient.id, patient]));
    return sessionFromApi(await request("/sessions", { method: "POST", body: JSON.stringify(sessionToApi(session)) }), patientLookup);
  },
  computeSession: async (sessionId, patients = []) => {
    const patientLookup = new Map(patients.map((patient) => [patient.id, patient]));
    return sessionFromApi(await request(`/sessions/${sessionId}/compute`, { method: "POST" }), patientLookup);
  },
  reports: async () => (await request("/reports")).map(reportFromApi),
  createReport: async (report) => reportFromApi(await request("/reports", { method: "POST", body: JSON.stringify(reportToApi(report)) })),
};
