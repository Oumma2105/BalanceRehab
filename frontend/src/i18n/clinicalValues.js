// Shared translation of clinical DATA VALUES (pathologies, statuses, test types…).
// UI labels live directly in the locale files; these helpers cover strings that
// arrive from the database/demo data in English and must render localized.
export function clinicalValue(t, group, value) {
  if (value == null || value === "") return "-";
  const map = t?.clinicalTerms?.[group];
  if (!map) return String(value);
  const raw = String(value);
  return map[raw] ?? map[raw.toLowerCase()] ?? map[raw.toLowerCase().replaceAll(" ", "_")] ?? raw;
}

export const pathologyLabel = (t, value) => clinicalValue(t, "pathologies", value);
export const goalLabel = (t, value) => clinicalValue(t, "goals", value);
export const testTypeLabel = (t, value) => clinicalValue(t, "testTypes", value);
export const conditionLabel = (t, value) => clinicalValue(t, "visualConditions", value);
export const riskLevelLabel = (t, value) => clinicalValue(t, "risk", value);
export const sideLabel = (t, value) => clinicalValue(t, "sides", value);
export const gameLabel = (t, value) => clinicalValue(t, "games", value);
export const sessionStateLabel = (t, value) => clinicalValue(t, "sessionStates", value);

export function statusLabel(t, status) {
  const map = {
    Stable: t?.statusStable,
    Improving: t?.statusImproving,
    "Follow-up": t?.statusFollowUp,
    Declining: t?.statusDeclining,
    "No sessions": t?.statusNoSessions,
  };
  return map[status] ?? status ?? t?.statusNoSessions ?? "-";
}
