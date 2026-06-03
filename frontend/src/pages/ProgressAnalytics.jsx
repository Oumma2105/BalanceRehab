import { useMemo, useState } from "react";

import { ClinicalCard } from "../components/clinical/ClinicalCard";
import { EmptyState } from "../components/clinical/EmptyState";
import { MiniBarChart } from "../components/clinical/MiniBarChart";
import { MiniLineChart } from "../components/clinical/MiniLineChart";
import { SectionHeader } from "../components/clinical/SectionHeader";
import { StatusBadge } from "../components/clinical/StatusBadge";

export function ProgressAnalyticsPage({ t, patients, sessions }) {
  const [patientId, setPatientId] = useState(patients[0]?.id ?? null);
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
