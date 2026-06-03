import { StatusBadge } from "./StatusBadge";

export function ContextStrip({ patient, status, step, nextAction }) {
  if (!patient && !status && !step) {
    return null;
  }

  return (
    <div className="mb-5 grid gap-3 rounded-lg border border-rehab-line bg-white p-3 shadow-sm md:grid-cols-4">
      <ContextItem label="Current patient" value={patient ? `${patient.fullName} / ${patient.patientCode}` : "No patient selected"} />
      <ContextItem label="Assessment status" value={status ?? "Not started"} />
      <ContextItem label="Workflow step" value={step ?? "Outside workflow"} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">Next action</p>
        <div className="mt-1">
          <StatusBadge tone="demo">{nextAction ?? "Choose a workflow"}</StatusBadge>
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
