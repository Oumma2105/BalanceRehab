import { getDateLocale } from "../i18n/dateLocale.js";
import { conditionLabel, gameLabel, pathologyLabel, statusLabel, testTypeLabel } from "../i18n/clinicalValues.js";
import { useMemo } from "react";
import { Activity, AlertTriangle, ArrowRight, CalendarCheck, Plus, UserPlus, UsersRound } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
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

const palette = ["#F94144", "#F8961E", "#F9C74F", "#90BE6D", "#43AA8B", "#577590"];
const statusColors = {
  Stable: "#90BE6D",
  Improving: "#43AA8B",
  "Follow-up": "#F8961E",
  Declining: "#F94144",
  "No sessions": "#94a3b8",
};
const scoreColors = ["#F94144", "#F8961E", "#F9C74F", "#90BE6D", "#43AA8B"];
const statusTone = { Stable: "active", Improving: "connected", "Follow-up": "warning", Declining: "danger" };

export function Dashboard({ t, patients, sessions, rehabSessions = [], dashboardSummary, onStartAssessment, onViewPatient, onAddPatient }) {
  const analytics = useMemo(() => normalizeDashboardData(dashboardSummary, patients, sessions), [dashboardSummary, patients, sessions]);
  const rehabAnalytics = useMemo(() => normalizeRehabData(rehabSessions), [rehabSessions]);
  const trendStats = useMemo(() => trendSummary(analytics.clinicTrend), [analytics.clinicTrend]);

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-rehab-ink">{t.greeting}</h1>
          <p className="mt-1 text-sm text-rehab-muted">{t.dashboardAnalyticsSubtitle}</p>
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={UsersRound} label={t.totalPatients} value={analytics.kpis.total_patients} helper={(t.kpiActiveThisMonth ?? "{count} active this month").replace("{count}", analytics.kpis.active_patients ?? 0)} color="#577590" />
        <KpiCard
          icon={Activity}
          label={t.averageScore}
          value={analytics.kpis.average_score ? `${analytics.kpis.average_score} / 100` : "-"}
          helper={t.kpiClinicMonthlyAverage}
          color="#43AA8B"
          trend={`${analytics.kpis.trend_direction === "up" ? "+" : "-"}${analytics.kpis.trend_value} pts`}
          trendColor={analytics.kpis.trend_direction === "up" ? "#43AA8B" : "#F94144"}
        />
        <KpiCard icon={CalendarCheck} label={t.assessmentsThisWeek} value={analytics.kpis.sessions_this_week} helper={(t.kpiSessionsToday ?? "{count} sessions today").replace("{count}", analytics.kpis.sessions_today ?? 0)} color="#43AA8B" />
        <KpiCard icon={AlertTriangle} label={t.followUpQueue} value={analytics.kpis.follow_up_queue} helper={(t.kpiFollowUpHelper ?? "{declining} declining · {noRecent} no recent session").replace("{declining}", analytics.kpis.declining_count ?? 0).replace("{noRecent}", analytics.kpis.no_recent_count ?? 0)} color={queueColor(analytics.kpis.follow_up_queue)} />
      </section>

      {/* Row 1: Risk Distribution — full width */}
      <section>
        <ClinicalCard className="p-5">
          <SectionHeader title={t.riskDistribution} description={t.riskDistributionDesc} />
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <ChartFrame data={analytics.statusDonut} t={t}>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={analytics.statusDonut} dataKey="value" nameKey="name" innerRadius={66} outerRadius={96} paddingAngle={2}>
                    {analytics.statusDonut.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ClinicalTooltip unit={t.patients} />} />
                  <Legend verticalAlign="bottom" height={52} formatter={(value) => `${statusLabel(t, value)}: ${analytics.statusDonut.find((item) => item.name === value)?.value ?? 0}`} />
                  <text x="50%" y="44%" textAnchor="middle" style={{ fill: "#14213d", fontSize: 20, fontWeight: 700 }}>{analytics.kpis.total_patients}</text>
                  <text x="50%" y="56%" textAnchor="middle" style={{ fill: "#577590", fontSize: 11 }}>{t.patients}</text>
                </PieChart>
              </ResponsiveContainer>
            </ChartFrame>

            <ChartFrame data={analytics.scoreDistribution} t={t}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.scoreDistribution} layout="vertical" margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#577590" height={28} label={{ value: t.patients, position: "insideBottom", offset: -8, fill: "#577590", fontSize: 11 }} />
                  <YAxis type="category" dataKey="range_label" width={56} tick={{ fontSize: 11 }} stroke="#577590" />
                  <Tooltip content={<ClinicalTooltip unit={t.patients} />} />
                  <Bar dataKey="count" name={t.patients} radius={[0, 4, 4, 0]}>
                    {analytics.scoreDistribution.map((entry, index) => <Cell key={entry.range_label} fill={scoreColors[index]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          </div>
        </ClinicalCard>
      </section>

      {/* Row 2: Rehabilitation Progress | Balance Trend */}
      <section className="grid gap-4 xl:grid-cols-2">
        <ClinicalCard className="p-5">
          <SectionHeader title={t.rehabProgress} description={t.rehabProgressDesc} />
          <ChartFrame data={rehabAnalytics.trend} t={t}>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={rehabAnalytics.trend} margin={{ top: 8, right: 28, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#577590" height={36} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#577590" width={44} />
                <Tooltip content={<ClinicalTooltip unit="pts" />} />
                <Legend verticalAlign="top" height={40} />
                <ReferenceLine y={75} stroke="#90BE6D" strokeDasharray="5 5" />
                <Bar dataKey="duration_score" name={t.durationIndex} fill="#577590" fillOpacity={0.22} radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="score" name={t.rehabScore} stroke="#90BE6D" strokeWidth={3} dot={{ r: 3, fill: "#90BE6D" }} />
                <Line type="monotone" dataKey="stability" name={t.stability} stroke="#43AA8B" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <StatChip label={(t.statAvgRehab ?? "Avg rehab: {value}/100").replace("{value}", formatNumber(rehabAnalytics.averageScore))} color="#90BE6D" />
            <StatChip label={(t.statBestRehab ?? "Best rehab: {value}/100").replace("{value}", formatNumber(rehabAnalytics.bestScore))} color="#43AA8B" />
            <StatChip label={(t.statSessions ?? "Sessions: {count}").replace("{count}", rehabSessions.length)} color="#577590" />
          </div>
        </ClinicalCard>

        <ClinicalCard className="p-5">
          <SectionHeader title={t.clinicWideTrend} description={t.clinicWideTrendDesc} />
          <ChartFrame data={analytics.clinicTrend} t={t}>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={analytics.clinicTrend} margin={{ top: 8, right: 52, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="week_label" tick={{ fontSize: 11 }} stroke="#577590" height={36} />
                <YAxis yAxisId="score" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#577590" width={52} />
                <YAxis yAxisId="volume" orientation="right" tick={{ fontSize: 11 }} stroke="#577590" allowDecimals={false} width={48} />
                <Tooltip content={<ClinicalTooltip />} />
                <Legend verticalAlign="top" height={40} />
                <ReferenceLine yAxisId="score" y={75} stroke="#90BE6D" strokeDasharray="5 5" label={{ value: t.clinicalTarget, fill: "#47743C", fontSize: 11, position: "insideTopRight" }} />
                <Bar yAxisId="volume" dataKey="session_count" name={t.sessions} fill="#F9C74F" fillOpacity={0.55} radius={[4, 4, 0, 0]} />
                <Area yAxisId="score" type="monotone" dataKey="avg_score" name={t.averageScore} fill="#43AA8B" fillOpacity={0.18} stroke="#43AA8B" strokeWidth={3} connectNulls />
                <Line yAxisId="score" type="monotone" dataKey="median_score" name={t.medianScore} stroke="#F8961E" strokeWidth={2.5} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <StatChip label={(t.statBestWeek ?? "Best week: {value} avg").replace("{value}", trendStats.best)} color="#90BE6D" />
            <StatChip label={(t.statMostActive ?? "Most active: {value} sessions/week").replace("{value}", trendStats.mostActive)} color="#F9C74F" />
            <StatChip label={(t.statTrend ?? "Trend: {sign}{value} pts/month").replace("{sign}", trendStats.trend >= 0 ? "+" : "").replace("{value}", Math.abs(trendStats.trend))} color={trendStats.trend >= 0 ? "#43AA8B" : "#F94144"} />
          </div>
        </ClinicalCard>
      </section>

      {/* Row 3: Pathology Breakdown | Clinical Insights */}
      <section className="grid gap-4 xl:grid-cols-2">
        <ClinicalCard className="p-5">
          <SectionHeader title={t.pathologyBreakdown} description={t.pathologyBreakdownDesc} />
          <ChartFrame data={analytics.pathologyBreakdown} t={t}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.pathologyBreakdown} layout="vertical" margin={{ top: 8, right: 24, bottom: 28, left: 8 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#577590" height={28} label={{ value: t.patients, position: "insideBottom", offset: -8, fill: "#577590", fontSize: 11 }} />
                <YAxis type="category" dataKey="pathology" width={136} tick={{ fontSize: 10 }} stroke="#577590" tickFormatter={(value) => pathologyLabel(t, value)} />
                <Tooltip content={<ClinicalTooltip unit={t.patients} />} />
                <Bar dataKey="count" name={t.patients} radius={[0, 4, 4, 0]}>
                  {analytics.pathologyBreakdown.map((entry, index) => <Cell key={entry.pathology} fill={palette[index % palette.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </ClinicalCard>

        <ClinicalCard className="p-5">
          <SectionHeader title={t.clinicalInsights} description={t.clinicalInsightsDesc} />
          <ChartFrame data={rehabAnalytics.gameMix} t={t}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={rehabAnalytics.gameMix} dataKey="count" nameKey="game" innerRadius={65} outerRadius={105} paddingAngle={3}>
                  {rehabAnalytics.gameMix.map((entry, index) => <Cell key={entry.game} fill={palette[(index + 3) % palette.length]} />)}
                </Pie>
                <Tooltip content={<ClinicalTooltip unit={t.sessions} />} />
                <Legend verticalAlign="bottom" height={60} formatter={(value) => gameLabel(t, value)} />
              </PieChart>
            </ResponsiveContainer>
          </ChartFrame>
        </ClinicalCard>
      </section>

      <ClinicalCard className="p-5">
        <SectionHeader title={t.recentAssessments} description={t.recentAssessmentsChartDesc} />
        <div className="mt-3">
          <ClinicalTable
            columns={[t.patient, t.date, t.test, t.conditions, t.score, t.trend, t.status, t.action]}
            rows={analytics.recentAssessments}
            renderRow={(assessment) => (
              <tr key={assessment.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <p className="font-semibold text-rehab-ink">{assessment.patient_name}</p>
                  <p className="text-xs text-rehab-muted">{assessment.patient_code}</p>
                </td>
                <td className="px-4 py-2 text-sm text-rehab-muted">{formatDate(assessment.date)}</td>
                <td className="px-4 py-2 text-sm text-rehab-muted">{testTypeLabel(t, assessment.test_type)}</td>
                <td className="px-4 py-2 text-sm text-rehab-muted">{conditionLabel(t, assessment.vision_condition)}</td>
                <td className="px-4 py-2"><ScoreBadge score={assessment.balance_score} /></td>
                <td className="px-4 py-2"><TinyLine data={assessment.score_history} color={severityColor(assessment.balance_score, assessment.status)} /></td>
                <td className="px-4 py-2"><StatusBadge tone={statusTone[assessment.status] ?? "neutral"}>{statusLabel(t, assessment.status)}</StatusBadge></td>
                <td className="px-4 py-2">
                  <button type="button" onClick={() => onViewPatient?.(assessment.patient_id)} className="inline-flex items-center gap-1 rounded-lg border border-rehab-line bg-white px-2.5 py-1.5 text-xs font-semibold text-rehab-blue hover:bg-slate-50">
                    {t.results} <ArrowRight size={12} />
                  </button>
                </td>
              </tr>
            )}
          />
        </div>
      </ClinicalCard>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, helper, color, trend, trendColor }) {
  return (
    <ClinicalCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg text-white" style={{ backgroundColor: color }}>
          <Icon size={18} />
        </span>
        {trend ? (
          <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold" style={{ color: trendColor ?? color }}>
            {trend}
          </span>
        ) : null}
      </div>
      <p className="mt-4 text-sm font-medium text-rehab-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-rehab-ink">{value}</p>
      <p className="mt-2 text-xs text-rehab-muted">{helper}</p>
    </ClinicalCard>
  );
}

function ChartFrame({ data, children, t }) {
  if (!data) return <div className="mt-4 h-64 animate-pulse rounded-lg bg-slate-100" />;
  if (!data.length) return <div className="mt-4"><EmptyState title={t?.noDataForPeriod ?? "No data available for this period"} description={t?.noDataForPeriodDesc ?? "Complete assessments to populate this chart."} /></div>;
  return <div className="mt-4">{children}</div>;
}

function TinyArea({ data = [], color = "#43AA8B" }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <Area type="monotone" dataKey="avg_score" stroke={color} fill={color} fillOpacity={0.18} dot={false} connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TinyBars({ data = [], color = "#90BE6D" }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TinyLine({ data = [], color = "#43AA8B" }) {
  return (
    <div className="h-10 w-16">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <Area type="monotone" dataKey="score" stroke={color} fill={color} fillOpacity={0.14} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function RiskMiniStack({ statusDonut }) {
  const total = statusDonut.reduce((sum, item) => sum + Number(item.value ?? 0), 0) || 1;
  return (
    <div className="flex h-full items-end">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {statusDonut.filter((item) => item.value > 0).map((item) => (
          <span key={item.name} style={{ width: `${(item.value / total) * 100}%`, backgroundColor: item.color }} />
        ))}
      </div>
    </div>
  );
}

function ClinicalTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-rehab-line bg-white px-3 py-2 text-xs shadow-card">
      <p className="font-semibold text-rehab-ink">{label}</p>
      {payload.map((item) => (
        <p key={`${item.dataKey}-${item.name}`} className="text-rehab-muted">
          <span style={{ color: item.color }} className="font-semibold">{item.name ?? item.dataKey}:</span> {formatNumber(item.value)} {unit ?? valueUnit(item.dataKey)}
        </p>
      ))}
    </div>
  );
}

function ScoreBadge({ score }) {
  const color = severityColor(score);
  return <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ backgroundColor: color }}>{formatNumber(score)}</span>;
}

function StatChip({ label, color }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 font-semibold text-rehab-ink">
      <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}

function normalizeDashboardData(summary, patients, sessions) {
  if (summary?.kpis) {
    return {
      kpis: summary.kpis,
      clinicTrend: summary.clinicTrend ?? [],
      statusDonut: [
        ["Stable", summary.statusDistribution?.stable ?? 0],
        ["Improving", summary.statusDistribution?.improving ?? 0],
        ["Follow-up", summary.statusDistribution?.follow_up ?? 0],
        ["Declining", summary.statusDistribution?.declining ?? 0],
        ["No sessions", summary.statusDistribution?.no_sessions ?? 0],
      ].map(([name, value]) => ({ name, value, color: statusColors[name] })),
      scoreDistribution: summary.scoreDistribution ?? [],
      pathologyBreakdown: summary.pathologyBreakdown ?? [],
      recentAssessments: summary.recentAssessments ?? [],
    };
  }
  const patientLookup = new Map(patients.map((patient) => [patient.id, patient]));
  const scoredSessions = sessions
    .map((session) => ({ ...session, score: Number(session.totalScore ?? session.balance_score), parsedDate: parseSessionDate(session) }))
    .filter((session) => Number.isFinite(session.score) && session.parsedDate);
  const latestByPatient = new Map();
  for (const session of scoredSessions) {
    const existing = latestByPatient.get(session.patientId);
    if (!existing || session.parsedDate > existing.parsedDate) {
      latestByPatient.set(session.patientId, session);
    }
  }
  const latestScores = [...latestByPatient.values()].map((session) => session.score);
  const now = new Date();
  const todayKey = dateKey(now);
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  const monthAgo = new Date(now);
  monthAgo.setDate(now.getDate() - 30);
  const previousMonth = new Date(now);
  previousMonth.setDate(now.getDate() - 60);
  const monthScores = scoredSessions.filter((session) => session.parsedDate >= monthAgo).map((session) => session.score);
  const previousScores = scoredSessions.filter((session) => session.parsedDate >= previousMonth && session.parsedDate < monthAgo).map((session) => session.score);
  const avgScore = average(monthScores.length ? monthScores : scoredSessions.map((session) => session.score));
  const previousAvg = average(previousScores);
  const trendValue = previousAvg == null || avgScore == null ? 0 : Math.round((avgScore - previousAvg) * 10) / 10;
  const latest = [...scoredSessions]
    .sort((a, b) => b.parsedDate - a.parsedDate)
    .slice(0, 8)
    .map((session) => {
      const patient = patientLookup.get(session.patientId);
      const history = scoredSessions
        .filter((item) => item.patientId === session.patientId && item.parsedDate <= session.parsedDate)
        .sort((a, b) => a.parsedDate - b.parsedDate)
        .slice(-4);
      return {
        id: session.id,
        patient_id: session.patientId,
        patient_name: patient?.fullName ?? "Unknown patient",
        patient_code: patient?.patientCode ?? "",
        date: session.dateISO ?? session.date,
        test_type: session.testType,
        vision_condition: session.condition,
        balance_score: session.score,
        status: session.status,
        score_history: history.map((item, index) => ({ label: `S${index + 1}`, score: item.score })),
      };
    });
  const noRecentCount = patients.filter((patient) => {
    const latestSession = latestByPatient.get(patient.id);
    return !latestSession || latestSession.parsedDate < monthAgo;
  }).length;
  return {
    kpis: {
      total_patients: patients.length,
      active_patients: patients.filter((patient) => latestByPatient.has(patient.id)).length,
      average_score: avgScore,
      sessions_today: scoredSessions.filter((session) => dateKey(session.parsedDate) === todayKey).length,
      sessions_this_week: scoredSessions.filter((session) => session.parsedDate >= weekAgo).length,
      follow_up_queue: patients.filter((p) => ["Follow-up", "Declining"].includes(p.status) || Number(p.latestScore) < 65).length + noRecentCount,
      trend_direction: trendValue >= 0 ? "up" : "down",
      trend_value: Math.abs(trendValue),
      declining_count: patients.filter((p) => p.status === "Declining").length,
      no_recent_count: noRecentCount,
      score_sparkline: buildWeeklyTrend(scoredSessions, 8),
      weekly_bars: buildDailyBars(scoredSessions, 7),
    },
    clinicTrend: buildWeeklyTrend(scoredSessions, 12),
    statusDonut: Object.entries(statusColors).map(([name, color]) => ({ name, color, value: patients.filter((patient) => (patient.status ?? "No sessions") === name).length })),
    scoreDistribution: buildScoreDistribution(latestScores),
    pathologyBreakdown: Object.entries(groupCount(patients.map((patient) => patient.pathology ?? "Unspecified"))).map(([pathology, count]) => ({ pathology, count })),
    recentAssessments: latest,
  };
}

function normalizeRehabData(rehabSessions) {
  const chronological = [...rehabSessions]
    .sort((a, b) => new Date(a.createdAt ?? a.created_at ?? a.date ?? 0) - new Date(b.createdAt ?? b.created_at ?? b.date ?? 0))
    .slice(-12);
  const trend = chronological.map((session, index) => {
    const duration = Number(session.durationSeconds ?? session.duration_seconds ?? 60);
    return {
      label: `R${index + 1}`,
      score: Number(session.score ?? 0),
      stability: Number(session.stability ?? session.score ?? 0),
      duration_score: Math.min(100, Math.round((duration / 120) * 100)),
    };
  });
  const scores = rehabSessions.map((session) => Number(session.score)).filter(Number.isFinite);
  return {
    trend,
    averageScore: average(scores),
    bestScore: scores.length ? Math.max(...scores) : null,
    gameMix: Object.entries(groupCount(rehabSessions.map((session) => session.gameType ?? session.game_type ?? "Rehab game")))
      .map(([game, count]) => ({ game, count })),
  };
}

function parseSessionDate(session) {
  const raw = session.dateISO ?? session.createdAt ?? session.created_at ?? session.date;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function buildDailyBars(sessions, days) {
  const now = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (days - index - 1));
    const key = dateKey(date);
    return {
      label: date.toLocaleDateString(getDateLocale(), { weekday: "short" }),
      date: key,
      count: sessions.filter((session) => dateKey(session.parsedDate) === key).length,
    };
  });
}

function buildWeeklyTrend(sessions, weeks) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - (weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, index) => {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + index * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const scores = sessions
      .filter((session) => session.parsedDate >= weekStart && session.parsedDate < weekEnd)
      .map((session) => session.score);
    return {
      week_label: weekStart.toLocaleDateString(getDateLocale(), { month: "short", day: "numeric" }),
      avg_score: average(scores),
      median_score: median(scores),
      session_count: scores.length,
    };
  });
}

function buildScoreDistribution(scores) {
  const bins = [
    ["0-20", 0, 20],
    ["20-40", 20, 40],
    ["40-60", 40, 60],
    ["60-80", 60, 80],
    ["80-100", 80, 101],
  ];
  return bins.map(([range_label, low, high]) => ({
    range_label,
    count: scores.filter((score) => score >= low && score < high).length,
  }));
}

function median(values) {
  const clean = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  const value = clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
  return Math.round(value * 10) / 10;
}

function trendSummary(rows) {
  const scored = rows.filter((row) => row.avg_score != null);
  const best = scored.length ? Math.max(...scored.map((row) => row.avg_score)).toFixed(1) : "-";
  const mostActive = rows.length ? Math.max(...rows.map((row) => row.session_count ?? 0)) : 0;
  const trend = scored.length >= 2 ? Math.round((scored[scored.length - 1].avg_score - scored[0].avg_score) * 10) / 10 : 0;
  return { best, mostActive, trend };
}

function groupCount(values) {
  return values.reduce((acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }), {});
}

function severityColor(score, status) {
  if (status === "Declining" || Number(score) < 50) return "#F94144";
  if (status === "Follow-up" || Number(score) < 65) return "#F8961E";
  if (Number(score) < 75) return "#F9C74F";
  if (status === "Improving") return "#43AA8B";
  return "#90BE6D";
}

function queueColor(value) {
  if (value > 5) return "#F94144";
  if (value > 2) return "#F8961E";
  return "#43AA8B";
}

function average(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  return clean.length ? Math.round((clean.reduce((a, b) => a + b, 0) / clean.length) * 10) / 10 : null;
}

function formatNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 10) / 10 : "-";
}

function valueUnit(dataKey) {
  if (String(dataKey).includes("score")) return "pts";
  if (String(dataKey).includes("count")) return "sessions";
  return "";
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString(getDateLocale(), { month: "short", day: "numeric" });
}


