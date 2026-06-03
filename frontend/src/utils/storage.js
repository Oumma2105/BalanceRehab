import { demoPatients } from "../data/demoPatients.js";
import { demoReports } from "../data/demoReports.js";
import { demoSessions } from "../data/demoSessions.js";

const STORAGE_KEY = "balancerehab_demo_state_v1";

export function createSeedState() {
  return {
    patients: seedPatients(),
    sessions: demoSessions,
    reports: demoReports,
  };
}

export function loadPersistedState() {
  if (typeof window === "undefined") {
    return createSeedState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createSeedState();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.patients) || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.reports)) {
      return createSeedState();
    }

    return {
      patients: parsed.patients,
      sessions: parsed.sessions,
      reports: parsed.reports,
    };
  } catch {
    return createSeedState();
  }
}

export function savePersistedState(state) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      patients: state.patients,
      sessions: state.sessions,
      reports: state.reports,
      savedAt: new Date().toISOString(),
    }),
  );
}

export function resetPersistedState() {
  const seed = createSeedState();
  savePersistedState(seed);
  return seed;
}

function seedPatients() {
  return demoPatients.map((patient) => {
    const patientSessions = demoSessions.filter((session) => session.patientId === patient.id);
    const latestSession = patientSessions[0];
    const oldestSession = patientSessions[patientSessions.length - 1];

    if (!latestSession) return patient;

    return {
      ...patient,
      latestScore: latestSession.totalScore,
      lastAssessmentDate: latestSession.dateISO,
      status: latestSession.status,
      improvement: oldestSession ? latestSession.totalScore - oldestSession.totalScore : patient.improvement,
    };
  });
}
