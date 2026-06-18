import { useEffect, useMemo, useState } from "react";
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
import { Search } from "lucide-react";

import { ClinicalCard } from "../components/clinical/ClinicalCard";
import { EmptyState } from "../components/clinical/EmptyState";
import { MiniBarChart } from "../components/clinical/MiniBarChart";
import { MiniLineChart } from "../components/clinical/MiniLineChart";
import { SectionHeader } from "../components/clinical/SectionHeader";
import { StatusBadge } from "../components/clinical/StatusBadge";

export function ProgressAnalyticsPage({ t, patients, sessions, onLoadPatientProgress }) {
  const [patientId, setPatientId] = useState(patients[0]?.id ?? null);
  const [patientSearch, setPatientSearch] = useState("");
  const [scoreSort, setScoreSort] = useState("desc");
  const [backendProgress, setBackendProgress] = useState(null);

  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients;
    const q = patientSearch.toLowerCase();
    return patients.filter(
      (p) => p.fullName?.toLowerCase().includes(q) || p.patientCode?.toLowerCase().includes(q),
    );
  }, [patients, patientSearch]);

  const selectedPatient = patients.find((patient) => patient.id === Number(patientId));
  const patientSessions = useMemo(
    () => sessions.filter((session) => session.patientId === Number(patientId)).slice().reverse(),
    [sessions, patientId],
  );

  useEffect(() => {
    let cancelled = false;
    setBackendProgress(null);

    async function loadProgress() {
      if (!patientId || !onLoadPatientProgress) return;
      const progress = await onLoadPatientProgress(Number(patientId));
      if (!cancelled) setBackendProgress(progress);
    }

    loadProgress();
    return () => { cancelled = true; };
  }, [patientId, onLoadPatientProgress]);

  const lineData = patientSessions.map((session, index) => ({
    label: `S${index + 1}`,
    value: session.totalScore,
  }));
  const latest = patientSessions[patientSessions.length - 1];
  const first = patientSessions[0];
  const improvement = backendProgress?.score_change ?? (latest && first ? latest.totalScore - first.totalScore : 0);
  const metricTrendData = backendProgress?.trend?.length
    ? backendProgress.trend.map((point) => ({
        label: point.label,
        trunkDeviation: point.trunk_deviation ?? 0,
        shoulderAsymmetry: point.shoulder_asymmetry ?? 0,
        hipAsymmetry: point.hip_asymmetry ?? 0,
        bodyCenterDeviation: point.body_center_deviation ?? 0,
      }))
    : patientSessions.map((session, index) => ({
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
    Math.abs(trunkChange) <= 0.5 ? "remained stable" : trunkChange < 0 ? "improved" : "worsened";

  return (
    <div className="space-y-4">
      {/* Patient selector — below xl */}
      <div className="xl:hidden">
        <select
          value={patientId ?? ""}
          onChange={(e) => setPatientId(Number(e.target.value))}
          className="w-full rounded-lg border border-rehab-line bg-white py-2.5 px-3 text-sm font-semibold text-rehab-ink outline-none focus:border-rehab-teal"
        >
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.fullName}{patient.patientCode ? ` (${patient.patientCode})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Main layout: left panel + right content */}
      <div className="flex items-start gap-5">
        {/* Left: patient roster — xl only */}
        <aside className="hidden w-64 shrink-0 xl:flex xl:flex-col xl:gap-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rehab-muted" />
            <input
              type="search"
              placeholder={t.searchPatient ?? "Search patient…"}
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              className="w-full rounded-lg border border-rehab-line bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-rehab-teal"
            />
          </div>
          <div className="overflow-y-auto rounded-xl border border-rehab-line bg-white" style={{ maxHeight: "calc(100vh - 14rem)" }}>
            {filteredPatients.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-rehab-muted">{t.noResults ?? "No patients found"}</p>
            ) : (
              filteredPatients.map((patient) => {
                const isSelected = Number(patientId) === patient.id;
                const score = Number(patient.latestScore);
                const scoreColor =
                  score >= 80 ? "#43AA8B" :
                  score >= 70 ? "#90BE6D" :
                  score >= 60 ? "#F8961E" :
                  "#F94144";
                return (
                  <button
                    type="button"
                    key={patient.id}
                    onClick={() => setPatientId(patient.id)}
                    className={`flex w-full items-center gap-3 border-b border-rehab-line px-3 py-3 text-left transition last:border-b-0 cursor-pointer ${
                      isSelected ? "bg-rehab-teal" : "hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-semibold text-white ${
                        isSelected ? "bg-white/20" : "bg-rehab-blue"
                      }`}
                    >
                      {initials(patient.fullName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-semibold ${isSelected ? "text-white" : "text-rehab-ink"}`}>
                        {patient.fullName}
                      </p>
                      <p className={`text-xs ${isSelected ? "text-white/70" : "text-rehab-muted"}`}>
                        {patient.patientCode}
                      </p>
                    </div>
                    {Number.isFinite(score) && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${isSelected ? "bg-white/20 text-white" : ""}`}
                        style={!isSelected ? { backgroundColor: `${scoreColor}22`, color: scoreColor } : {}}
                      >
                        {score}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right: analytics content */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Selected patient header */}
          {selectedPatient && (() => {
            const headerScore = Number(selectedPatient.latestScore);
            const headerColor =
              headerScore >= 80 ? "#43AA8B" :
              headerScore >= 70 ? "#90BE6D" :
              headerScore >= 60 ? "#F8961E" :
              Number.isFinite(headerScore) ? "#F94144" : "#277DA1";
            return (
              <div className="flex items-center gap-3 rounded-xl border-l-4 bg-white p-4 shadow-card" style={{ borderLeftColor: headerColor }}>
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ backgroundColor: headerColor }}>
                  {initials(selectedPatient.fullName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-rehab-ink">{selectedPatient.fullName}</p>
                  <p className="text-sm text-rehab-muted">
                    {selectedPatient.patientCode}
                    {selectedPatient.pathology ? ` · ${selectedPatient.pathology}` : ""}
                  </p>
                </div>
                {Number.isFinite(headerScore) && (
                  <span className="shrink-0 rounded-full px-3 py-1 text-sm font-bold text-white" style={{ backgroundColor: headerColor }}>
                    {headerScore}/100
                  </span>
                )}
                <StatusBadge
                  tone={
                    selectedPatient.status === "Declining" ? "danger" :
                    selectedPatient.status === "Follow-up" ? "warning" :
                    selectedPatient.status === "Improving" ? "connected" : "active"
                  }
                >
                  {statusLabel(t, selectedPatient.status)}
                </StatusBadge>
              </div>
            );
          })()}

          {patientSessions.length === 0 ? (
            <EmptyState title={t.progressEmptyTitle} description={t.progressEmptyDesc} />
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-3">
                <Summary label={t.latestScore} value={`${backendProgress?.latest_score ?? latest.totalScore}/100`} color="#277DA1" />
                <Summary label={t.sessionsSaved} value={backendProgress?.session_count ?? patientSessions.length} color="#43AA8B" />
                <Summary label={t.scoreChange} value={`${improvement >= 0 ? "+" : ""}${improvement} pts`} color={improvement > 0 ? "#90BE6D" : improvement < 0 ? "#F94144" : "#577590"} />
              </section>

              {patientSessions.length < 2 ? (
                <ClinicalCard className="p-5">
                  <EmptyState title={t.progressTrendsPendingTitle} description={t.progressTrendsPendingDesc} />
                </ClinicalCard>
              ) : (
                <>
                  <section className="grid gap-5 xl:grid-cols-2">
                    <ClinicalCard className="p-5">
                      <SectionHeader title={t.scoreEvolution} description={`${t.savedAssessmentsFor} ${selectedPatient?.fullName}.`} />
                      <div className="mt-5">
                        <MiniLineChart data={lineData} color="#577590" />
                      </div>
                    </ClinicalCard>

                    <ClinicalCard className="p-5">
                      <SectionHeader title={t.staticVsDynamic} description={t.averageScoreByTestType} />
                      <div className="mt-5">
                        <MiniBarChart
                          data={[
                            { label: t.staticTest, value: backendProgress?.static_average ?? average(patientSessions.filter((s) => s.testType === "Static")), color: "#90BE6D" },
                            { label: t.dynamicTest, value: backendProgress?.dynamic_average ?? average(patientSessions.filter((s) => s.testType === "Dynamic")), color: "#577590" },
                          ]}
                        />
                      </div>
                    </ClinicalCard>
                  </section>

                  <section className="grid gap-5 xl:grid-cols-2">
                    <MetricTrendChart t={t} title={t.trunkDeviation} data={metricTrendData} dataKey="trunkDeviation" threshold={8} unit="deg" />
                    <MetricTrendChart t={t} title={t.shoulderAsymmetry} data={metricTrendData} dataKey="shoulderAsymmetry" threshold={5} unit="%" />
                    <MetricTrendChart t={t} title={t.hipAsymmetry} data={metricTrendData} dataKey="hipAsymmetry" threshold={5} unit="%" />
                    <MetricTrendChart t={t} title={t.bodyCenterDeviation} data={metricTrendData} dataKey="bodyCenterDeviation" threshold={9} unit="%" />
                  </section>
                </>
              )}

              <ClinicalCard className="p-5">
                <SectionHeader title={t.sessionHistory} description={t.sessionHistoryDesc} />
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[860px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-rehab-line text-xs uppercase tracking-wide text-rehab-muted">
                        <th className="px-3 py-3 font-semibold">#</th>
                        <th className="px-3 py-3 font-semibold">{t.date}</th>
                        <th className="px-3 py-3 font-semibold">{t.test}</th>
                        <th className="px-3 py-3 font-semibold">{t.conditions}</th>
                        <th className="px-3 py-3 font-semibold">
                          <button
                            type="button"
                            onClick={() => setScoreSort((current) => (current === "desc" ? "asc" : "desc"))}
                            className="font-semibold text-rehab-ink"
                          >
                            {t.score} {scoreSort === "desc" ? "↓" : "↑"}
                          </button>
                        </th>
                        <th className="px-3 py-3 font-semibold">{t.posture}</th>
                        <th className="px-3 py-3 font-semibold">{t.trunkDev}</th>
                        <th className="px-3 py-3 font-semibold">{t.status}</th>
                        <th className="px-3 py-3 font-semibold">{t.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedHistory.map((session, index) => (
                        <tr key={session.id} className={historyRowClass(session, index, bestSessionId, worstSessionId)}>
                          <td className="px-3 py-3 font-semibold">{index + 1}</td>
                          <td className="px-3 py-3 text-rehab-muted">{session.date}</td>
                          <td className="px-3 py-3">{testTypeLabel(t, session.testType)}</td>
                          <td className="px-3 py-3">{conditionLabel(t, session.condition)}</td>
                          <td className="px-3 py-3 font-semibold">{session.totalScore}/100</td>
                          <td className="px-3 py-3">{getMetric(session, "postureScore")}/100</td>
                          <td className="px-3 py-3">{getMetric(session, "trunkDeviation")} deg</td>
                          <td className="px-3 py-3">
                            <StatusBadge tone={session.status === "Declining" ? "danger" : session.status === "Follow-up" ? "warning" : "connected"}>
                              {statusLabel(t, session.status)}
                            </StatusBadge>
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              className="rounded-lg border border-rehab-line bg-white px-3 py-1.5 text-xs font-semibold text-rehab-ink transition hover:bg-slate-50"
                            >
                              {t.view}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ClinicalCard>

              <ClinicalCard className="p-5">
                <SectionHeader title={t.improvementSummary} description={t.improvementSummaryDesc} />
                <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-rehab-ink">
                  {template(t.pointsChangeSummary, {
                    count: patientSessions.length,
                    patient: selectedPatient?.fullName,
                    change: `${improvement >= 0 ? "+" : ""}${improvement}`,
                    trend: trendLabel(t, trunkTrend),
                    postureScore: backendProgress?.trend?.at(-1)?.posture_score ?? latest?.postureScore ?? getMetric(latest, "postureScore"),
                  })}
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
                          <p className="text-sm text-rehab-muted">{testTypeLabel(t, session.testType)} - {conditionLabel(t, session.condition)}</p>
                        </div>
                        <StatusBadge tone={session.status === "Declining" ? "danger" : "warning"}>{statusLabel(t, session.status)}</StatusBadge>
                      </div>
                    ))}
                </div>
              </ClinicalCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function initials(name = "") {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function Summary({ label, value, color }) {
  return (
    <div className="rounded-xl p-5 text-white shadow-card" style={{ backgroundColor: color }}>
      <p className="text-sm font-medium text-white/75">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

function average(items) {
  if (!items.length) return 0;
  return Math.round(items.reduce((sum, item) => sum + item.totalScore, 0) / items.length);
}

function MetricTrendChart({ t, title, data, dataKey, threshold, unit }) {
  const maxValue = Math.max(threshold + 3, ...data.map((item) => Number(item[dataKey] ?? 0))) + 2;
  const latestValue = data.length ? Number(data[data.length - 1]?.[dataKey] ?? 0) : 0;
  const areaColor = latestValue <= threshold ? "#43AA8B" : latestValue <= threshold * 1.5 ? "#F8961E" : "#F94144";

  return (
    <ClinicalCard className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-rehab-ink">{title}</p>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${areaColor}20`, color: areaColor }}>
          {latestValue <= threshold ? (t.withinRange ?? "Within range") : (t.attention ?? "Attention")} · {data.length ? `${latestValue}${unit}` : "-"}
        </span>
      </div>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 14, left: -18, bottom: 4 }}>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
            <ReferenceArea y1={0} y2={threshold} fill="#43AA8B" fillOpacity={0.15} />
            <ReferenceArea y1={threshold} y2={maxValue} fill="#F8961E" fillOpacity={0.15} />
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
            <ReferenceLine y={threshold} stroke="#F8961E" strokeWidth={1.5} strokeDasharray="5 5" />
            <Area type="monotone" dataKey={dataKey} stroke={areaColor} strokeWidth={3} fill={areaColor} fillOpacity={0.12} dot={{ r: 4, fill: areaColor, strokeWidth: 0 }} activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-rehab-muted">{t.lowerIsBetter} {t.attentionThreshold}: {threshold}{unit}.</p>
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

function trendLabel(t, trend) {
  const labels = {
    "remained stable": t.remainedStable,
    improved: t.improved,
    worsened: t.worsened,
  };
  return labels[trend] ?? trend;
}

function template(text = "", values = {}) {
  return Object.entries(values).reduce((current, [key, value]) => current.replaceAll(`{${key}}`, value ?? ""), text);
}
