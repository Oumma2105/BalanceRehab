import {
  Activity,
  ArrowRight,
  CalendarCheck,
  FileText,
  Plus,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UsersRound,
} from "lucide-react";

import { Button } from "../components/clinical/Button";
import { ChartPanel } from "../components/clinical/ChartPanel";
import { ClinicalCard } from "../components/clinical/ClinicalCard";
import { ClinicalTable } from "../components/clinical/ClinicalTable";
import { MiniBarChart } from "../components/clinical/MiniBarChart";
import { MiniLineChart } from "../components/clinical/MiniLineChart";
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

function Sparkline({ color = "#577590", points = [16, 24, 20, 34, 30, 38] }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = Math.max(1, max - min);
  const coords = points
    .map((point, index) => `${4 + index * 14},${36 - ((point - min) / span) * 28}`)
    .join(" ");

  return (
    <svg viewBox="0 0 80 42" className="h-10 w-20" aria-hidden="true">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SecondaryMetric({ icon: Icon, label, value, helper, trend, color, bg, points }) {
  return (
    <ClinicalCard className={`overflow-hidden border-0 ${bg}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg text-white" style={{ backgroundColor: color }}>
            <Icon size={19} />
          </div>
          <Sparkline color={color} points={points} />
        </div>
        <p className="mt-4 text-sm font-medium text-rehab-muted">{label}</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <p className="text-2xl font-semibold text-rehab-ink">{value}</p>
          <span className="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold" style={{ color }}>
            {trend}
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-rehab-muted">{helper}</p>
      </div>
    </ClinicalCard>
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
  const recentReports = dashboardSummary?.recent_reports?.length ? dashboardSummary.recent_reports.map(dashboardReportFromApi) : reports.slice(0, 4);
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

  const scoreTrend = dashboardSummary?.score_trend?.length
    ? dashboardSummary.score_trend.map((point) => ({ label: point.label, value: point.value ?? 0 }))
    : sessions
        .slice(0, 6)
        .reverse()
        .map((session, index) => ({ label: `S${index + 1}`, value: session.totalScore }));
  const staticAverage = dashboardSummary?.static_average ?? average(sessions.filter((s) => s.testType === "Static").map((s) => s.totalScore));
  const dynamicAverage = dashboardSummary?.dynamic_average ?? average(sessions.filter((s) => s.testType === "Dynamic").map((s) => s.totalScore));
  const eyesOpenAverage = dashboardSummary?.eyes_open_average ?? average(sessions.filter((s) => s.condition === "Eyes open").map((s) => s.totalScore));
  const eyesClosedAverage = dashboardSummary?.eyes_closed_average ?? average(sessions.filter((s) => s.condition === "Eyes closed").map((s) => s.totalScore));
  const backendDistribution = dashboardSummary?.score_distribution;
  const distribution = [
    { label: "<60", value: backendDistribution?.lt_60 ?? sessions.filter((s) => s.totalScore < 60).length, color: "#F94144" },
    { label: "60-69", value: backendDistribution?.["60_69"] ?? sessions.filter((s) => s.totalScore >= 60 && s.totalScore < 70).length, color: "#F8961E" },
    { label: "70-79", value: backendDistribution?.["70_79"] ?? sessions.filter((s) => s.totalScore >= 70 && s.totalScore < 80).length, color: "#F9C74F" },
    { label: "80+", value: backendDistribution?.["80_plus"] ?? sessions.filter((s) => s.totalScore >= 80).length, color: "#43AA8B" },
  ];

  const secondaryMetrics = [
    {
      icon: UsersRound,
      label: t.totalPatients,
      value: patients.length,
      helper: t.patientsInProgram,
      trend: `+${Math.max(0, patients.length - 5)} ${t.thisMonth}`,
      color: "#577590",
      bg: "bg-blue-50",
      points: trendPoints(patients.length),
    },
    {
      icon: CalendarCheck,
      label: t.assessmentsThisWeek,
      value: weekSessions,
      helper: t.functionalSessionsDone,
      trend: `+${Math.max(0, weekSessions - 5)}`,
      color: "#90BE6D",
      bg: "bg-emerald-50",
      points: trendPoints(weekSessions),
    },
    {
      icon: Activity,
      label: t.followUpQueue,
      value: followUpCount,
      helper: t.patientsToReview,
      trend: t.priority,
      color: "#F8961E",
      bg: "bg-orange-50",
      points: [7, 6, 6, 5, 6, followUpCount || 1],
    },
    {
      icon: TrendingUp,
      label: t.averageImprovement,
      value: `${averageImprovement >= 0 ? "+" : ""}${averageImprovement}%`,
      helper: t.scoreEvolutionDesc,
      trend: t.stable,
      color: "#43AA8B",
      bg: "bg-teal-50",
      points: [2, 3, 5, 5, 7, Math.max(1, averageImprovement)],
    },
  ];
  const clinicalInsights = [
    {
      icon: TrendingDown,
      title: `${dashboardSummary?.declining_patients ?? patients.filter((patient) => patient.status === "Declining").length} ${t.decliningPatients ?? "declining patients"}`,
      body: t.decliningPatientsInsight ?? "Review patients with recent reduction in estimated stability.",
      color: "#F94144",
      bg: "bg-rose-50",
      border: "border-rose-200",
    },
    {
      icon: Activity,
      title: `${followUpCount} ${t.followUpQueue}`,
      body: t.followUpQueueInsight ?? "Prioritize follow-up decisions before adding new training difficulty.",
      color: "#F8961E",
      bg: "bg-orange-50",
      border: "border-orange-200",
    },
    {
      icon: CalendarCheck,
      title: `${todaySessions} ${t.assessmentsToday}`,
      body: t.assessmentsTodayInsight ?? "Today's workload and completed evaluations at a glance.",
      color: "#577590",
      bg: "bg-blue-50",
      border: "border-blue-200",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal text-rehab-ink">{t.greeting}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-rehab-muted">{t.dashboardSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => onStartAssessment()}>
            <Plus size={17} /> {t.newAssessment}
          </Button>
          <Button variant="secondary" onClick={onAddPatient}>
            <UserPlus size={17} /> {t.addPatient}
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-clinical">
        <div className="grid gap-0 xl:grid-cols-[1.25fr_1fr]">
          <div className="border-b border-slate-200 bg-slate-50 p-6 xl:border-b-0 xl:border-r">
            <p className="text-sm font-semibold uppercase tracking-wide text-rehab-orange">{t.todayPriority}</p>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold leading-tight text-rehab-ink">
              {followUpCount} {t.patientsNeedAttention}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-rehab-muted">{t.priorityDescription}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={onOpenPatients}>{t.viewConcernedPatients}</Button>
              <Button variant="secondary" onClick={() => onStartAssessment()}>{t.newAssessment}</Button>
            </div>
          </div>

          <div className="grid gap-0 sm:grid-cols-3 xl:grid-cols-1">
            <HeroStat label={t.averageScore} value={`${averageScore || "-"} / 100`} color="#577590" />
            <HeroStat label={t.assessmentsToday} value={todaySessions} color="#90BE6D" />
            <HeroStat label={t.averageImprovement} value={`${averageImprovement >= 0 ? "+" : ""}${averageImprovement} %`} color="#43AA8B" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {secondaryMetrics.map((metric) => (
          <SecondaryMetric key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {clinicalInsights.map((insight) => (
          <ClinicalInsight key={insight.title} {...insight} />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
        <ClinicalCard className="p-5">
          <SectionHeader title={t.recentAssessments} description={t.recentAssessmentsDesc} />
          <div className="mt-5">
            <ClinicalTable
              columns={[t.patient, t.date, t.test, t.conditions, t.score, t.status, t.action]}
              rows={latestSessions}
              renderRow={(assessment) => (
                <tr key={assessment.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-rehab-blue">
                        {initials(assessment.patient)}
                      </div>
                      <div>
                        <p className="font-semibold text-rehab-ink">{assessment.patient}</p>
                        <p className="text-xs text-rehab-muted">{assessment.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-rehab-muted">{assessment.date}</td>
                  <td className="px-4 py-3 text-rehab-muted">{testTypeLabel(t, assessment.testType)}</td>
                  <td className="px-4 py-3 text-rehab-muted">{conditionLabel(t, assessment.condition)}</td>
                  <td className="px-4 py-3 font-semibold text-rehab-ink">{assessment.totalScore}/100</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={statusTone[assessment.status] ?? "neutral"}>{statusLabel(t, assessment.status)}</StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onViewPatient ? onViewPatient(assessment.patientId) : onStartAssessment(assessment.patientId)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rehab-line bg-white px-3 py-1.5 text-xs font-semibold text-rehab-blue transition hover:bg-slate-50"
                    >
                      {t.results} <ArrowRight size={13} />
                    </button>
                  </td>
                </tr>
              )}
            />
          </div>
        </ClinicalCard>

        <ClinicalCard className="p-5">
          <SectionHeader title={t.patientsRequiringAttention} description={t.attentionDesc} />
          <div className="mt-5 space-y-3">
            {followUpPatients.slice(0, 4).map((patient) => {
              const isDanger = patient.status === "Declining" || Number(patient.latestScore) < 65;
              const Icon = isDanger ? TrendingDown : Activity;
              return (
                <button
                  type="button"
                  key={patient.id}
                  onClick={() => onStartAssessment(patient.id)}
                  className={`w-full rounded-lg border p-4 text-left ${isDanger ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`grid h-10 w-10 place-items-center rounded-lg ${isDanger ? "bg-rehab-red" : "bg-rehab-orange"} text-white`}>
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-rehab-ink">{patient.fullName}</p>
                          <p className="mt-0.5 text-sm font-medium text-rehab-muted">{patient.pathology}</p>
                        </div>
                        <StatusBadge tone={isDanger ? "danger" : "warning"} dot={false}>
                          {patient.latestScore ?? "-"}
                        </StatusBadge>
                      </div>
                      <p className="mt-2 text-sm leading-5 text-rehab-muted">{statusLabel(t, patient.status)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ClinicalCard>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <ChartPanel title={t.scoreEvolution} description={t.scoreEvolutionDesc}>
          <MiniLineChart data={scoreTrend.length > 1 ? scoreTrend : [{ label: "S1", value: averageScore || 0 }, { label: "S2", value: averageScore || 0 }]} color="#577590" />
        </ChartPanel>
        <ChartPanel title={t.staticVsDynamic} description={t.staticVsDynamicDesc}>
          <MiniBarChart data={[{ label: t.staticTest, value: staticAverage, color: "#90BE6D" }, { label: t.dynamicTest, value: dynamicAverage, color: "#577590" }]} />
        </ChartPanel>
        <ChartPanel title={t.eyesOpenVsClosed} description={t.eyesOpenVsClosedDesc}>
          <MiniBarChart data={[{ label: t.eyesOpen, value: eyesOpenAverage, color: "#90BE6D" }, { label: t.eyesClosed, value: eyesClosedAverage, color: "#F8961E" }]} />
        </ChartPanel>
        <ChartPanel title={t.scoreDistribution} description={t.scoreDistributionDesc}>
          <MiniBarChart data={distribution} max={Math.max(1, ...distribution.map((item) => item.value))} />
        </ChartPanel>
      </section>

      <ClinicalCard className="p-5">
        <SectionHeader title={t.recentReports} description={t.recentReportsDesc} />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {recentReports.map((report) => (
            <article key={report.id} className="flex items-center justify-between gap-3 rounded-lg border border-rehab-line bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-white text-rehab-blue">
                  <FileText size={18} />
                </div>
                <div>
                  <p className="font-semibold text-rehab-ink">{report.patient}</p>
                  <p className="text-sm text-rehab-muted">
                    {report.id} - {report.generatedAt}
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                className="px-3 py-1.5"
                onClick={() => onDownloadReport?.({ sessionId: report.sessionId, patientId: report.patientId })}
                disabled={!report.sessionId}
              >
                {t.export}
              </Button>
            </article>
          ))}
        </div>
      </ClinicalCard>
    </div>
  );
}

function HeroStat({ label, value, color }) {
  return (
    <div className="border-b border-slate-200 p-6 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 xl:border-b xl:border-r-0">
      <div className="mb-4 h-1.5 w-12 rounded-full" style={{ backgroundColor: color }} />
      <p className="text-sm font-medium text-rehab-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-rehab-ink">{value}</p>
    </div>
  );
}

function ClinicalInsight({ icon: Icon, title, body, color, bg, border }) {
  return (
    <article className={`rounded-xl border ${border} ${bg} p-4`}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg text-white" style={{ backgroundColor: color }}>
          <Icon size={18} />
        </div>
        <div>
          <p className="font-semibold text-rehab-ink">{title}</p>
          <p className="mt-1 text-sm leading-5 text-rehab-muted">{body}</p>
        </div>
      </div>
    </article>
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

function trendPoints(value) {
  const end = Math.max(1, Number(value) || 1);
  return [Math.max(1, end - 5), Math.max(1, end - 4), Math.max(1, end - 3), Math.max(1, end - 2), Math.max(1, end - 1), end];
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

function dashboardReportFromApi(report) {
  return {
    id: report.report_id,
    patientId: report.patient_id,
    sessionId: report.session_id,
    patient: report.patient || report.patient_code || report.report_id,
    patientCode: report.patient_code,
    generatedAt: formatDashboardDate(report.generated_at),
    acquisitionMode: report.acquisition_mode,
    summary: report.summary,
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
