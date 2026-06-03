import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Save, Search } from "lucide-react";

import { Button } from "../components/clinical/Button";
import { ClinicalCard } from "../components/clinical/ClinicalCard";
import { ClinicalTable } from "../components/clinical/ClinicalTable";
import { ContextStrip } from "../components/clinical/ContextStrip";
import { EmptyState } from "../components/clinical/EmptyState";
import { SectionHeader } from "../components/clinical/SectionHeader";
import { StatusBadge } from "../components/clinical/StatusBadge";
import { buildSession, generateLiveFrame, simulateAssessmentResults } from "../utils/assessment";
import { downloadSessionReport } from "../utils/report";

export function BalanceAssessmentPage({ t, patients, sessions, onSaveSession, onSaveReport, preselectedPatientId, onClearPreselectedPatient }) {
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedPatientId, setSelectedPatientId] = useState(preselectedPatientId ?? null);
  const [config, setConfig] = useState({
    testType: "static",
    visualCondition: "eyes_open",
    durationSeconds: 30,
    notes: "",
  });
  const [checklist, setChecklist] = useState({
    board: false,
    ring: false,
    webcam: true,
    esp32: true,
    supervision: false,
  });
  const [elapsed, setElapsed] = useState(0);
  const [liveFrame, setLiveFrame] = useState(generateLiveFrame(0));
  const [results, setResults] = useState(null);
  const [savedSession, setSavedSession] = useState(null);
  const [report, setReport] = useState(null);

  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId);
  const steps = [t.selectPatient, t.configureTest, t.preparation, t.liveAssessment, t.results, t.reportStep];

  useEffect(() => {
    if (preselectedPatientId) {
      setSelectedPatientId(preselectedPatientId);
      setWorkflowOpen(true);
      setStep(1);
      onClearPreselectedPatient();
    }
  }, [preselectedPatientId, onClearPreselectedPatient]);

  useEffect(() => {
    if (!workflowOpen || step !== 3 || results) return;

    const timer = window.setInterval(() => {
      setElapsed((current) => {
        const next = current + 1;
        setLiveFrame(generateLiveFrame(next));
        if (next >= config.durationSeconds) {
          window.clearInterval(timer);
          setResults(simulateAssessmentResults(config));
          setStep(4);
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [workflowOpen, step, config, results]);

  const recentSessions = sessions.slice(0, 6);

  if (!workflowOpen) {
    return (
      <div className="space-y-5">
        <section className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-rehab-ink">Balance Assessment</h1>
            <p className="mt-2 text-sm text-rehab-muted">{t.balanceAssessmentDesc}</p>
          </div>
          <Button onClick={() => setWorkflowOpen(true)}>{t.startNewAssessment}</Button>
        </section>

        <ClinicalCard className="p-5">
          <SectionHeader title={t.recentAssessments} description={t.savedSessionsDesc} />
          <div className="mt-5">
            {recentSessions.length === 0 ? (
              <EmptyState
                title={t.performFirstAssessment}
                description={t.completedSessionsAppear}
                actionLabel={t.startAssessment}
                onAction={() => setWorkflowOpen(true)}
              />
            ) : (
              <ClinicalTable
                columns={[t.patient, t.date, t.test, t.conditions, t.score, t.status]}
                rows={recentSessions}
                renderRow={(session) => (
                  <tr key={session.id}>
                    <td className="px-4 py-3 font-semibold">{session.patient}</td>
                    <td className="px-4 py-3 text-rehab-muted">{session.date}</td>
                    <td className="px-4 py-3">{session.testType}</td>
                    <td className="px-4 py-3">{session.condition}</td>
                    <td className="px-4 py-3 font-semibold">{session.totalScore}/100</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={session.status === "Declining" ? "danger" : session.status === "Follow-up" ? "warning" : "connected"}>
                        {session.status}
                      </StatusBadge>
                    </td>
                  </tr>
                )}
              />
            )}
          </div>
        </ClinicalCard>
      </div>
    );
  }

  const canStart = Object.values(checklist).every(Boolean);
  const currentStepLabel = `${step + 1} of 6 - ${steps[step]}`;

  return (
    <div className="space-y-5">
      <ContextStrip
        patient={selectedPatient}
        status={results ? "Completed" : step === 3 ? "In progress" : "Draft"}
        step={currentStepLabel}
        nextAction={step < 5 ? steps[Math.min(step + 1, 5)] : t.downloadReport}
      />

      <ClinicalCard className="p-4">
        <div className="grid gap-2 md:grid-cols-6">
          {steps.map((item, index) => (
            <div key={item} className={`rounded-lg px-3 py-2 text-sm font-semibold ${index === step ? "bg-rehab-teal text-white" : index < step ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-rehab-muted"}`}>
              {index + 1}. {item}
            </div>
          ))}
        </div>
      </ClinicalCard>

      {step === 0 ? (
        <SelectPatientStep t={t} patients={patients} selectedPatientId={selectedPatientId} onSelect={setSelectedPatientId} onContinue={() => setStep(1)} />
      ) : null}

      {step === 1 ? (
        <ConfigureStep t={t} config={config} onChange={setConfig} onBack={() => setStep(0)} onContinue={() => setStep(2)} />
      ) : null}

      {step === 2 ? (
        <PreparationStep t={t} checklist={checklist} onChange={setChecklist} canStart={canStart} onBack={() => setStep(1)} onStart={() => { setElapsed(0); setResults(null); setStep(3); }} />
      ) : null}

      {step === 3 ? (
        <LiveStep t={t} elapsed={elapsed} duration={config.durationSeconds} frame={liveFrame} onEnd={() => { setResults(simulateAssessmentResults(config)); setStep(4); }} />
      ) : null}

      {step === 4 && results ? (
        <ResultsStep
          patient={selectedPatient}
          t={t}
          config={config}
          results={results}
          savedSession={savedSession}
          onSave={() => {
            const session = buildSession({ patient: selectedPatient, config, results });
            onSaveSession(session);
            setSavedSession(session);
          }}
          onReport={() => setStep(5)}
        />
      ) : null}

      {step === 5 && savedSession ? (
        <ReportStep
          patient={selectedPatient}
          t={t}
          session={savedSession}
          report={report}
          onGenerate={() => {
            const newReport = {
              id: `R-${Date.now().toString().slice(-5)}`,
              patientId: selectedPatient.id,
              sessionId: savedSession.id,
              patient: selectedPatient.fullName,
              generatedAt: new Date().toLocaleString(),
              language: "FR",
              acquisitionMode: "Demo",
            };
            onSaveReport(newReport);
            setReport(newReport);
          }}
          onDownload={() => downloadSessionReport({ patient: selectedPatient, session: savedSession })}
          onDone={() => {
            setWorkflowOpen(false);
            setStep(0);
            setResults(null);
            setSavedSession(null);
            setReport(null);
          }}
        />
      ) : null}
    </div>
  );
}

function SelectPatientStep({ t, patients, selectedPatientId, onSelect, onContinue }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.toLowerCase();
    return patients.filter((patient) => `${patient.fullName} ${patient.patientCode} ${patient.pathology}`.toLowerCase().includes(normalized));
  }, [patients, query]);

  return (
    <ClinicalCard className="p-5">
      <SectionHeader title={t.stepSelectPatient} description={t.choosePatientBeforeConfig} />
      <div className="relative mt-5">
        <Search className="absolute left-3 top-3 text-rehab-muted" size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-lg border border-rehab-line py-2.5 pl-10 pr-3" placeholder={t.searchPatient} />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {filtered.map((patient) => (
          <button key={patient.id} type="button" onClick={() => onSelect(patient.id)} className={`rounded-lg border p-4 text-left ${selectedPatientId === patient.id ? "border-rehab-teal bg-teal-50" : "border-rehab-line bg-white"}`}>
            <p className="font-semibold">{patient.fullName}</p>
            <p className="text-sm text-rehab-muted">{patient.patientCode} - {patient.age} years - {patient.pathology}</p>
            {patient.latestScore ? <p className="mt-2 text-sm font-semibold">{t.latestScore}: {patient.latestScore}/100</p> : null}
          </button>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <Button disabled={!selectedPatientId} onClick={onContinue}>{t.continue}</Button>
      </div>
    </ClinicalCard>
  );
}

function ConfigureStep({ t, config, onChange, onBack, onContinue }) {
  return (
    <ClinicalCard className="p-5">
      <SectionHeader title={t.stepConfigureTest} description={t.configureTestDesc} />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Option selected={config.testType === "static"} title={t.staticTest} description={t.staticTestDesc} onClick={() => onChange({ ...config, testType: "static" })} />
        <Option selected={config.testType === "dynamic"} title={t.dynamicTest} description={t.dynamicTestDesc} onClick={() => onChange({ ...config, testType: "dynamic" })} />
        <Option selected={config.visualCondition === "eyes_open"} title={t.eyesOpen} description={t.eyesOpenDesc} onClick={() => onChange({ ...config, visualCondition: "eyes_open" })} />
        <Option selected={config.visualCondition === "eyes_closed"} title={t.eyesClosed} description={t.eyesClosedDesc} onClick={() => onChange({ ...config, visualCondition: "eyes_closed" })} />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">
          {t.duration}
          <select value={config.durationSeconds} onChange={(event) => onChange({ ...config, durationSeconds: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-rehab-line px-3 py-2 font-normal">
            <option value={10}>{t.tenSecondDemo}</option>
            <option value={30}>{t.thirtySeconds}</option>
            <option value={60}>{t.sixtySeconds}</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t.notes}
          <input value={config.notes} onChange={(event) => onChange({ ...config, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-rehab-line px-3 py-2 font-normal" />
        </label>
      </div>
      <Footer t={t} onBack={onBack} onNext={onContinue} nextLabel={t.continueToPreparation} />
    </ClinicalCard>
  );
}

function PreparationStep({ t, checklist, onChange, canStart, onBack, onStart }) {
  const items = [
    ["board", t.boardPositioned],
    ["ring", t.ringConfirmed],
    ["webcam", t.webcamReady],
    ["esp32", t.esp32Ready],
    ["supervision", t.supervisionConfirmed],
  ];
  return (
    <ClinicalCard className="p-5">
      <SectionHeader title={t.stepPreparation} description={t.demoModeActiveData} />
      <div className="mt-5 grid gap-3">
        {items.map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 rounded-lg border border-rehab-line p-3">
            <input type="checkbox" checked={checklist[key]} onChange={(event) => onChange({ ...checklist, [key]: event.target.checked })} />
            <span className="font-medium">{label}</span>
          </label>
        ))}
      </div>
      <Footer t={t} onBack={onBack} onNext={onStart} nextLabel={t.startAssessment} disabled={!canStart} />
    </ClinicalCard>
  );
}

function LiveStep({ t, elapsed, duration, frame, onEnd }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.4fr_0.7fr]">
      <ClinicalCard className="p-5">
        <SectionHeader title={t.stepLiveAssessment} description={t.liveAssessmentDesc} />
        <div className="mt-5 grid min-h-96 place-items-center rounded-lg bg-slate-900 text-white">
          <div className="text-center">
            <div className="mx-auto mb-5 h-40 w-28 rounded-full border-4 border-teal-300" />
            <p className="text-lg font-semibold">{t.simulatedSkeleton}</p>
            <p className="text-sm text-slate-300">{t.webcamLater}</p>
          </div>
        </div>
      </ClinicalCard>
      <ClinicalCard className="p-5">
        <p className="text-sm text-rehab-muted">{t.timer}</p>
        <p className="mt-1 text-4xl font-semibold">{elapsed}s / {duration}s</p>
        <div className="mt-5 grid gap-3">
          <Metric label={t.stabilityScore} value={`${frame.stability}/100`} />
          <Metric label={t.postureScore} value={`${frame.posture}/100`} />
          <Metric label={t.apSway} value={`${frame.apSway} mm`} />
          <Metric label={t.mlSway} value={`${frame.mlSway} mm`} />
        </div>
        <div className="mt-5 rounded-lg bg-amber-50 p-4 text-sm font-semibold text-amber-800">{frame.warning}</div>
        <Button className="mt-5 w-full" onClick={onEnd}>{t.endAssessment}</Button>
      </ClinicalCard>
    </div>
  );
}

function ResultsStep({ t, patient, config, results, savedSession, onSave, onReport }) {
  return (
    <ClinicalCard className="p-5">
      <SectionHeader title={t.stepResults} description={`${t.estimatedIndicatorsFor} ${patient.fullName}.`} />
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Metric label={t.totalBalanceScore} value={`${results.totalBalanceScore}/100`} />
        <Metric label={t.boardStability} value={`${results.boardStabilityScore}/100`} />
        <Metric label={t.postureStability} value={`${results.postureStabilityScore}/100`} />
      </div>
      <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-rehab-muted">{results.interpretation}</div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <MetricsList title={t.swayMetrics} items={[`AP mean: ${results.meanSwayAp} mm`, `ML mean: ${results.meanSwayMl} mm`, `Sway velocity: ${results.swayVelocity} mm/s`, `Instability events: ${results.instabilityEvents}`]} />
        <MetricsList title={t.recommendations} items={results.recommendations} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onSave} disabled={Boolean(savedSession)}>
          <Save size={16} /> {savedSession ? t.sessionSaved : t.saveSession}
        </Button>
        <Button onClick={onReport} disabled={!savedSession}>{t.generatePdfReport}</Button>
      </div>
    </ClinicalCard>
  );
}

function ReportStep({ t, patient, session, report, onGenerate, onDownload, onDone }) {
  return (
    <ClinicalCard className="p-5">
      <SectionHeader title={t.stepReport} description={t.generateDownloadReport} />
      <div className="mt-5 rounded-lg border border-rehab-line bg-slate-50 p-5">
        <p className="font-semibold">{t.reportPreview}</p>
        <p className="mt-2 text-sm text-rehab-muted">{patient.fullName} - {session.testType} - {session.totalScore}/100</p>
        <p className="mt-2 text-sm text-rehab-muted">{session.results.interpretation}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onGenerate} disabled={Boolean(report)}>
          <CheckCircle2 size={16} /> {report ? t.savedToProfile : t.saveReportToProfile}
        </Button>
        <Button onClick={onDownload}>{t.downloadPdf}</Button>
        <Button variant="secondary" onClick={onDone}>{t.finish}</Button>
      </div>
    </ClinicalCard>
  );
}

function Option({ selected, title, description, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg border p-4 text-left ${selected ? "border-rehab-teal bg-teal-50" : "border-rehab-line bg-white"}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-rehab-muted">{description}</p>
    </button>
  );
}

function Footer({ t, onBack, onNext, nextLabel, disabled }) {
  return (
    <div className="mt-5 flex justify-between">
      <Button variant="secondary" onClick={onBack}>{t.back}</Button>
      <Button onClick={onNext} disabled={disabled}>{nextLabel}</Button>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-rehab-line p-4">
      <p className="text-sm text-rehab-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function MetricsList({ title, items }) {
  return (
    <div className="rounded-lg border border-rehab-line p-4">
      <p className="font-semibold">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-rehab-muted">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
