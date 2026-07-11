import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowLeft, ClipboardList, Download, Edit, FileText, Plus, Search, Target, Trash2, UsersRound } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  ComposedChart,
  Label,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "../components/clinical/Button";
import { ClinicalCard } from "../components/clinical/ClinicalCard";
import { ClinicalTable } from "../components/clinical/ClinicalTable";
import { EmptyState } from "../components/clinical/EmptyState";
import { SectionHeader } from "../components/clinical/SectionHeader";
import { StatusBadge } from "../components/clinical/StatusBadge";
import { api } from "../api/client.js";
import { getDateLocale } from "../i18n/dateLocale.js";
import { clinicalGoals, pathologyOptions } from "../data/demoPatients.js";
import { PatientRehabilitationPanel } from "./RehabilitationGames.jsx";

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
  rehabSessions = [],
  reports,
  onAddPatient,
  onUpdatePatient,
  onDeletePatient,
  onStartAssessment,
  onStartRehabGame,
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
  const patientCards = useMemo(
    () => patients.map((patient) => buildPatientCardModel(patient, sessions, rehabSessions, t)),
    [patients, sessions, rehabSessions, t],
  );
  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let list = statusFilter !== "all" ? patientCards.filter((p) => p.status === statusFilter) : patientCards;
    if (!normalized) return list;
    return list.filter((patient) =>
      [patient.fullName, patient.patientCode, patient.pathology, patient.clinicalGoal].join(" ").toLowerCase().includes(normalized),
    );
  }, [patientCards, query, statusFilter]);
  const attentionPatients = useMemo(
    () => patientCards
      .filter((patient) => patient.status === "Declining" || patient.status === "Follow-up" || Number(patient.latestScore) < 65)
      .sort((a, b) => riskRank(a) - riskRank(b))
      .slice(0, 6),
    [patientCards],
  );
  const activePatients = patients.filter((patient) => patient.status !== "No sessions").length;
  const followUpPatients = patients.filter((patient) => patient.status === "Follow-up" || patient.status === "Declining" || Number(patient.latestScore) < 70).length;
  const averageScore = useMemo(() => {
    const usable = patients.map((patient) => Number(patient.latestScore)).filter(Number.isFinite);
    if (!usable.length) return null;
    return Math.round((usable.reduce((sum, value) => sum + value, 0) / usable.length) * 10) / 10;
  }, [patients]);

  if (selectedPatient) {
    return (
      <PatientDetail
        t={t}
        patient={selectedPatient}
        requestedTab={requestedProfileTab}
        sessions={sessions.filter((session) => session.patientId === selectedPatient.id)}
        rehabSessions={rehabSessions.filter((session) => session.patientId === selectedPatient.id)}
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
        onStartRehabGame={() => onStartRehabGame?.(selectedPatient.id)}
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
        <PatientKpi icon={UsersRound} label={t.totalPatients} value={patients.length} helper={t.patientsInProgram ?? "in program"} color="#577590" />
        <PatientKpi icon={Activity} label={t.activePatients} value={activePatients} helper={t.withRecentActivity ?? "with recent activity"} color="#43AA8B" />
        <PatientKpi icon={AlertTriangle} label={t.followUpQueue} value={followUpPatients} helper={t.patientsToReview ?? "need review"} color={followUpPatients > 8 ? "#F94144" : "#F8961E"} />
        <PatientKpi icon={Target} label={t.averageScore} value={averageScore ? `${averageScore}/100` : "-"} helper={t.acrossAllPatients ?? "across all patients"} color="#90BE6D" />
      </section>

      <ClinicalCard className="p-5">
        <SectionHeader title={t.patientsRequiringAttention} description={t.attentionDesc} />
        <div className="mt-4">
          {attentionPatients.length === 0 ? (
            <div className="rounded-lg bg-emerald-50 px-4 py-5 text-sm font-semibold text-emerald-700">
              {t.allPatientsStable}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {attentionPatients.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  onClick={() => setSelectedId(patient.id)}
                  className="rounded-lg border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                  style={{ borderColor: `${statusColor(patient)}55` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-rehab-ink">{patient.fullName}</p>
                      <p className="mt-1 text-xs text-rehab-muted">{clinicalTerm(t, "pathologies", patient.pathology) || "-"}</p>
                    </div>
                    <ScorePill score={patient.latestScore} status={patient.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                    <TrendIndicator trend={patient.trend} />
                    <span className="font-semibold" style={{ color: statusColor(patient) }}>{statusLabel(t, patient.status)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </ClinicalCard>

      <ClinicalCard className="p-5">
        {/* Search + filter row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-rehab-muted" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.searchPatientNameId}
              className="w-full rounded-lg border border-rehab-line bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-rehab-teal focus:ring-2 focus:ring-rehab-teal/10"
            />
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-rehab-muted">
            {filteredPatients.length} / {patients.length} {t.patients}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
                    className="group relative overflow-hidden rounded-xl border border-rehab-line bg-white p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-rehab-teal/40 hover:shadow-md"
                  >
                    <span className="absolute inset-y-0 left-0 w-1 rounded-l-xl" style={{ backgroundColor: sc }} />
                    <div className="pl-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
                            style={{ backgroundColor: sc }}
                          >
                            {initials(patient.fullName)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-rehab-ink">{patient.fullName}</p>
                            <p className="text-xs text-rehab-muted">{patient.patientCode} - {clinicalTerm(t, "pathologies", patient.pathology) || "-"}</p>
                          </div>
                        </div>
                        <StatusBadge tone={statusTone[patient.status] ?? "neutral"}>
                          {statusLabel(t, patient.status)}
                        </StatusBadge>
                      </div>

                      <div className="mt-4 grid grid-cols-[auto_1fr] gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{t.balanceScore}</p>
                          <p className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: sc }}>
                            {patient.latestScore != null ? Math.round(Number(patient.latestScore)) : "-"}
                            <span className="text-sm text-rehab-muted">/100</span>
                          </p>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <TrendIndicator trend={patient.trend} />
                            <span className="text-xs text-rehab-muted">{formatShortDate(patient.lastAssessmentDate)}</span>
                          </div>
                          <div className="mt-3 h-14">
                            <PatientSparkline data={patient.scoreHistory} color={sc} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <ClinicalMiniStat label={t.rehabilitation ?? "Rehab"} value={patient.rehabStatus} color={patient.rehabCount > 0 ? "#43AA8B" : "#F8961E"} />
                        <ClinicalMiniStat label={t.lastAssessment} value={formatShortDate(patient.lastAssessmentDate)} color="#577590" />
                      </div>

                      {patient.latestScore != null ? (
                        <div className="mt-4">
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
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

function buildPatientCardModel(patient, sessions, rehabSessions, t = {}) {
  const patientSessions = sessions
    .filter((session) => session.patientId === patient.id)
    .sort((a, b) => new Date(a.date ?? a.createdAt ?? a.created_at ?? 0) - new Date(b.date ?? b.createdAt ?? b.created_at ?? 0));
  const scoreHistory = patientSessions
    .map((session, index) => ({
      index,
      score: Number(session.totalScore ?? session.results?.totalBalanceScore ?? session.balance_score),
    }))
    .filter((point) => Number.isFinite(point.score))
    .slice(-8);
  const firstScore = scoreHistory[0]?.score;
  const lastScore = scoreHistory[scoreHistory.length - 1]?.score ?? Number(patient.latestScore);
  const delta = Number.isFinite(firstScore) && Number.isFinite(lastScore) ? Math.round((lastScore - firstScore) * 10) / 10 : null;
  const rehabForPatient = rehabSessions.filter((session) => session.patientId === patient.id || session.patient_id === patient.id);
  const lastRehab = rehabForPatient
    .slice()
    .sort((a, b) => new Date(b.createdAt ?? b.created_at ?? 0) - new Date(a.createdAt ?? a.created_at ?? 0))[0];
  return {
    ...patient,
    latestScore: Number.isFinite(lastScore) ? Math.round(lastScore * 10) / 10 : patient.latestScore,
    lastAssessmentDate: patientSessions[patientSessions.length - 1]?.date ?? patientSessions[patientSessions.length - 1]?.createdAt ?? patient.lastAssessmentDate,
    scoreHistory,
    trend: delta,
    rehabCount: rehabForPatient.length,
    rehabStatus: rehabForPatient.length
      ? `${rehabForPatient.length} ${rehabForPatient.length > 1 ? (t.sessionsPlural ?? "sessions") : (t.sessionSingular ?? "session")} · ${formatNumber(lastRehab?.score)}/100`
      : (t.rehabNotStarted ?? "Not started"),
  };
}

function ScorePill({ score, status }) {
  const color = statusColor({ latestScore: score, status });
  return (
    <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ backgroundColor: color }}>
      {score != null ? `${Math.round(Number(score))}/100` : "-"}
    </span>
  );
}

function TrendIndicator({ trend }) {
  const numeric = Number(trend);
  if (!Number.isFinite(numeric)) {
    return <span className="text-xs font-semibold text-rehab-muted">No trend yet</span>;
  }
  const stable = Math.abs(numeric) < 2;
  const color = stable ? "#577590" : numeric > 0 ? "#43AA8B" : "#F94144";
  const arrow = stable ? "→" : numeric > 0 ? "↑" : "↓";
  return (
    <span className="text-xs font-semibold" style={{ color }}>
      {arrow} {numeric > 0 ? "+" : ""}{numeric} pts
    </span>
  );
}

function PatientSparkline({ data, color }) {
  if (!data?.length) {
    return <div className="grid h-full place-items-center rounded-lg bg-slate-50 text-xs font-semibold text-rehab-muted">No assessments</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
        <Area type="monotone" dataKey="score" stroke={color} fill={color} fillOpacity={0.14} strokeWidth={2.5} dot={data.length <= 3} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ClinicalMiniStat({ label, value, color }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <p className="text-[10px] font-semibold uppercase tracking-wide text-rehab-muted">{label}</p>
      </div>
      <p className="mt-1 truncate text-xs font-semibold text-rehab-ink">{value}</p>
    </div>
  );
}

function riskRank(patient) {
  if (patient.status === "Declining") return 0;
  if (Number(patient.latestScore) < 55) return 1;
  if (patient.status === "Follow-up") return 2;
  return 3;
}

function PatientDetail({ t, patient, sessions, rehabSessions, reports, onBack, onEdit, onDelete, onStartAssessment, onStartRehabGame, onDownloadSessionReport }) {
  const [profile, setProfile] = useState(null);
  const [showSway, setShowSway] = useState(false);
  const localChronological = useMemo(() => [...sessions].reverse().map((session, index) => sessionToProfilePoint(session, index)), [sessions]);

  useEffect(() => {
    let cancelled = false;
    api.patientProfile?.(patient.id)
      .then((payload) => {
        if (!cancelled) setProfile(payload);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [patient.id]);

  const clinicalPatient = profile?.patient ?? patient;
  const chartSessions = profile?.sessions?.length ? profile.sessions : localChronological;
  const latest = chartSessions[chartSessions.length - 1];
  const stats = profile?.stats ?? buildLocalProfileStats(patient, chartSessions, rehabSessions);
  const radar = latest ? buildRadar(latest, t) : [];
  const previousRadar = chartSessions.length > 1 ? buildRadar(chartSessions[chartSessions.length - 2], t) : [];
  const averages = metricAverages(chartSessions);
  const rehabData = profile?.rehab_sessions?.length ? profile.rehab_sessions : rehabSessions;

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-rehab-blue">
        <ArrowLeft size={16} /> {t.backToPatients}
      </button>

      <ClinicalCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl text-lg font-bold text-white" style={{ backgroundColor: statusColor(patient) }}>
              {initials(clinicalPatient.full_name ?? clinicalPatient.fullName)}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold text-rehab-ink">{clinicalPatient.full_name ?? clinicalPatient.fullName}</h1>
                <StatusBadge tone={statusTone[patient.status] ?? "neutral"}>{statusLabel(t, patient.status)}</StatusBadge>
              </div>
              <p className="mt-2 text-sm text-rehab-muted">
                {(clinicalPatient.patient_code ?? patient.patientCode)} - {(clinicalPatient.age ?? patient.age)} {t.years} - {displaySex(t, clinicalPatient.sex ?? patient.sex)} - {clinicalTerm(t, "pathologies", clinicalPatient.pathology ?? patient.pathology)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ProfileChip value={`${stats.session_count ?? chartSessions.length} ${t.sessions}`} />
                <ProfileChip value={`${t.avg ?? "Avg"}: ${formatNumber(stats.avg_score)}/100`} />
                <ProfileChip value={`${t.last ?? "Last"}: ${formatShortDate(stats.last_session_date ?? latest?.date)}`} />
                <ProfileChip value={`${t.riskShort ?? "Risk"}: ${clinicalTerm(t, "risk", stats.risk ?? riskFromScore(latest?.balance_score))}`} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onStartAssessment}>{t.newAssessment}</Button>
            <Button variant="secondary" onClick={onStartRehabGame}>{t.newRehabSession}</Button>
            <Button variant="secondary" onClick={() => latest && onDownloadSessionReport({ patient, session: sessions.find((item) => item.id === latest.id) ?? sessions[0] })}>
              <Download size={16} /> {t.downloadReport}
            </Button>
            <Button variant="secondary" onClick={onEdit}><Edit size={16} /> {t.edit}</Button>
            <Button variant="secondary" onClick={onDelete}><Trash2 size={16} /> {t.delete}</Button>
          </div>
        </div>
      </ClinicalCard>

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.45fr_0.9fr]">
        <ClinicalCard className="p-5">
          <SectionHeader title={t.patientInformation} description={t.patientInfoDesc} />
          <div className="mt-4 space-y-4">
            <InfoBlock title={t.clinicalProfile} rows={[
              [t.pathology, clinicalTerm(t, "pathologies", clinicalPatient.pathology ?? patient.pathology)],
              [t.clinicalGoal, clinicalTerm(t, "goals", clinicalPatient.clinical_goal ?? patient.clinicalGoal) || "-"],
              [t.dominantSide, clinicalTerm(t, "sides", clinicalPatient.dominant_side ?? patient.dominantSide) || "-"],
              [t.clinicalNotes, clinicalPatient.clinical_notes ?? patient.clinicalNotes ?? "-"],
            ]} />
            <InfoBlock title={t.bodyMeasurements} rows={[
              [t.pdfHeight ?? "Height", patient.heightCm ? `${patient.heightCm} cm` : "-"],
              [t.pdfWeight ?? "Weight", patient.weightKg ? `${patient.weightKg} kg` : "-"],
              [t.bmi ?? "IMC", stats.bmi ?? "-"],
            ]} />
            <InfoBlock title={t.programSummary} rows={[
              [t.firstSession, formatShortDate(stats.first_session_date)],
              [t.totalSessions, stats.session_count ?? chartSessions.length],
              [t.rehabSessionsCount, stats.rehab_session_count ?? rehabData.length],
              [t.programDuration, `${stats.program_duration_days ?? 0} ${t.days}`],
            ]} />
          </div>
        </ClinicalCard>

        <ClinicalCard className="p-5">
          <SectionHeader title={t.balanceScoreEvolution} description={t.balanceScoreEvolutionDesc} />
          {chartSessions.length ? (
            <>
              <div className="mt-4 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartSessions} margin={{ top: 12, right: 16, bottom: 24, left: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis dataKey="session_number" stroke="#577590"><Label value={t.sessionLabel} offset={-14} position="insideBottom" fill="#577590" /></XAxis>
                    <YAxis domain={[0, 100]} stroke="#577590"><Label value={t.scorePerHundred} angle={-90} position="insideLeft" fill="#577590" /></YAxis>
                    <Tooltip content={<ProfileTooltip unit="pts" />} />
                    <Legend />
                    <ReferenceLine y={75} stroke="#90BE6D" strokeDasharray="5 5" label={t.clinicalTarget} />
                    <ReferenceLine y={50} stroke="#F94144" strokeDasharray="5 5" label={t.riskThreshold} />
                    <Area type="monotone" dataKey="balance_score" name={t.balanceScore} stroke="#43AA8B" fill="#43AA8B" fillOpacity={0.2} strokeWidth={3} />
                    <Line type="monotone" dataKey="posture_score" name={t.postureScore} stroke="#577590" strokeDasharray="6 4" dot={false} />
                    <Line type="monotone" dataKey="stability_score" name={t.stability} stroke="#F8961E" strokeDasharray="6 4" dot={false} />
                    <Brush height={22} stroke="#577590" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <button type="button" onClick={() => setShowSway((value) => !value)} className="mt-3 rounded-lg border border-rehab-line px-3 py-2 text-sm font-semibold text-rehab-blue hover:bg-slate-50">
                {showSway ? (t.hideSwayMetrics ?? "Hide sway metrics") : (t.showSwayMetrics ?? "Show sway metrics")}
              </button>
              {showSway ? (
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartSessions} margin={{ top: 12, right: 16, bottom: 24, left: 0 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="session_number" stroke="#577590"><Label value={t.sessionLabel} offset={-14} position="insideBottom" fill="#577590" /></XAxis>
                      <YAxis stroke="#577590"><Label value={t.swayMetricsLabel} angle={-90} position="insideLeft" fill="#577590" /></YAxis>
                      <Tooltip content={<ProfileTooltip />} />
                      <Legend />
                      <Line type="monotone" dataKey="ap_sway" name={t.apSwayLabel} stroke="#F94144" strokeWidth={2} />
                      <Line type="monotone" dataKey="ml_sway" name={t.mlSwayLabel} stroke="#577590" strokeWidth={2} />
                      <Line type="monotone" dataKey="sway_velocity" name={t.swayVelocityLabel} stroke="#F8961E" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </>
          ) : <EmptyState title={t.noAssessmentsYet} description={t.firstAssessmentBaseline} actionLabel={t.startFirstAssessment} onAction={onStartAssessment} />}
        </ClinicalCard>

        <ClinicalCard className="p-5">
          <SectionHeader title={t.latestScoresSection} description={t.latestScoresDesc} />
          <div className="mt-4 grid gap-3">
            <ScoreStrip label={t.balanceScore} value={latest?.balance_score} />
            <ScoreStrip label={t.postureScore} value={latest?.posture_score} />
            <ScoreStrip label={t.stability} value={latest?.stability_score} />
          </div>
          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={mergeRadar(radar, previousRadar)}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
                <Radar name={t.previous ?? "Previous"} dataKey="previous" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.18} />
                <Radar name={t.latest ?? "Latest"} dataKey="latest" stroke="#43AA8B" fill="#43AA8B" fillOpacity={0.28} />
                <Legend />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </ClinicalCard>
      </section>

      <ClinicalCard className="p-5">
        <SectionHeader title={t.sessionHistory} description={`${chartSessions.length} ${t.sessions} - ${t.avg ?? "Avg"}: ${formatNumber(stats.avg_score)} - ${t.best ?? "Best"}: ${formatNumber(stats.best_score)} (${formatShortDate(stats.best_date)}) - ${t.worst ?? "Worst"}: ${formatNumber(stats.worst_score)} (${formatShortDate(stats.worst_date)})`} />
        <div className="mt-4">
          <ClinicalTable
            columns={["#", t.date, t.test, t.conditions, t.balanceScore, t.postureScore, t.stability, t.apSway ?? "AP Sway", t.mlSway ?? "ML Sway", t.status, t.actions]}
            rows={[...chartSessions].reverse()}
            renderRow={(session) => (
              <tr key={session.id} className="cursor-pointer hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">{session.session_number}</td>
                <td className="px-4 py-3 text-rehab-muted">{formatShortDate(session.date)}</td>
                <td className="px-4 py-3">{testTypeLabel(t, session.test_type)}</td>
                <td className="px-4 py-3">{conditionLabel(session.vision_condition)}</td>
                <MetricCell value={session.balance_score} average={averages.balance_score} higher />
                <MetricCell value={session.posture_score} average={averages.posture_score} higher />
                <MetricCell value={session.stability_score} average={averages.stability_score} higher />
                <MetricCell value={session.ap_sway} average={averages.ap_sway} />
                <MetricCell value={session.ml_sway} average={averages.ml_sway} />
                <td className="px-4 py-3"><StatusBadge tone={statusTone[session.status] ?? "neutral"}>{statusLabel(t, session.status)}</StatusBadge></td>
                <td className="px-4 py-3"><Button variant="secondary" className="px-3 py-1.5" onClick={() => onDownloadSessionReport({ patient, session: sessions.find((item) => item.id === session.id) ?? sessions[0] })}>{t.downloadReport}</Button></td>
              </tr>
            )}
          />
        </div>
      </ClinicalCard>

      <ClinicalCard className="p-5">
        <SectionHeader title={t.rehabSessionsSection} description={t.rehabSessionsSectionDesc} />
        {rehabData.length ? (
          <>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rehabData.map((item, index) => ({ ...item, label: `R${index + 1}` }))} margin={{ top: 10, right: 16, bottom: 24, left: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="#577590"><Label value={t.rehabSessionLabel} offset={-14} position="insideBottom" fill="#577590" /></XAxis>
                  <YAxis domain={[0, 100]} stroke="#577590"><Label value={t.scorePerHundred} angle={-90} position="insideLeft" fill="#577590" /></YAxis>
                  <Tooltip content={<ProfileTooltip unit="pts" />} />
                  <Bar dataKey="score" fill="#90BE6D" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {rehabData.map((item) => (
                <div key={item.id} className="rounded-lg border border-rehab-line p-4">
                  <p className="font-semibold text-rehab-ink">{clinicalTerm(t, "games", item.game_type ?? item.gameType)}</p>
                  <p className="mt-1 text-sm text-rehab-muted">{formatShortDate(item.date ?? item.createdAt)} - {item.duration_seconds ?? item.durationSeconds}s</p>
                  <ScoreStrip label={t.performanceLabel} value={item.score} />
                </div>
              ))}
            </div>
          </>
        ) : <EmptyState title={t.noRehabSessions} description={t.noRehabSessionsDesc} actionLabel={t.newRehabSession} onAction={onStartRehabGame} />}
      </ClinicalCard>
    </div>
  );
}

function ProfileChip({ value }) {
  return <span className="rounded-full border border-rehab-line bg-slate-50 px-3 py-1 text-xs font-semibold text-rehab-ink">{value}</span>;
}

function InfoBlock({ title, rows }) {
  return (
    <div className="rounded-lg border border-rehab-line bg-slate-50 p-4">
      <p className="font-semibold text-rehab-ink">{title}</p>
      <div className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 text-sm">
            <span className="text-rehab-muted">{label}</span>
            <span className="text-right font-semibold text-rehab-ink">{value ?? "-"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function sessionToProfilePoint(session, index) {
  return {
    id: session.id,
    session_number: index + 1,
    date: session.date ?? session.createdAt,
    test_type: session.testType,
    vision_condition: session.condition,
    status: session.status,
    balance_score: session.totalScore ?? session.results?.totalBalanceScore,
    posture_score: session.postureScore ?? session.results?.postureStabilityScore,
    stability_score: session.stabilityScore ?? session.results?.boardStabilityScore,
    ap_sway: session.results?.meanSwayAp ?? session.meanSwayAp,
    ml_sway: session.results?.meanSwayMl ?? session.meanSwayMl,
    sway_velocity: session.results?.swayVelocity ?? session.swayVelocity,
    trunk_deviation: session.trunkDeviation ?? session.results?.trunkDeviation,
    shoulder_asymmetry: session.shoulderAsymmetry ?? session.results?.shoulderAsymmetry,
    hip_asymmetry: session.hipAsymmetry ?? session.results?.hipAsymmetry,
  };
}

function buildLocalProfileStats(patient, chartSessions, rehabSessions) {
  const scores = chartSessions.map((item) => Number(item.balance_score)).filter(Number.isFinite);
  const best = chartSessions.reduce((a, b) => Number(b.balance_score) > Number(a?.balance_score ?? -1) ? b : a, null);
  const worst = chartSessions.reduce((a, b) => Number(b.balance_score) < Number(a?.balance_score ?? 101) ? b : a, null);
  const first = chartSessions[0];
  const latest = chartSessions[chartSessions.length - 1];
  return {
    session_count: chartSessions.length,
    rehab_session_count: rehabSessions.length,
    avg_score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    best_score: best?.balance_score,
    best_date: best?.date,
    worst_score: worst?.balance_score,
    worst_date: worst?.date,
    first_session_date: first?.date,
    last_session_date: latest?.date,
    program_duration_days: first ? Math.max(0, Math.round((Date.now() - new Date(first.date).getTime()) / 86400000)) : 0,
    risk: riskFromScore(latest?.balance_score),
    bmi: patient.heightCm && patient.weightKg ? Math.round((patient.weightKg / ((patient.heightCm / 100) ** 2)) * 10) / 10 : null,
  };
}

function buildRadar(session, t = {}) {
  return [
    { axis: t.radarBalance ?? "Balance", value: Number(session.balance_score) || 0 },
    { axis: t.radarPosture ?? "Posture", value: Number(session.posture_score) || 0 },
    { axis: t.radarStability ?? "Stability", value: Number(session.stability_score) || 0 },
    { axis: t.radarApControl ?? "AP Control", value: normalizeLowMetric(session.ap_sway, 0.5, 8) },
    { axis: t.radarMlControl ?? "ML Control", value: normalizeLowMetric(session.ml_sway, 0.3, 6) },
    { axis: t.radarAlignment ?? "Alignment", value: normalizeLowMetric(session.trunk_deviation, 0, 20) },
  ];
}

function mergeRadar(latest, previous) {
  return latest.map((item) => ({
    axis: item.axis,
    latest: item.value,
    previous: previous.find((entry) => entry.axis === item.axis)?.value ?? 0,
  }));
}

function normalizeLowMetric(value, best, worst) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(100 - ((numeric - best) / Math.max(0.1, worst - best)) * 100)));
}

function metricAverages(rows) {
  return ["balance_score", "posture_score", "stability_score", "ap_sway", "ml_sway"].reduce((acc, key) => {
    const values = rows.map((row) => Number(row[key])).filter(Number.isFinite);
    acc[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    return acc;
  }, {});
}

function ProfileTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-rehab-line bg-white px-3 py-2 text-xs shadow-card">
      <p className="font-semibold text-rehab-ink">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="text-rehab-muted">
          <span className="font-semibold" style={{ color: item.color }}>{item.name ?? item.dataKey}:</span> {formatNumber(item.value)} {unit ?? ""}
        </p>
      ))}
    </div>
  );
}

function metricTone(score) {
  if (!Number.isFinite(score)) return "#94A3B8";
  if (score < 50) return "#F94144";
  if (score < 65) return "#F8961E";
  if (score < 75) return "#F9C74F";
  return "#90BE6D";
}

function ScoreStrip({ label, value }) {
  const score = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-rehab-ink">{label}</span>
        <span className="font-semibold text-rehab-muted">{Number.isFinite(Number(value)) ? `${formatNumber(value)}/100` : "-"}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: metricTone(score) }} />
      </div>
    </div>
  );
}

function MetricCell({ value, average, higher = false }) {
  const numeric = Number(value);
  const avg = Number(average);
  const better = Number.isFinite(numeric) && Number.isFinite(avg) ? (higher ? numeric >= avg : numeric <= avg) : true;
  return (
    <td className="px-4 py-3">
      <span className="inline-flex items-center gap-2 font-semibold text-rehab-ink">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: better ? "#43AA8B" : "#F94144" }} />
        {formatNumber(value)}
      </span>
    </td>
  );
}

function riskFromScore(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return "Unknown";
  if (numeric >= 75) return "Low";
  if (numeric >= 60) return "Moderate";
  return "High";
}

function formatNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 10) / 10 : "-";
}

function formatShortDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString(getDateLocale(), { month: "short", day: "numeric" });
}

function titleCase(value) {
  const text = String(value ?? "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "-";
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
                    {localizedDate(t, bestSession.date)} - {bestSession.totalScore}/100
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
                  <td className="px-4 py-3 text-rehab-muted">{localizedDate(t, session.date)}</td>
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
        <InfoItem label={t.sex} value={displaySex(t, patient.sex)} />
        <InfoItem label={t.dominantSide} value={clinicalTerm(t, "sides", patient.dominantSide) || "-"} />
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
        <InfoItem label={t.medicalReason} value={clinicalTerm(t, "pathologies", patient.pathology) || "-"} />
        <InfoItem label={t.clinicalGoal} value={clinicalTerm(t, "goals", patient.clinicalGoal) || "-"} />
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
              <span className="font-semibold text-rehab-ink">{clinicalTerm(t, "pathologies", createdPatient.pathology)}</span>
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
                options={[
                  { value: "Female", label: t.female },
                  { value: "Male", label: t.male },
                ]}
                required
              />
            </FormGroup>

            <FormGroup title={t.clinicalProfile} icon={Target} accent="#43AA8B">
              <ComboboxInput
                label={t.medicalReason}
                value={form.pathology}
                options={pathologyOptions.map((value) => ({ value, label: clinicalTerm(t, "pathologies", value) }))}
                placeholder={t.pathologyPlaceholder}
                onChange={(pathology) => setForm({ ...form, pathology })}
                required
                listId="pathology-options"
              />
              <ComboboxInput
                label={t.clinicalGoal}
                value={form.clinicalGoal}
                options={clinicalGoals.map((value) => ({ value, label: clinicalTerm(t, "goals", value) }))}
                placeholder={t.clinicalGoalPlaceholder}
                onChange={(clinicalGoal) => setForm({ ...form, clinicalGoal })}
                listId="clinical-goal-options"
              />
              <SelectField
                label={t.dominantSide}
                value={form.dominantSide}
                onChange={(dominantSide) => setForm({ ...form, dominantSide })}
                options={[
                  { value: "", label: t.notSpecified },
                  { value: "Left", label: t.left },
                  { value: "Right", label: t.right },
                ]}
                emptyLabel={t.notSpecified}
              />
            </FormGroup>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <FormGroup title={t.bodyMeasurements} icon={Activity} accent="#F8961E" compact>
              <NumberInput label={t.heightCm} value={form.heightCm} min={50} max={250} step={1} placeholder="e.g. 170" onChange={(heightCm) => setForm({ ...form, heightCm })} />
              <NumberInput label={t.weightKg} value={form.weightKg} min={10} max={300} step={0.5} placeholder="e.g. 72.5" onChange={(weightKg) => setForm({ ...form, weightKg })} />
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

function AgeInput({ label, value, onChange, required }) {
  return (
    <NumberInput
      label={label}
      value={value}
      min={1}
      max={120}
      step={1}
      placeholder="e.g. 65"
      onChange={onChange}
      required={required}
    />
  );
}

function NumberInput({ label, value, min, max, step = 1, placeholder, onChange, required }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        required={required}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-rehab-line px-3 py-2 font-normal outline-none focus:border-rehab-teal"
      />
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
        {options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option || emptyLabel : option.label;
          return (
          <option key={optionValue || "empty"} value={optionValue}>
            {optionLabel}
          </option>
          );
        })}
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
          <option
            key={typeof option === "string" ? option : option.value}
            value={typeof option === "string" ? option : option.value}
            label={typeof option === "string" ? option : option.label}
          />
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

function displaySex(t, sex) {
  if (sex === "F" || sex === "Female") return t.female ?? "Female";
  if (sex === "M" || sex === "Male") return t.male ?? "Male";
  return sex || "-";
}

function clinicalTerm(t, group, value) {
  return t.clinicalTerms?.[group]?.[value] ?? value;
}

function localizedDate(t, value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(t.localeCode ?? "en-US");
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
  if (patient.status === "Declining" || Number(patient.latestScore) < 50) return "#F94144";
  if (patient.status === "Follow-up" || Number(patient.latestScore) < 65) return "#F8961E";
  if (patient.status === "Improving") return "#43AA8B";
  if (patient.status === "Stable" || Number(patient.latestScore) >= 75) return "#90BE6D";
  return "#577590";
}

function filterPillColor(f) {
  const map = { all: "#577590", Stable: "#90BE6D", Improving: "#43AA8B", "Follow-up": "#F8961E", Declining: "#F94144" };
  return map[f] ?? "#577590";
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
