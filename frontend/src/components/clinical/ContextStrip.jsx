import { StatusBadge } from "./StatusBadge";

export function ContextStrip({ t, patient, status, step, nextAction }) {
  if (!patient && !status && !step) {
    return null;
  }

  return (
    <div className="mb-5 grid gap-3 rounded-lg border border-rehab-line bg-white p-3 shadow-sm md:grid-cols-4">
      <ContextItem label={t.currentPatient ?? t.patient} value={patient ? `${patient.fullName} / ${patient.patientCode}` : t.noPatientSelected} />
      <ContextItem label={t.assessmentStatus} value={status ?? t.notStarted} />
      <ContextItem label={t.workflowStep} value={step ?? t.outsideWorkflow} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{t.commonUi.nextAction}</p>
        <div className="mt-1">
          <StatusBadge tone="demo">{nextAction ?? t.chooseWorkflow}</StatusBadge>
        </div>
      </div>
    </div>
  );
}

function ContextItem({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-rehab-ink">{value}</p>
    </div>
  );
}
