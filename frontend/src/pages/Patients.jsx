import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowLeft, ClipboardList, Edit, FileText, Plus, Search, Target, Trash2, UsersRound } from "lucide-react";

import { Button } from "../components/clinical/Button";
import { ClinicalCard } from "../components/clinical/ClinicalCard";
import { ClinicalTable } from "../components/clinical/ClinicalTable";
import { EmptyState } from "../components/clinical/EmptyState";
import { SectionHeader } from "../components/clinical/SectionHeader";
import { StatusBadge } from "../components/clinical/StatusBadge";
import { clinicalGoals, pathologyOptions } from "../data/demoPatients.js";

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
  onLoadPatientSessions,
  onDownloadSessionReport,
  addRequest,
  onAddRequestHandled,
  profileRequest,
  onProfileRequestHandled,
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  const [createdPatient, setCreatedPatient] = useState(null);
  const [requestedProfileTab, setRequestedProfileTab] = useState("overview");

  useEffect(() => {
    if (addRequest) {
      setEditingPatient(null);
      setFormOpen(true);
      onAddRequestHandled?.();
    }
  }, [addRequest, onAddRequestHandled]);

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

  useEffect(() => {
    if (selectedId && onLoadPatientSessions) {
      onLoadPatientSessions(selectedId);
    }
  }, [selectedId, onLoadPatientSessions]);

  const selectedPatient = patients.find((patient) => patient.id === selectedId);
  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let list = statusFilter !== "all" ? patients.filter((p) => p.status === statusFilter) : patients;
    if (!normalized) return list;
    return list.filter((patient) =>
      [patient.fullName, patient.patientCode].join(" ").toLowerCase().includes(normalized),
    );
  }, [patients, query, statusFilter]);
  const activePatients = patients.filter((patient) => patient.status !== "No sessions").length;
  const followUpPatients = patients.filter((patient) => patient.status === "Follow-up" || patient.status === "Declining" || Number(patient.latestScore) < 70).length;
  const averageScore = averageScoreValue(patients.map((patient) => patient.latestScore));

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
        onDownloadSessionReport={onDownloadSessionReport}
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-rehab-muted">{t.searchAddOpenPatients}</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus size={17} /> {t.addPatient}
        </Button>
      </section>

      {/* KPI strip */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PatientKpi icon={UsersRound} label={t.totalPatients} value={patients.length} helper={t.patientsInProgram ?? "in program"} color="#277DA1" />
        <PatientKpi icon={Activity} label={t.activePatients} value={activePatients} helper={t.withRecentActivity ?? "with recent activity"} color="#43AA8B" />
        <PatientKpi icon={AlertTriangle} label={t.followUpQueue} value={followUpPatients} helper={t.patientsToReview ?? "need review"} color="#F8961E" />
        <PatientKpi icon={Target} label={t.averageScore} value={averageScore ? `${averageScore}/100` : "-"} helper={t.acrossAllPatients ?? "across all patients"} color="#90BE6D" />
      </section>

      <ClinicalCard className="p-5">
        {/* Search + filter row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-rehab-muted" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.searchPatientNameId}
              className="w-full rounded-lg border border-rehab-line bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-rehab-teal focus:ring-2 focus:ring-rehab-teal/10"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["all", "Stable", "Improving", "Follow-up", "Declining"].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  statusFilter === f
                    ? "text-white shadow-sm"
                    : "bg-slate-100 text-rehab-muted hover:bg-slate-200"
                }`}
                style={statusFilter === f ? { backgroundColor: filterPillColor(f) } : {}}
              >
                {f === "all" ? (t.all ?? "All") : statusLabel(t, f)}
              </button>
            ))}
          </div>
        </div>

        {/* Patient card grid */}
        <div className="mt-5">
          {filteredPatients.length === 0 ? (
            <EmptyState
              title={t.startByCreatingPatient}
              description={t.patientRecordsAppear}
              actionLabel={t.addPatient}
              onAction={() => setFormOpen(true)}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredPatients.map((patient) => {
                const sc = statusColor(patient);
                return (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => setSelectedId(patient.id)}
                    className="group relative flex items-start gap-4 overflow-hidden rounded-xl border border-rehab-line bg-white p-4 text-left shadow-card transition hover:border-rehab-teal/40 hover:shadow-md"
                  >
                    {/* Status accent strip */}
                    <span className="absolute inset-y-0 left-0 w-1 rounded-l-xl" style={{ backgroundColor: sc }} />
                    {/* Avatar */}
                    <span
                      className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
                      style={{ backgroundColor: sc }}
                    >
                      {initials(patient.fullName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-rehab-ink">{patient.fullName}</p>
                          <p className="text-xs text-rehab-muted">{patient.patientCode}</p>
                        </div>
                        <StatusBadge tone={statusTone[patient.status] ?? "neutral"}>
                          {statusLabel(t, patient.status)}
                        </StatusBadge>
                      </div>
                      <p className="mt-1.5 truncate text-xs text-rehab-muted">{patient.pathology || "-"}</p>
                      {patient.latestScore != null ? (
                        <div className="mt-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-rehab-ink">{patient.latestScore}/100</span>
                            <span className="text-xs text-rehab-muted">{patient.lastAssessmentDate ?? "-"}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, Number(patient.latestScore)))}%`, backgroundColor: sc }}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-rehab-muted">{t.noSessionsYet ?? "No assessments yet"}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
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

function PatientDetail({ t, patient, requestedTab, sessions, reports, onBack, onEdit, onDelete, onStartAssessment, onDownloadSessionReport }) {
  const [tab, setTab] = useState("overview");
  const latestSession = sessions[0];
  const tabs = ["overview", "sessions", "progress", "reports"];

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
              {patient.age} {t.years} - {displaySex(patient.sex)} - {patient.pathology || t.noSessions}
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
              <Summary label={t.lastTest} value={`${testTypeLabel(t, latestSession.testType)} - ${conditionLabel(t, latestSession.condition)}`} />
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
        <SessionsPanel t={t} patient={patient} sessions={sessions} onDownloadSessionReport={onDownloadSessionReport} />
      ) : null}

      {tab === "progress" ? (
        <ProgressPanel t={t} patient={patient} sessions={sessions} onStartAssessment={onStartAssessment} />
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
                      <p className="mt-1 text-sm text-rehab-muted">{acquisitionModeLabel(t, report.acquisitionModeKey ?? session?.acquisitionModeKey, report.acquisitionMode ?? session?.acquisitionMode)}</p>
                      <p className="mt-1 max-w-2xl text-sm text-rehab-ink">{report.summary ?? "-"}</p>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => session && onDownloadSessionReport({ patient, session })} disabled={!session}>
                    {t.download}
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

function ProgressPanel({ t, patient, sessions, onStartAssessment }) {
  const chronological = [...sessions].reverse();
  const first = chronological[0];
  const latest = chronological[chronological.length - 1];
  const scoreChange = first && latest ? Number(latest.totalScore) - Number(first.totalScore) : 0;
  const staticScores = sessions.filter((session) => session.testType === "Static").map((session) => session.totalScore);
  const dynamicScores = sessions.filter((session) => session.testType === "Dynamic").map((session) => session.totalScore);
  const bestSession = sessions.reduce((best, session) => (!best || Number(session.totalScore) > Number(best.totalScore) ? session : best), null);

  return (
    <ClinicalCard className="p-5">
      <SectionHeader title={t.progress} description={t.scoreEvolutionDesc} />
      {sessions.length < 2 ? (
        <div className="mt-5">
          <EmptyState
            title={t.progressTrendsPendingTitle}
            description={t.progressTrendsPendingDesc}
            actionLabel={sessions.length === 0 ? t.startFirstAssessment : t.newAssessment}
            onAction={onStartAssessment}
          />
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <Summary label={t.sessionsSaved} value={sessions.length} />
            <Summary label={t.scoreChange} value={`${scoreChange >= 0 ? "+" : ""}${scoreChange} pts`} />
            <Summary label={t.latestScore} value={`${latest.totalScore}/100`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
            <div className="rounded-xl border border-rehab-line bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-rehab-ink">{t.scoreEvolution}</p>
                  <p className="mt-1 text-sm text-rehab-muted">{t.savedAssessmentsFor} {patient.fullName}</p>
                </div>
                <StatusBadge tone={scoreChange > 2 ? "connected" : scoreChange < -2 ? "danger" : "neutral"}>
                  {scoreChange > 2 ? t.improved : scoreChange < -2 ? t.worsened : t.remainedStable}
                </StatusBadge>
              </div>
              <div className="mt-5 flex h-32 items-end gap-2 rounded-lg bg-slate-50 p-3">
                {chronological.map((session, index) => {
                  const score = Math.max(0, Math.min(100, Number(session.totalScore) || 0));
                  const color = score >= 80 ? "#43AA8B" : score >= 70 ? "#F9C74F" : score >= 60 ? "#F8961E" : "#F94144";
                  return (
                    <div key={session.id} className="flex min-w-8 flex-1 flex-col items-center gap-2">
                      <div className="flex h-24 w-full items-end">
                        <div className="w-full rounded-t-md transition" style={{ height: `${score}%`, backgroundColor: color }} />
                      </div>
                      <span className="text-xs font-semibold text-rehab-muted">S{index + 1}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-rehab-line bg-slate-50 p-4">
              <p className="font-semibold text-rehab-ink">{t.staticVsDynamic}</p>
              <p className="mt-1 text-sm text-rehab-muted">{t.averageScoreByTestType}</p>
              <div className="mt-4 space-y-4">
                <ProgressAverage label={t.staticTest} value={averageScoreValue(staticScores)} color="#43AA8B" />
                <ProgressAverage label={t.dynamicTest} value={averageScoreValue(dynamicScores)} color="#F8961E" />
              </div>
              {bestSession ? (
                <div className="mt-5 rounded-lg bg-white p-3 text-sm">
                  <p className="font-semibold text-rehab-ink">{t.bestSession ?? "Best session"}</p>
                  <p className="mt-1 text-rehab-muted">
                    {bestSession.date} - {bestSession.totalScore}/100
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </ClinicalCard>
  );
}

function SessionsPanel({ t, patient, sessions, onDownloadSessionReport }) {
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
                  <td className="px-4 py-3">{testTypeLabel(t, session.testType)}</td>
                  <td className="px-4 py-3">{conditionLabel(t, session.condition)}</td>
                  <td className="px-4 py-3 font-semibold">{session.totalScore}/100</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={statusTone[session.status] ?? "neutral"}>{statusLabel(t, session.status)}</StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="secondary" className="px-3 py-1.5" onClick={() => onDownloadSessionReport({ patient, session })}>
                      {t.downloadReport}
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

function ProgressAverage({ label, value, color }) {
  const score = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-rehab-ink">{label}</span>
        <span className="font-semibold text-rehab-muted">{value ? `${value}/100` : "-"}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
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
        <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
          <div className="bg-gradient-to-r from-teal-50 to-blue-50 p-5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-rehab-teal text-white">
              <ClipboardList size={22} />
            </div>
            <p className="mt-4 text-sm font-semibold text-rehab-teal">{createdPatient.patientCode}</p>
            <h2 className="mt-1 text-2xl font-semibold text-rehab-ink">{t.patientCreated}</h2>
            <p className="mt-2 text-sm text-rehab-muted">{createdPatient.fullName}</p>
          </div>
          <div className="p-5">
            <div className="rounded-lg border border-rehab-line bg-slate-50 p-3 text-sm text-rehab-muted">
              <span className="font-semibold text-rehab-ink">{createdPatient.pathology}</span>
              {createdPatient.clinicalGoal ? ` - ${createdPatient.clinicalGoal}` : ""}
            </div>
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
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="border-b border-rehab-line bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-rehab-teal">{t.clinicalProfile}</p>
          <h2 className="mt-1 text-2xl font-semibold text-rehab-ink">{patient ? t.editPatient : t.addPatient}</h2>
          {!patient ? <p className="mt-2 text-sm text-rehab-muted">{t.patientIdAuto}</p> : null}
          <p className="mt-1 text-xs text-rehab-muted">{t.requiredFieldsHint}</p>
        </div>

        <div className="p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <FormGroup title={t.identity} icon={UsersRound} accent="#577590">
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

            <FormGroup title={t.clinicalProfile} icon={Target} accent="#43AA8B">
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
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <FormGroup title={t.bodyMeasurements} icon={Activity} accent="#F8961E" compact>
              <NumberInput label={t.heightCm} value={form.heightCm} min={50} max={240} onChange={(heightCm) => setForm({ ...form, heightCm })} />
              <NumberInput label={t.weightKg} value={form.weightKg} min={2} max={250} onChange={(weightKg) => setForm({ ...form, weightKg })} />
            </FormGroup>

            <div className="rounded-xl border border-rehab-line bg-slate-50 p-4">
              <label className="text-sm font-semibold">
                {t.clinicalNotes}
                <textarea
                  value={form.clinicalNotes ?? ""}
                  placeholder={t.clinicalNotesPlaceholder}
                  onChange={(event) => setForm({ ...form, clinicalNotes: event.target.value })}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-rehab-line bg-white px-3 py-2 font-normal outline-none focus:border-rehab-teal"
                />
              </label>
            </div>
          </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-rehab-line pt-4">
          <Button variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button onClick={() => onSubmit(preparePatientPayload(form))} disabled={!isValid}>
            {t.savePatient}
          </Button>
        </div>
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

function FormGroup({ title, children, icon: Icon, accent = "#43AA8B", compact = false }) {
  return (
    <section className="mt-5 rounded-xl border border-rehab-line bg-white p-4 first:mt-0">
      <div className="mb-4 flex items-center gap-3">
        {Icon ? (
          <span className="grid h-9 w-9 place-items-center rounded-lg text-white" style={{ backgroundColor: accent }}>
            <Icon size={17} />
          </span>
        ) : null}
        <p className="text-sm font-semibold text-rehab-ink">{title}</p>
      </div>
      <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3"}`}>{children}</div>
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

function PatientKpi({ icon: Icon, label, value, helper, color }) {
  return (
    <div className="rounded-xl p-5 text-white shadow-card" style={{ backgroundColor: color }}>
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/20">
        <Icon size={18} />
      </div>
      <p className="mt-4 text-sm font-medium text-white/75">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      <p className="mt-2 text-xs text-white/60">{helper}</p>
    </div>
  );
}

function statusColor(patient) {
  if (patient.status === "Declining" || Number(patient.latestScore) < 45) return "#F94144";
  if (patient.status === "Follow-up" || Number(patient.latestScore) < 60) return "#F8961E";
  if (patient.status === "Stable" || Number(patient.latestScore) >= 80) return "#43AA8B";
  if (patient.status === "Improving") return "#90BE6D";
  return "#577590";
}

function filterPillColor(f) {
  const map = { all: "#277DA1", Stable: "#43AA8B", Improving: "#90BE6D", "Follow-up": "#F8961E", Declining: "#F94144" };
  return map[f] ?? "#277DA1";
}

function ScoreIndicator({ score }) {
  if (score == null) {
    return <span className="text-sm font-semibold text-rehab-muted">-</span>;
  }

  const tone = Number(score) >= 80 ? "#43AA8B" : Number(score) >= 70 ? "#F9C74F" : Number(score) >= 60 ? "#F8961E" : "#F94144";

  return (
    <div className="min-w-[116px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-rehab-ink">{score}/100</span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone }} />
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, Number(score)))}%`, backgroundColor: tone }} />
      </div>
    </div>
  );
}


function statusLabel(t, status) {
  const labels = {
    Stable: t.statusStable,
    Improving: t.statusImproving,
    "Follow-up": t.statusFollowUp,
    Declining: t.statusDeclining,
    "No sessions": t.statusNoSessions,
  };
  return labels[status] ?? status ?? t.statusNoSessions ?? t.noSessions;
}

function testTypeLabel(t, testType) {
  const normalized = String(testType ?? "").toLowerCase();
  if (normalized === "static") return t.staticTest;
  if (normalized === "dynamic") return t.dynamicTest;
  return testType ?? "-";
}

function conditionLabel(t, condition) {
  const normalized = String(condition ?? "").toLowerCase().replace("_", " ");
  if (normalized === "eyes open") return t.eyesOpen;
  if (normalized === "eyes closed") return t.eyesClosed;
  return condition ?? "-";
}

function acquisitionModeLabel(t, key, fallback) {
  const normalized = String(key ?? fallback ?? "").toLowerCase();
  if (normalized.includes("webcam")) return t.webcamBasedAssessment;
  if (normalized.includes("demo")) return t.demoAssessmentMode;
  if (normalized.includes("combined")) return t.combinedAssessmentMode;
  if (normalized.includes("board")) return t.boardAssessmentMode;
  return fallback ?? "-";
}

function initials(name = "") {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

function averageScoreValue(values) {
  const usable = values.map(Number).filter(Number.isFinite);
  if (!usable.length) return 0;
  return Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length);
}

function Summary({ label, value }) {
  return (
    <div className="rounded-lg border border-rehab-line p-4">
      <p className="text-sm text-rehab-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
