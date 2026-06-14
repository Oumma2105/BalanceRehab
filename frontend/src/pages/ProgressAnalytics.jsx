import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ClinicalCard } from "../components/clinical/ClinicalCard";
import { EmptyState } from "../components/clinical/EmptyState";
import { MiniBarChart } from "../components/clinical/MiniBarChart";
import { MiniLineChart } from "../components/clinical/MiniLineChart";
import { SectionHeader } from "../components/clinical/SectionHeader";
import { StatusBadge } from "../components/clinical/StatusBadge";

export function ProgressAnalyticsPage({ t, patients, sessions }) {
  const [patientId, setPatientId] = useState(patients[0]?.id ?? null);
  const [scoreSort, setScoreSort] = useState("desc");
  const selectedPatient = patients.find((patient) => patient.id === Number(patientId));
  const patientSessions = useMemo(
    () => sessions.filter((session) => session.patientId === Number(patientId)).slice().reverse(),
    [sessions, patientId],
  );

  const lineData = patientSessions.map((session, index) => ({
    label: `S${index + 1}`,
    value: session.totalScore,
  }));
  const latest = patientSessions[patientSessions.length - 1];
  const first = patientSessions[0];
  const improvement = latest && first ? latest.totalScore - first.totalScore : 0;
  const metricTrendData = patientSessions.map((session, index) => ({
    label: `S${index + 1}`,
    trunkDeviation: getMetric(session, "trunkDeviation"),
    shoulderAsymmetry: getMetric(session, "shoulderAsymmetry"),
    hipAsymmetry: getMetric(session, "hipAsymmetry"),
    bodyCenterDeviation: getMetric(session, "bodyCenterDeviation"),
  }));
  const bestSessionId = patientSessions.reduce((best, session) => (!best || session.totalScore > best.totalScore ? session : best), null)?.id;
  const worstSessionId = patientSessions.reduce((worst, session) => (!worst || session.totalScore < worst.totalScore ? session : worst), null)?.id;
  const sortedHistory = patientSessions
    .slice()
    .sort((a, b) => (scoreSort === "desc" ? b.totalScore - a.totalScore : a.totalScore - b.totalScore));
  const trunkChange = latest && first ? getMetric(latest, "trunkDeviation") - getMetric(first, "trunkDeviation") : 0;
  const trunkTrend =
    Math.abs(trunkChange) <= 0.5
      ? "remained stable"
      : trunkChange < 0
        ? "improved"
        : "worsened";

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-3xl font-semibold text-rehab-ink">{t.progressAnalytics}</h1>
        <p className="mt-2 text-sm text-rehab-muted">{t.progressSubtitle}</p>
      </section>

      <ClinicalCard className="p-5">
        <label className="text-sm font-semibold">
          {t.patient}
          <select
            value={patientId ?? ""}
            onChange={(event) => setPatientId(Number(event.target.value))}
            className="mt-1 block w-full max-w-md rounded-lg border border-rehab-line px-3 py-2 font-normal"
          >
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.fullName} - {patient.patientCode}
              </option>
            ))}
          </select>
        </label>
      </ClinicalCard>

      {patientSessions.length === 0 ? (
        <EmptyState
          title={t.progressEmptyTitle}
          description={t.progressEmptyDesc}
        />
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <Summary label={t.latestScore} value={`${latest.totalScore}/100`} />
            <Summary label={t.sessionsSaved} value={patientSessions.length} />
            <Summary label={t.scoreChange} value={`${improvement >= 0 ? "+" : ""}${improvement} pts`} />
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <ClinicalCard className="p-5">
              <SectionHeader title={t.scoreEvolution} description={`${t.savedAssessmentsFor} ${selectedPatient?.fullName}.`} />
              <div className="mt-5">
                <MiniLineChart data={lineData.length > 1 ? lineData : [...lineData, { label: "Next", value: lineData[0]?.value ?? 0 }]} color="#577590" />
              </div>
            </ClinicalCard>

            <ClinicalCard className="p-5">
              <SectionHeader title={t.staticVsDynamic} description={t.averageScoreByTestType} />
              <div className="mt-5">
                <MiniBarChart
                  data={[
                    { label: "Static", value: average(patientSessions.filter((s) => s.testType === "Static")), color: "#90BE6D" },
                    { label: "Dynamic", value: average(patientSessions.filter((s) => s.testType === "Dynamic")), color: "#577590" },
                  ]}
                />
              </div>
            </ClinicalCard>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <MetricTrendChart title="Trunk Deviation" data={metricTrendData} dataKey="trunkDeviation" threshold={8} unit="deg" />
            <MetricTrendChart title="Shoulder Asymmetry" data={metricTrendData} dataKey="shoulderAsymmetry" threshold={5} unit="%" />
            <MetricTrendChart title="Hip Asymmetry" data={metricTrendData} dataKey="hipAsymmetry" threshold={5} unit="%" />
            <MetricTrendChart title="Body Center Deviation" data={metricTrendData} dataKey="bodyCenterDeviation" threshold={9} unit="%" />
          </section>

          <ClinicalCard className="p-5">
            <SectionHeader title="Session History" description="Detailed saved assessment history for the selected patient." />
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-rehab-line text-xs uppercase tracking-wide text-rehab-muted">
                    <th className="px-3 py-3 font-semibold">#</th>
                    <th className="px-3 py-3 font-semibold">Date</th>
                    <th className="px-3 py-3 font-semibold">Test</th>
                    <th className="px-3 py-3 font-semibold">Condition</th>
                    <th className="px-3 py-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => setScoreSort((current) => (current === "desc" ? "asc" : "desc"))}
                        className="font-semibold text-rehab-ink"
                      >
                        Score {scoreSort === "desc" ? "↓" : "↑"}
                      </button>
                    </th>
                    <th className="px-3 py-3 font-semibold">Posture</th>
                    <th className="px-3 py-3 font-semibold">Trunk Dev</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHistory.map((session, index) => (
                    <tr key={session.id} className={historyRowClass(session, index, bestSessionId, worstSessionId)}>
                      <td className="px-3 py-3 font-semibold">{index + 1}</td>
                      <td className="px-3 py-3 text-rehab-muted">{session.date}</td>
                      <td className="px-3 py-3">{session.testType}</td>
                      <td className="px-3 py-3">{session.condition}</td>
                      <td className="px-3 py-3 font-semibold">{session.totalScore}/100</td>
                      <td className="px-3 py-3">{getMetric(session, "postureScore")}/100</td>
                      <td className="px-3 py-3">{getMetric(session, "trunkDeviation")}°</td>
                      <td className="px-3 py-3">
                        <StatusBadge tone={session.status === "Declining" ? "danger" : session.status === "Follow-up" ? "warning" : "connected"}>
                          {session.status}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="rounded-lg border border-rehab-line bg-white px-3 py-1.5 text-xs font-semibold text-rehab-ink transition hover:bg-slate-50"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ClinicalCard>

          <ClinicalCard className="p-5">
            <SectionHeader title="Improvement Summary" description="Automatically generated from saved sessions." />
            <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-rehab-ink">
              Over {patientSessions.length} sessions, {selectedPatient?.fullName} has shown {improvement >= 0 ? "+" : ""}
              {improvement} points change in overall stability score. Trunk deviation has {trunkTrend}. {latest?.postureScore ?? getMetric(latest, "postureScore")} / 100 in most recent session.
            </p>
          </ClinicalCard>

          <ClinicalCard className="p-5">
            <SectionHeader title={t.followUpAlerts} description={t.followUpAlertsDesc} />
            <div className="mt-4 grid gap-3">
              {patientSessions
                .filter((session) => session.status !== "Stable")
                .map((session) => (
                  <div key={session.id} className="flex items-center justify-between rounded-lg border border-rehab-line p-4">
                    <div>
                      <p className="font-semibold">{session.date}</p>
                      <p className="text-sm text-rehab-muted">{session.testType} - {session.condition}</p>
                    </div>
                    <StatusBadge tone={session.status === "Declining" ? "danger" : "warning"}>{session.status}</StatusBadge>
                  </div>
                ))}
            </div>
          </ClinicalCard>
        </>
      )}
    </div>
  );
}

function Summary({ label, value }) {
  return (
    <ClinicalCard className="p-5">
      <p className="text-sm text-rehab-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </ClinicalCard>
  );
}

function average(items) {
  if (!items.length) return 0;
  return Math.round(items.reduce((sum, item) => sum + item.totalScore, 0) / items.length);
}

function MetricTrendChart({ title, data, dataKey, threshold, unit }) {
  const maxValue = Math.max(threshold + 3, ...data.map((item) => Number(item[dataKey] ?? 0))) + 2;

  return (
    <ClinicalCard className="p-5">
      <p className="font-semibold text-rehab-ink">{title}</p>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 14, left: -18, bottom: 4 }}>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
            <ReferenceArea y1={0} y2={threshold} fill="#90BE6D" fillOpacity={0.12} />
            <ReferenceArea y1={threshold} y2={maxValue} fill="#F8961E" fillOpacity={0.12} />
            <XAxis dataKey="label" tick={{ fill: "#577590", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              domain={[0, maxValue]}
              tick={{ fill: "#577590", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(value) => `${value}${unit}`}
            />
            <Tooltip formatter={(value) => [`${value}${unit}`, title]} labelFormatter={(label) => `Session ${label.replace("S", "")}`} />
            <ReferenceLine y={threshold} stroke="#F8961E" strokeDasharray="5 5" />
            <Area type="monotone" dataKey={dataKey} stroke="#577590" strokeWidth={2} fill="#577590" fillOpacity={0.08} dot={{ r: 3, fill: "#577590" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-rehab-muted">Lower is better. Attention threshold: {threshold}{unit}.</p>
    </ClinicalCard>
  );
}

function historyRowClass(session, index, bestSessionId, worstSessionId) {
  if (session.id === bestSessionId) return "border-b border-rehab-line bg-emerald-50";
  if (session.id === worstSessionId) return "border-b border-rehab-line bg-rose-50";
  return `border-b border-rehab-line ${index % 2 === 0 ? "bg-white" : "bg-slate-50"}`;
}

function getMetric(session, key) {
  if (!session) return 0;
  const value = session[key] ?? session.results?.[key] ?? 0;
  return Math.round(Number(value) * 10) / 10;
}
