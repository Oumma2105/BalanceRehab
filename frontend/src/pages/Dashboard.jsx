import {
  Activity,
  ArrowRight,
  CalendarCheck,
  Plus,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UsersRound,
} from "lucide-react";

import { Button } from "../components/clinical/Button";
import { ClinicalCard } from "../components/clinical/ClinicalCard";
import { ClinicalTable } from "../components/clinical/ClinicalTable";
import { SectionHeader } from "../components/clinical/SectionHeader";
import { StatusBadge } from "../components/clinical/StatusBadge";

const statusTone = {
  Stable: "active",
  Improving: "connected",
  "Follow-up": "warning",
  Declining: "danger",
};

function initials(name = "") {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

function StatCard({ icon: Icon, label, value, helper, color, accentBg }) {
  return (
    <ClinicalCard className={`overflow-hidden border-0 p-5 ${accentBg}`}>
      <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ backgroundColor: color }}>
        <Icon size={18} />
      </span>
      <p className="mt-4 text-sm font-medium text-rehab-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-rehab-ink">{value}</p>
      <p className="mt-2 text-xs text-rehab-muted">{helper}</p>
    </ClinicalCard>
  );
}

function ScoreChip({ score }) {
  const n = Number(score);
  if (!Number.isFinite(n)) return <span className="text-sm text-rehab-muted">-</span>;
  const chipClass =
    n >= 80 ? "bg-emerald-100 text-emerald-700" :
    n >= 70 ? "bg-teal-100 text-teal-700" :
    n >= 60 ? "bg-amber-100 text-amber-700" :
              "bg-rose-100 text-rose-700";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${chipClass}`}>
      {n}
    </span>
  );
}

export function Dashboard({ t, patients, sessions, reports, dashboardSummary, onDownloadReport, onStartAssessment, onViewPatient, onAddPatient, onOpenPatients }) {
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartIso = weekStart.toISOString().slice(0, 10);
  const localTodaySessions = sessions.filter((session) => session.dateISO === today || String(session.date).startsWith(today)).length;
  const localWeekSessions = sessions.filter((session) => {
    const sessionDate = session.dateISO ?? String(session.date).slice(0, 10);
    return sessionDate >= weekStartIso && sessionDate <= today;
  }).length;
  const todaySessions = dashboardSummary?.assessments_today ?? localTodaySessions;
  const weekSessions = dashboardSummary?.assessments_this_week ?? localWeekSessions;
  const averageScore = dashboardSummary?.average_stability_score ?? average(sessions.map((session) => session.totalScore));
  const followUpPatients = patients.filter((patient) =>
    ["Follow-up", "Declining"].includes(patient.status) || Number(patient.latestScore) < 70,
  );
  const followUpCount = dashboardSummary?.follow_up_queue ?? followUpPatients.length;
  const latestSessions = dashboardSummary?.recent_assessments?.length ? dashboardSummary.recent_assessments.map(dashboardAssessmentFromApi) : sessions.slice(0, 5);
  const patientImprovements = patients.map((patient) => {
    const patientSessions = sessions
      .filter((s) => s.patientId === patient.id)
      .sort((a, b) => String(a.dateISO ?? "").localeCompare(String(b.dateISO ?? "")));
    if (patientSessions.length < 2) return null;
    const first = Number(patientSessions[0].totalScore ?? 0);
    const last = Number(patientSessions[patientSessions.length - 1].totalScore ?? 0);
    return last - first;
  }).filter((v) => v !== null);
  const averageImprovement = dashboardSummary?.average_improvement != null
    ? Math.round(Number(dashboardSummary.average_improvement) * 10) / 10
    : patientImprovements.length
      ? Math.round((patientImprovements.reduce((a, b) => a + b, 0) / patientImprovements.length) * 10) / 10
      : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-rehab-ink">{t.greeting}</h1>
          <p className="mt-1 text-sm text-rehab-muted">{t.dashboardSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onStartAssessment()}>
            <Plus size={16} /> {t.newAssessment}
          </Button>
          <Button variant="secondary" onClick={onAddPatient}>
            <UserPlus size={16} /> {t.addPatient}
          </Button>
        </div>
      </section>

      {/* KPI strip */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={UsersRound}
          label={t.totalPatients}
          value={patients.length}
          helper={t.patientsInProgram}
          color="#577590"
          accentBg="bg-blue-50"
        />
        <StatCard
          icon={CalendarCheck}
          label={t.assessmentsToday}
          value={todaySessions}
          helper={`${weekSessions} ${t.assessmentsThisWeek ?? "this week"}`}
          color="#90BE6D"
          accentBg="bg-emerald-50"
        />
        <StatCard
          icon={Activity}
          label={t.followUpQueue}
          value={followUpCount}
          helper={t.patientsToReview}
          color="#F8961E"
          accentBg="bg-orange-50"
        />
        <StatCard
          icon={TrendingUp}
          label={t.averageScore}
          value={averageScore ? `${averageScore}/100` : "-"}
          helper={`${averageImprovement >= 0 ? "+" : ""}${averageImprovement}% ${t.averageImprovement ?? "avg improvement"}`}
          color="#43AA8B"
          accentBg="bg-teal-50"
        />
      </section>

      {/* Main content */}
      <section className="grid gap-4 xl:grid-cols-[1.55fr_0.75fr]">
        <ClinicalCard className="p-5">
          <SectionHeader title={t.recentAssessments} description={t.recentAssessmentsDesc} />
          <div className="mt-4">
            <ClinicalTable
              columns={[t.patient, t.date, t.test, t.conditions, t.score, t.status, t.action]}
              rows={latestSessions}
              renderRow={(assessment) => (
                <tr key={assessment.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-rehab-blue">
                        {initials(assessment.patient)}
                      </div>
                      <div>
                        <p className="font-semibold text-rehab-ink">{assessment.patient}</p>
                        <p className="text-xs text-rehab-muted">{assessment.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-rehab-muted">{assessment.date}</td>
                  <td className="px-4 py-3 text-sm text-rehab-muted">{testTypeLabel(t, assessment.testType)}</td>
                  <td className="px-4 py-3 text-sm text-rehab-muted">{conditionLabel(t, assessment.condition)}</td>
                  <td className="px-4 py-3">
                    <ScoreChip score={assessment.totalScore} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={statusTone[assessment.status] ?? "neutral"}>{statusLabel(t, assessment.status)}</StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onViewPatient ? onViewPatient(assessment.patientId) : onStartAssessment(assessment.patientId)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rehab-line bg-white px-2.5 py-1.5 text-xs font-semibold text-rehab-blue transition hover:bg-slate-50"
                    >
                      {t.results} <ArrowRight size={12} />
                    </button>
                  </td>
                </tr>
              )}
            />
          </div>
        </ClinicalCard>

        <ClinicalCard className="p-5">
          <SectionHeader title={t.patientsRequiringAttention} description={t.attentionDesc} />
          <div className="mt-4 space-y-2.5">
            {followUpPatients.length === 0 ? (
              <p className="rounded-lg bg-emerald-50 px-4 py-6 text-center text-sm font-semibold text-emerald-700">
                {t.allPatientsStable ?? "All patients are stable"}
              </p>
            ) : followUpPatients.slice(0, 5).map((patient) => {
              const isDanger = patient.status === "Declining" || Number(patient.latestScore) < 65;
              const Icon = isDanger ? TrendingDown : Activity;
              return (
                <button
                  type="button"
                  key={patient.id}
                  onClick={() => onStartAssessment(patient.id)}
                  className={`w-full rounded-lg border p-3 text-left transition hover:shadow-sm ${isDanger ? "border-rose-200 bg-rose-50 hover:border-rose-300" : "border-amber-200 bg-amber-50 hover:border-amber-300"}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white ${isDanger ? "bg-rehab-red" : "bg-rehab-orange"}`}>
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-rehab-ink">{patient.fullName}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${isDanger ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                          {patient.latestScore ?? "-"}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-rehab-muted">{patient.pathology}</p>
                    </div>
                  </div>
                </button>
              );
            })}
            {followUpPatients.length > 5 ? (
              <button type="button" onClick={onOpenPatients} className="w-full rounded-lg border border-rehab-line py-2 text-center text-xs font-semibold text-rehab-blue hover:bg-slate-50">
                +{followUpPatients.length - 5} {t.more ?? "more"} →
              </button>
            ) : null}
          </div>
        </ClinicalCard>
      </section>
    </div>
  );
}

function average(values) {
  const usable = values.filter((value) => Number.isFinite(Number(value)));
  if (!usable.length) return 0;
  return Math.round(usable.reduce((sum, value) => sum + Number(value), 0) / usable.length);
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

function dashboardAssessmentFromApi(assessment) {
  return {
    id: `S-${assessment.id}`,
    patientId: assessment.patient_id,
    patient: assessment.patient,
    patientCode: assessment.patient_code,
    date: formatDashboardDate(assessment.date),
    dateISO: assessment.date,
    testType: titleCase(assessment.test_type),
    condition: assessment.visual_condition === "eyes_closed" ? "Eyes closed" : "Eyes open",
    acquisitionMode: assessment.acquisition_mode,
    totalScore: assessment.total_score,
    status: assessment.status,
  };
}

function titleCase(value) {
  const normalized = String(value ?? "");
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "";
}

function formatDashboardDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
