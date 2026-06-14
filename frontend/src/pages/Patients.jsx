import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Edit, FileText, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "../components/clinical/Button";
import { ClinicalCard } from "../components/clinical/ClinicalCard";
import { ClinicalTable } from "../components/clinical/ClinicalTable";
import { EmptyState } from "../components/clinical/EmptyState";
import { SectionHeader } from "../components/clinical/SectionHeader";
import { StatusBadge } from "../components/clinical/StatusBadge";
import { clinicalGoals, pathologyOptions } from "../data/demoPatients.js";
import { downloadSessionReport } from "../utils/report";

const emptyForm = {
  fullName: "",
  age: "",
  sex: "Female",
  pathology: "",
  heightCm: "",
  weightKg: "",
  dominantSide: "",
  clinicalGoal: "",
  clinicalNotes: "",
};

const statusTone = {
  Stable: "active",
  Improving: "connected",
  "Follow-up": "warning",
  Declining: "danger",
};

export function PatientsPage({
  t,
  patients,
  sessions,
  reports,
  onAddPatient,
  onUpdatePatient,
  onDeletePatient,
  onStartAssessment,
  addRequest,
  profileRequest,
  onProfileRequestHandled,
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  const [createdPatient, setCreatedPatient] = useState(null);
  const [requestedProfileTab, setRequestedProfileTab] = useState("overview");

  useEffect(() => {
    if (addRequest) {
      setEditingPatient(null);
      setFormOpen(true);
    }
  }, [addRequest]);

  useEffect(() => {
    if (profileRequest?.patientId) {
      setSelectedId(profileRequest.patientId);
      setRequestedProfileTab(profileRequest.tab ?? "overview");
      setFormOpen(false);
      setEditingPatient(null);
      setCreatedPatient(null);
      onProfileRequestHandled();
    }
  }, [profileRequest, onProfileRequestHandled]);

  const selectedPatient = patients.find((patient) => patient.id === selectedId);
  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return patients;
    return patients.filter((patient) =>
      [patient.fullName, patient.patientCode].join(" ").toLowerCase().includes(normalized),
    );
  }, [patients, query]);

  if (selectedPatient) {
    return (
      <PatientDetail
        t={t}
        patient={selectedPatient}
        requestedTab={requestedProfileTab}
        sessions={sessions.filter((session) => session.patientId === selectedPatient.id)}
        reports={reports.filter((report) => report.patientId === selectedPatient.id)}
        onBack={() => setSelectedId(null)}
        onEdit={() => {
          setEditingPatient(selectedPatient);
          setFormOpen(true);
        }}
        onDelete={() => {
          onDeletePatient(selectedPatient.id);
          setSelectedId(null);
        }}
        onStartAssessment={() => onStartAssessment(selectedPatient.id)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-rehab-ink">Patients</h1>
          <p className="mt-2 text-sm text-rehab-muted">{t.searchAddOpenPatients}</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus size={17} /> {t.addPatient}
        </Button>
      </section>

      <ClinicalCard className="p-5">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-rehab-muted" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.searchPatientNameId}
            className="w-full rounded-lg border border-rehab-line bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-rehab-teal"
          />
        </div>

        <div className="mt-5">
          {filteredPatients.length === 0 ? (
            <EmptyState
              title={t.startByCreatingPatient}
              description={t.patientRecordsAppear}
              actionLabel={t.addPatient}
              onAction={() => setFormOpen(true)}
            />
          ) : (
            <ClinicalTable
              columns={[t.patient, t.pathology, t.latestScore, t.lastAssessment, t.status, t.action]}
              rows={filteredPatients}
              renderRow={(patient) => (
                <tr key={patient.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setSelectedId(patient.id)} className="text-left">
                      <p className="font-semibold text-rehab-ink">{patient.fullName}</p>
                      <p className="text-xs text-rehab-muted">{patient.patientCode}</p>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-rehab-muted">{patient.pathology || "-"}</td>
                  <td className="px-4 py-3 font-semibold">{patient.latestScore ? `${patient.latestScore}/100` : "-"}</td>
                  <td className="px-4 py-3 text-rehab-muted">{patient.lastAssessmentDate ?? "-"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={statusTone[patient.status] ?? "neutral"}>{patient.status ?? t.noSessions}</StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="secondary" className="px-3 py-1.5" onClick={() => setSelectedId(patient.id)}>
                      {t.viewProfile}
                    </Button>
                  </td>
                </tr>
              )}
            />
          )}
        </div>
      </ClinicalCard>

      {formOpen ? (
        <PatientFormModal
          patient={editingPatient}
          t={t}
          onClose={() => {
            setFormOpen(false);
            setEditingPatient(null);
            setCreatedPatient(null);
          }}
          onSubmit={async (payload) => {
            if (editingPatient) {
              await onUpdatePatient(editingPatient.id, payload);
              setFormOpen(false);
              setEditingPatient(null);
            } else {
              const newPatient = await onAddPatient(payload);
              setCreatedPatient(newPatient);
            }
          }}
          onStartAssessment={(patient) => {
            setFormOpen(false);
            setEditingPatient(null);
            setCreatedPatient(null);
            onStartAssessment(patient.id);
          }}
          onViewProfile={(patient) => {
            setFormOpen(false);
            setEditingPatient(null);
            setCreatedPatient(null);
            setSelectedId(patient.id);
          }}
          onReturnToList={() => {
            setFormOpen(false);
            setEditingPatient(null);
            setCreatedPatient(null);
          }}
          createdPatient={createdPatient}
        />
      ) : null}
    </div>
  );
}

function PatientDetail({ t, patient, requestedTab, sessions, reports, onBack, onEdit, onDelete, onStartAssessment }) {
  const [tab, setTab] = useState("overview");
  const latestSession = sessions[0];
  const tabs = ["overview", "sessions", "reports"];

  useEffect(() => {
    if (tabs.includes(requestedTab)) {
      setTab(requestedTab);
    }
  }, [requestedTab]);

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-rehab-blue">
        <ArrowLeft size={16} /> {t.backToPatients}
      </button>

      <ClinicalCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-rehab-teal">{patient.patientCode}</p>
            <h1 className="mt-1 text-3xl font-semibold text-rehab-ink">{patient.fullName}</h1>
            <p className="mt-2 text-sm text-rehab-muted">
              {patient.age} years - {displaySex(patient.sex)} - {patient.pathology || t.noSessions}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="px-6 py-3 text-base" onClick={onStartAssessment}>{t.newAssessment}</Button>
            <Button variant="secondary" onClick={onEdit}>
              <Edit size={16} /> {t.edit}
            </Button>
            <Button variant="secondary" onClick={onDelete}>
              <Trash2 size={16} /> {t.delete}
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-rehab-line pt-4">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize ${
                tab === item ? "bg-rehab-teal text-white" : "bg-slate-100 text-rehab-muted"
              }`}
            >
              {t[item] ?? item}
            </button>
          ))}
        </div>
      </ClinicalCard>

      {tab === "overview" ? (
        <ClinicalCard className="p-5">
          <SectionHeader title={t.overview} description={t.currentPatientStatus} />
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <PatientInfoPanel t={t} patient={patient} />
            <ClinicalInfoPanel t={t} patient={patient} />
          </div>
          {sessions.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title={t.noAssessmentsYet}
                description={t.firstAssessmentBaseline}
                actionLabel={t.startFirstAssessment}
                onAction={onStartAssessment}
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Summary label={t.currentBalanceScore} value={`${latestSession.totalScore}/100`} />
              <Summary label={t.lastTest} value={`${latestSession.testType} - ${latestSession.condition}`} />
              <Summary label={t.recommendationCount} value={latestSession.results.recommendations.length} />
              <div className="rounded-lg border border-rehab-line p-4 md:col-span-3">
                <p className="font-semibold">{t.latestRecommendations}</p>
                <ul className="mt-2 space-y-1 text-sm text-rehab-muted">
                  {latestSession.results.recommendations.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="md:col-span-3 rounded-lg bg-slate-50 p-4 text-sm text-rehab-muted">
                <p className="mb-2 font-semibold text-rehab-ink">{t.lastAssessmentSummary}</p>
                {latestSession.results.interpretation}
              </div>
            </div>
          )}
        </ClinicalCard>
      ) : null}

      {tab === "sessions" ? (
        <SessionsPanel t={t} patient={patient} sessions={sessions} />
      ) : null}

      {tab === "reports" ? (
        <ClinicalCard className="p-5">
          <SectionHeader title={t.reports} description={t.generatedPdfReports} />
          <div className="mt-5 grid gap-3">
            {reports.length === 0 ? (
              <EmptyState
                title={t.reports}
                description={t.completedSessionsAppear}
                actionLabel={t.startFirstAssessment}
                onAction={onStartAssessment}
              />
            ) : reports.map((report) => {
              const session = sessions.find((item) => item.id === report.sessionId);
              return (
                <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rehab-line p-4">
                  <div className="flex items-start gap-3">
                    <FileText size={18} className="text-rehab-blue" />
                    <div>
                      <p className="font-semibold">{report.reportId ?? report.id}</p>
                      <p className="text-sm text-rehab-muted">{report.generatedAt ?? report.createdAt ?? "-"}</p>
                      <p className="mt-1 text-sm text-rehab-muted">{report.acquisitionMode ?? session?.acquisitionMode ?? "-"}</p>
                      <p className="mt-1 max-w-2xl text-sm text-rehab-ink">{report.summary ?? "-"}</p>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => session && downloadSessionReport({ patient, session, t })} disabled={!session}>
                    Download
                  </Button>
                </div>
              );
            })}
          </div>
        </ClinicalCard>
      ) : null}
    </div>
  );
}

function SessionsPanel({ t, patient, sessions }) {
  return (
    <ClinicalCard className="p-5">
      <SectionHeader title={t.sessions} description={t.previousAssessments} />
      <div className="mt-5">
        {sessions.length === 0 ? (
          <EmptyState title={t.noAssessmentsYet} description={t.performFirstAssessment} />
        ) : (
          <>
            <ClinicalTable
              columns={[t.date, t.test, t.conditions, t.score, t.status, t.action]}
              rows={sessions}
              renderRow={(session) => (
                <tr key={session.id}>
                  <td className="px-4 py-3 text-rehab-muted">{session.date}</td>
                  <td className="px-4 py-3">{session.testType}</td>
                  <td className="px-4 py-3">{session.condition}</td>
                  <td className="px-4 py-3 font-semibold">{session.totalScore}/100</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={statusTone[session.status] ?? "neutral"}>{session.status}</StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="secondary" className="px-3 py-1.5" onClick={() => downloadSessionReport({ patient, session, t })}>
                      Download Report
                    </Button>
                  </td>
                </tr>
              )}
            />
          </>
        )}
      </div>
    </ClinicalCard>
  );
}

function PatientInfoPanel({ t, patient }) {
  return (
    <div className="rounded-lg border border-rehab-line p-4">
      <p className="font-semibold text-rehab-ink">{t.patientInformation}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <InfoItem label={t.patientDetails} value={patient.patientCode} />
        <InfoItem label={t.age} value={patient.age ? `${patient.age} ${t.years}` : "-"} />
        <InfoItem label={t.sex} value={displaySex(patient.sex)} />
        <InfoItem label={t.dominantSide} value={patient.dominantSide ?? "-"} />
        <InfoItem label={t.heightCm} value={patient.heightCm ? `${patient.heightCm} cm` : "-"} />
        <InfoItem label={t.weightKg} value={patient.weightKg ? `${patient.weightKg} kg` : "-"} />
      </div>
    </div>
  );
}

function ClinicalInfoPanel({ t, patient }) {
  return (
    <div className="rounded-lg border border-rehab-line p-4">
      <p className="font-semibold text-rehab-ink">{t.clinicalProfile}</p>
      <div className="mt-4 grid gap-3">
        <InfoItem label={t.medicalReason} value={patient.pathology || "-"} />
        <InfoItem label={t.clinicalGoal} value={patient.clinicalGoal || "-"} />
        <InfoItem label={t.clinicalNotes} value={patient.clinicalNotes || patient.notes || "-"} />
      </div>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-rehab-ink">{value}</p>
    </div>
  );
}

function PatientFormModal({ t, patient, onClose, onSubmit, createdPatient, onStartAssessment, onViewProfile, onReturnToList }) {
  const [form, setForm] = useState(() => normalizePatientForm(patient ?? emptyForm));
  const isValid = isPatientFormValid(form);

  if (createdPatient) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
          <p className="text-sm font-semibold text-rehab-teal">{createdPatient.patientCode}</p>
          <h2 className="mt-2 text-xl font-semibold">{t.patientCreated}</h2>
          <p className="mt-2 text-sm text-rehab-muted">{createdPatient.fullName}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="subtle" onClick={onReturnToList}>
              {t.returnPatientList}
            </Button>
            <Button variant="secondary" onClick={() => onViewProfile(createdPatient)}>
              {t.viewProfile}
            </Button>
            <Button onClick={() => onStartAssessment(createdPatient)}>
              {t.startFirstAssessmentAction}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-xl font-semibold">{patient ? t.editPatient : t.addPatient}</h2>
        {!patient ? <p className="mt-2 text-sm text-rehab-muted">{t.patientIdAuto}</p> : null}
        <p className="mt-1 text-xs text-rehab-muted">{t.requiredFieldsHint}</p>

        <FormGroup title={t.identity}>
          <Input label={t.fullName} value={form.fullName} onChange={(fullName) => setForm({ ...form, fullName })} required />
          <AgeInput value={form.age} onChange={(age) => setForm({ ...form, age })} label={t.age} required />
          <SelectField
            label={t.sex}
            value={form.sex}
            onChange={(sex) => setForm({ ...form, sex })}
            options={["Female", "Male"]}
            required
          />
        </FormGroup>

        <FormGroup title={t.clinicalProfile}>
          <ComboboxInput
            label={t.medicalReason}
            value={form.pathology}
            options={pathologyOptions}
            placeholder={t.pathologyPlaceholder}
            onChange={(pathology) => setForm({ ...form, pathology })}
            required
            listId="pathology-options"
          />
          <ComboboxInput
            label={t.clinicalGoal}
            value={form.clinicalGoal}
            options={clinicalGoals}
            placeholder={t.clinicalGoalPlaceholder}
            onChange={(clinicalGoal) => setForm({ ...form, clinicalGoal })}
            listId="clinical-goal-options"
          />
          <SelectField
            label={t.dominantSide}
            value={form.dominantSide}
            onChange={(dominantSide) => setForm({ ...form, dominantSide })}
            options={["", "Left", "Right"]}
            emptyLabel={t.notSpecified}
          />
        </FormGroup>

        <FormGroup title={t.bodyMeasurements}>
          <NumberInput label={t.heightCm} value={form.heightCm} min={50} max={240} onChange={(heightCm) => setForm({ ...form, heightCm })} />
          <NumberInput label={t.weightKg} value={form.weightKg} min={2} max={250} onChange={(weightKg) => setForm({ ...form, weightKg })} />
        </FormGroup>

        <div className="mt-5">
          <label className="text-sm font-semibold">
            {t.clinicalNotes}
            <textarea
              value={form.clinicalNotes ?? ""}
              placeholder={t.clinicalNotesPlaceholder}
              onChange={(event) => setForm({ ...form, clinicalNotes: event.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-rehab-line px-3 py-2 font-normal outline-none focus:border-rehab-teal"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button onClick={() => onSubmit(preparePatientPayload(form))} disabled={!isValid}>
            {t.savePatient}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, placeholder, onChange }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-rehab-line px-3 py-2 font-normal outline-none focus:border-rehab-teal"
      />
    </label>
  );
}

function FormGroup({ title, children }) {
  return (
    <section className="mt-5">
      <p className="mb-3 text-sm font-semibold text-rehab-ink">{title}</p>
      <div className="grid gap-3 md:grid-cols-3">{children}</div>
    </section>
  );
}

function AgeInput({ label, value, onChange }) {
  return (
    <NumberInput
      label={label}
      value={value}
      min={1}
      max={120}
      onChange={onChange}
    />
  );
}

function NumberInput({ label, value, min, max, onChange }) {
  const update = (nextValue) => {
    if (nextValue === "") {
      onChange("");
      return;
    }

    const numeric = Number(nextValue);
    if (!Number.isFinite(numeric)) return;
    onChange(String(Math.min(max, Math.max(min, Math.round(numeric)))));
  };

  return (
    <label className="text-sm font-semibold">
      {label}
      <div className="mt-1 flex overflow-hidden rounded-lg border border-rehab-line bg-white focus-within:border-rehab-teal">
        <button
          type="button"
          className="px-3 text-rehab-muted hover:bg-slate-50"
          onClick={() => update(value === "" ? min : Number(value) - 1)}
          aria-label={`Decrease ${label}`}
        >
          -
        </button>
        <input
          type="number"
          min={min}
          max={max}
          step="1"
          value={value ?? ""}
          onChange={(event) => update(event.target.value)}
          onBlur={(event) => update(event.target.value)}
          className="min-w-0 flex-1 border-x border-rehab-line px-3 py-2 text-center font-normal outline-none"
        />
        <button
          type="button"
          className="px-3 text-rehab-muted hover:bg-slate-50"
          onClick={() => update(value === "" ? min : Number(value) + 1)}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </label>
  );
}

function SelectField({ label, value, onChange, options, emptyLabel }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-rehab-line px-3 py-2 font-normal outline-none focus:border-rehab-teal"
      >
        {options.map((option) => (
          <option key={option || "empty"} value={option}>
            {option || emptyLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function ComboboxInput({ label, value, options, placeholder, onChange, listId }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input
        list={listId}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-rehab-line px-3 py-2 font-normal outline-none focus:border-rehab-teal"
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  );
}

function normalizePatientForm(patient) {
  return {
    ...emptyForm,
    ...patient,
    age: patient.age ? String(patient.age) : "",
    sex: patient.sex === "F" ? "Female" : patient.sex === "M" ? "Male" : patient.sex || "Female",
    heightCm: patient.heightCm ? String(patient.heightCm) : "",
    weightKg: patient.weightKg ? String(patient.weightKg) : "",
    clinicalNotes: patient.clinicalNotes ?? patient.notes ?? "",
  };
}

function isPatientFormValid(form) {
  const age = Number(form.age);
  return Boolean(
    form.fullName?.trim() &&
      Number.isInteger(age) &&
      age >= 1 &&
      age <= 120 &&
      ["Female", "Male"].includes(form.sex) &&
      form.pathology?.trim(),
  );
}

function optionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function displaySex(sex) {
  if (sex === "F") return "Female";
  if (sex === "M") return "Male";
  return sex || "-";
}

function preparePatientPayload(form) {
  const payload = {
    ...form,
    fullName: form.fullName.trim(),
    age: Number(form.age),
    sex: form.sex,
    pathology: form.pathology.trim(),
    heightCm: optionalNumber(form.heightCm),
    weightKg: optionalNumber(form.weightKg),
    dominantSide: form.dominantSide || null,
    clinicalGoal: form.clinicalGoal?.trim() || null,
    clinicalNotes: form.clinicalNotes?.trim() || "",
  };

  return {
    ...payload,
    notes: payload.clinicalNotes,
  };
}

function Summary({ label, value }) {
  return (
    <div className="rounded-lg border border-rehab-line p-4">
      <p className="text-sm text-rehab-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
