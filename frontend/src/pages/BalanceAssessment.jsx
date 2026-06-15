import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Camera, CheckCircle2, ClipboardCheck, Eye, EyeOff, Gauge, Save, Search, ShieldCheck, Target, Timer, UserRound, Waves } from "lucide-react";
import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "../components/clinical/Button";
import { ClinicalCard } from "../components/clinical/ClinicalCard";
import { ClinicalTable } from "../components/clinical/ClinicalTable";
import { ContextStrip } from "../components/clinical/ContextStrip";
import { EmptyState } from "../components/clinical/EmptyState";
import { SectionHeader } from "../components/clinical/SectionHeader";
import { StatusBadge } from "../components/clinical/StatusBadge";
import { acquisitionModes, createAssessmentSource, getAssessmentSourceOptions } from "../assessment/sources/index.js";
import { buildSession } from "../utils/assessment";
import { WebcamPoseAssessment } from "../webcam/WebcamPoseAssessment.jsx";

export function BalanceAssessmentPage({ t, patients, sessions, onSaveSession, onSaveReport, onDownloadSessionReport, preselectedPatientId, onClearPreselectedPatient, onReturnToPatientProfile, onWorkflowFocusChange }) {
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedPatientId, setSelectedPatientId] = useState(preselectedPatientId ?? null);
  const [config, setConfig] = useState({
    acquisitionMode: acquisitionModes.webcam,
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
  const [countdown, setCountdown] = useState(null);
  const [liveFrame, setLiveFrame] = useState(() => createAssessmentSource({ mode: acquisitionModes.webcam, config: { acquisitionMode: acquisitionModes.webcam }, t }).getFrame(0));
  const [webcamStream, setWebcamStream] = useState(null);
  const [sourceError, setSourceError] = useState("");
  const [results, setResults] = useState(null);
  const [savedSession, setSavedSession] = useState(null);
  const [report, setReport] = useState(null);

  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId);
  const steps = [t.selectPatient, t.configureTest, t.preparation, t.liveAssessment, t.results, t.reportStep];
  const activeSource = useMemo(() => createAssessmentSource({ mode: config.acquisitionMode, config, t }), [config, t]);

  useEffect(() => {
    if (preselectedPatientId) {
      setSelectedPatientId(preselectedPatientId);
      setWorkflowOpen(true);
      setStep(1);
      onClearPreselectedPatient();
    }
  }, [preselectedPatientId, onClearPreselectedPatient]);

  useEffect(() => {
    onWorkflowFocusChange?.(workflowOpen && step === 3);
    return () => onWorkflowFocusChange?.(false);
  }, [workflowOpen, step, onWorkflowFocusChange]);

  useEffect(() => {
    if (step !== 3 || countdown == null) return undefined;
    if (countdown <= 0) {
      setCountdown(null);
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setCountdown((current) => (current == null ? null : current - 1));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [step, countdown]);

  useEffect(() => {
    if (!workflowOpen || step !== 3 || results || countdown != null) return;

    const timer = window.setInterval(() => {
      setElapsed((current) => {
        const next = current + 1;
        setLiveFrame(activeSource.getFrame(next));
        if (next >= config.durationSeconds) {
          window.clearInterval(timer);
              const finalResults = activeSource.getResults();
              activeSource.stop();
              setCountdown(null);
              setWebcamStream(null);
              setResults(finalResults);
              setStep(4);
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [workflowOpen, step, config, results, activeSource, countdown]);

  useEffect(() => {
    return () => {
      activeSource.stop();
    };
  }, [activeSource]);

  const recentSessions = sessions.slice(0, 6);

  if (!workflowOpen) {
    return (
      <div className="space-y-5">
        <section className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-rehab-ink">{t.balanceAssessment}</h1>
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
                    <td className="px-4 py-3">{testTypeLabel(t, session.testType)}</td>
                    <td className="px-4 py-3">{conditionLabel(t, session.condition)}</td>
                    <td className="px-4 py-3 font-semibold">{session.totalScore}/100</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={session.status === "Declining" ? "danger" : session.status === "Follow-up" ? "warning" : "connected"}>
                        {statusLabel(t, session.status)}
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

  const canStart =
    config.acquisitionMode === acquisitionModes.webcam
      ? checklist.webcam && checklist.supervision
      : config.acquisitionMode === acquisitionModes.demo
        ? checklist.webcam && checklist.supervision
      : Object.values(checklist).every(Boolean);
  const currentStepLabel = template(t.stepOfTotal, { current: step + 1, total: 6, step: steps[step] });

  return (
    <div className="space-y-5">
      {step !== 3 ? (
        <>
          <ContextStrip
            patient={selectedPatient}
            status={results ? "Completed" : "Draft"}
            step={currentStepLabel}
            nextAction={step < 5 ? steps[Math.min(step + 1, 5)] : t.downloadReport}
          />

          <ClinicalCard className="overflow-hidden p-0">
            <div className="grid gap-2 md:grid-cols-6">
              {steps.map((item, index) => (
                <div key={item} className={`px-3 py-3 text-sm font-semibold ${index === step ? "bg-rehab-teal text-white" : index < step ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-rehab-muted"}`}>
                  <span className={`mr-2 inline-grid h-6 w-6 place-items-center rounded-full text-xs ${index === step ? "bg-white/20" : index < step ? "bg-emerald-100" : "bg-white"}`}>
                    {index + 1}
                  </span>
                  {" "}
                  {item}
                </div>
              ))}
            </div>
          </ClinicalCard>
        </>
      ) : null}

      {step === 0 ? (
        <SelectPatientStep t={t} patients={patients} selectedPatientId={selectedPatientId} onSelect={setSelectedPatientId} onContinue={() => setStep(1)} />
      ) : null}

      {step === 1 ? (
        <ConfigureStep t={t} config={config} onChange={setConfig} onBack={() => setStep(0)} onContinue={() => setStep(2)} />
      ) : null}

      {step === 2 ? (
        <PreparationStep
          t={t}
          checklist={checklist}
          config={config}
          sourceError={sourceError}
          onChange={setChecklist}
          canStart={canStart}
          onBack={() => setStep(1)}
          onStart={async () => {
            setElapsed(0);
            setResults(null);
            setSourceError("");
            try {
              const stream = await activeSource.start();
              const sourceStream = activeSource.getStream?.() ?? null;
              setWebcamStream(sourceStream || null);
              setLiveFrame(activeSource.getFrame(0));
              setCountdown(3);
              setStep(3);
            } catch (error) {
              setSourceError(error.message || t.webcamPermissionDenied);
            }
          }}
        />
      ) : null}

      {step === 3 ? (
        <LiveStep
          t={t}
          elapsed={elapsed}
          duration={config.durationSeconds}
          countdown={countdown}
          frame={liveFrame}
          config={config}
          webcamStream={webcamStream}
          onPoseMetrics={(metrics) => activeSource.recordPoseMetrics?.(metrics)}
          onEnd={() => {
            const finalResults = activeSource.getResults();
            activeSource.stop();
            setCountdown(null);
            setWebcamStream(null);
            setResults(finalResults);
            setStep(4);
          }}
        />
      ) : null}

      {step === 4 && results ? (
        <ResultsStep
          patient={selectedPatient}
          t={t}
          config={config}
          results={results}
          patientSessions={sessions.filter((session) => session.patientId === selectedPatient.id)}
          savedSession={savedSession}
          onSave={async (clinicalImpression) => {
            const session = buildSession({ patient: selectedPatient, config, results, clinician_impression: clinicalImpression });
            const saved = await onSaveSession(session);
            setSavedSession(saved ?? session);
          }}
          onReport={() => setStep(5)}
          onReturnToProfile={() => onReturnToPatientProfile(selectedPatient.id, "sessions")}
        />
      ) : null}

      {step === 5 && savedSession ? (
        <ReportStep
          patient={selectedPatient}
          t={t}
          session={savedSession}
          report={report}
          onGenerate={async () => {
            const reportId = `R-${Date.now().toString().slice(-5)}`;
            const newReport = {
              id: reportId,
              reportId,
              patientId: selectedPatient.id,
              patientCode: selectedPatient.patientCode,
              sessionId: savedSession.id,
              patient: selectedPatient.fullName,
              createdAt: new Date().toISOString(),
              generatedAt: new Date().toLocaleString(),
              downloadable: true,
              language: "FR",
              acquisitionMode: savedSession.acquisitionMode,
              acquisitionModeKey: savedSession.acquisitionModeKey,
              summary: template(t.reportSummaryTemplate, {
                test: testTypeLabel(t, savedSession.testType),
                condition: conditionLabel(t, savedSession.condition),
                score: savedSession.totalScore,
                status: statusLabel(t, savedSession.status),
              }),
            };
            const saved = await onSaveReport(newReport);
            setReport(saved ?? newReport);
          }}
          onDownload={() => onDownloadSessionReport({ patient: selectedPatient, session: savedSession })}
          onReturnToProfile={() => onReturnToPatientProfile(selectedPatient.id, "reports")}
          onDone={() => {
            setWorkflowOpen(false);
            setStep(0);
            setResults(null);
            setCountdown(null);
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
  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId);
  const filtered = useMemo(() => {
    const normalized = query.toLowerCase();
    return patients.filter((patient) => `${patient.fullName} ${patient.patientCode} ${patient.pathology}`.toLowerCase().includes(normalized));
  }, [patients, query]);

  return (
    <ClinicalCard className="p-5">
      <SectionHeader title={t.stepSelectPatient} description={t.choosePatientBeforeConfig} />
      <div className={`sticky top-24 z-10 mt-5 rounded-xl border p-4 shadow-sm backdrop-blur ${selectedPatient ? "border-teal-200 bg-teal-50/95" : "border-rehab-line bg-white/95"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`grid h-11 w-11 place-items-center rounded-xl ${selectedPatient ? "bg-rehab-teal text-white" : "bg-slate-100 text-rehab-muted"}`}>
              <UserRound size={20} />
            </span>
            <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{t.selectedPatient}</p>
            {selectedPatient ? (
              <p className="mt-1 text-sm font-semibold text-rehab-ink">
                {selectedPatient.fullName} / {selectedPatient.patientCode}
                <span className="ml-2 font-normal text-rehab-muted">{selectedPatient.pathology}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-rehab-muted">{t.choosePatientToContinue}</p>
            )}
            </div>
          </div>
          <Button disabled={!selectedPatientId} onClick={onContinue}>{t.continueToConfigureTest}</Button>
        </div>
      </div>
      <div className="relative mt-5">
        <Search className="absolute left-3 top-3 text-rehab-muted" size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-lg border border-rehab-line py-2.5 pl-10 pr-3" placeholder={t.searchPatient} />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {filtered.map((patient) => (
          <button key={patient.id} type="button" onClick={() => onSelect(patient.id)} className={`rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-clinical ${selectedPatientId === patient.id ? "border-rehab-teal bg-teal-50 ring-2 ring-rehab-teal/15" : "border-rehab-line bg-white"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-rehab-blue/10 text-xs font-semibold text-rehab-blue">
                  {initials(patient.fullName)}
                </span>
                <div>
                <p className="font-semibold">{patient.fullName}</p>
                <p className="text-sm text-rehab-muted">{patient.patientCode} - {patient.age} {t.years} - {patient.pathology}</p>
                </div>
              </div>
              <StatusBadge tone={patient.status === "Declining" ? "danger" : patient.status === "Follow-up" ? "warning" : "connected"}>
                {statusLabel(t, patient.status)}
              </StatusBadge>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-rehab-muted sm:grid-cols-2">
              <p><span className="font-semibold text-rehab-ink">{t.clinicalGoal}:</span> {patient.clinicalGoal || "-"}</p>
              <p><span className="font-semibold text-rehab-ink">{t.dominantSide}:</span> {patient.dominantSide || "-"}</p>
            </div>
            {patient.latestScore ? <ScoreBar label={t.latestScore} score={patient.latestScore} /> : null}
          </button>
        ))}
      </div>
    </ClinicalCard>
  );
}

function ConfigureStep({ t, config, onChange, onBack, onContinue }) {
  const sourceOptions = getAssessmentSourceOptions(t);
  const activeOption = sourceOptions.find((option) => option.mode === config.acquisitionMode);

  return (
    <ClinicalCard className="p-5">
      <SectionHeader title={t.stepConfigureTest} description={t.configureTestDesc} />
      <div className="mt-5">
        <p className="mb-3 text-sm font-semibold text-rehab-ink">{t.acquisitionMode}</p>
        <div className="grid gap-3 md:grid-cols-2">
          {sourceOptions.map((option) => (
            <button
              key={option.mode}
              type="button"
              disabled={!option.availableNow}
              onClick={() => option.availableNow && onChange({ ...config, acquisitionMode: option.mode })}
              className={`rounded-xl border p-4 text-left transition hover:shadow-clinical disabled:cursor-not-allowed disabled:opacity-60 ${
                config.acquisitionMode === option.mode ? "border-rehab-teal bg-teal-50 ring-2 ring-rehab-teal/15" : "border-rehab-line bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`grid h-10 w-10 place-items-center rounded-lg ${config.acquisitionMode === option.mode ? "bg-rehab-teal text-white" : "bg-slate-100 text-rehab-blue"}`}>
                    {option.mode === acquisitionModes.webcam ? <Camera size={18} /> : option.mode === acquisitionModes.demo ? <Activity size={18} /> : <Waves size={18} />}
                  </span>
                  <span>
                  <p className="font-semibold">{option.label}</p>
                  <p className="mt-1 text-sm text-rehab-muted">{option.description}</p>
                  </span>
                </div>
                {!option.availableNow ? <StatusBadge tone="neutral">{t.later}</StatusBadge> : null}
              </div>
            </button>
          ))}
        </div>
        {activeOption ? <p className="mt-3 text-sm text-rehab-muted">{activeOption.description}</p> : null}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Option icon={ShieldCheck} selected={config.testType === "static"} title={t.staticTest} description={t.staticTestDesc} onClick={() => onChange({ ...config, testType: "static" })} />
        <Option icon={Waves} selected={config.testType === "dynamic"} title={t.dynamicTest} description={t.dynamicTestDesc} onClick={() => onChange({ ...config, testType: "dynamic" })} />
        <Option icon={Eye} selected={config.visualCondition === "eyes_open"} title={t.eyesOpen} description={t.eyesOpenDesc} onClick={() => onChange({ ...config, visualCondition: "eyes_open" })} />
        <Option icon={EyeOff} selected={config.visualCondition === "eyes_closed"} title={t.eyesClosed} description={t.eyesClosedDesc} onClick={() => onChange({ ...config, visualCondition: "eyes_closed" })} />
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

function PreparationStep({ t, checklist, config, sourceError, onChange, canStart, onBack, onStart }) {
  const items =
    config.acquisitionMode === acquisitionModes.webcam
      ? [
          ["webcam", t.webcamReadyPrimary],
          ["supervision", t.supervisionConfirmed],
        ]
      : config.acquisitionMode === acquisitionModes.demo
        ? [
            ["webcam", t.demoDataSourceActive],
            ["supervision", t.supervisionConfirmed],
          ]
      : [
          ["board", t.boardPositioned],
          ["ring", t.ringConfirmed],
          ["webcam", t.webcamReady],
          ["esp32", config.acquisitionMode === acquisitionModes.demo ? t.esp32Optional : t.esp32Ready],
          ["supervision", t.supervisionConfirmed],
        ];
  return (
    <ClinicalCard className="p-5">
      <SectionHeader
        title={t.stepPreparation}
        description={config.acquisitionMode === acquisitionModes.webcam ? t.webcamModeActiveData : t.demoModeActiveData}
      />
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <SetupChip icon={Camera} label={t.acquisitionMode} value={config.acquisitionMode === acquisitionModes.webcam ? t.webcamBasedAssessment : config.acquisitionMode === acquisitionModes.demo ? t.demoAssessmentMode : config.acquisitionMode} />
        <SetupChip icon={ShieldCheck} label={t.test} value={config.testType === "static" ? t.staticTest : t.dynamicTest} />
        <SetupChip icon={Eye} label={t.conditions} value={config.visualCondition === "eyes_open" ? t.eyesOpen : t.eyesClosed} />
        <SetupChip icon={Timer} label={t.duration} value={`${config.durationSeconds}s`} />
      </div>
      <div className="mt-5 grid gap-3">
        {items.map(([key, label]) => (
          <label key={key} className={`flex items-center gap-3 rounded-xl border p-3 transition ${checklist[key] ? "border-emerald-200 bg-emerald-50" : "border-rehab-line bg-white"}`}>
            <input type="checkbox" checked={checklist[key]} onChange={(event) => onChange({ ...checklist, [key]: event.target.checked })} className="h-4 w-4 accent-rehab-teal" />
            <span className={`grid h-8 w-8 place-items-center rounded-lg ${checklist[key] ? "bg-rehab-green text-white" : "bg-slate-100 text-rehab-muted"}`}>
              <ClipboardCheck size={16} />
            </span>
            <span className="font-medium">{label}</span>
          </label>
        ))}
      </div>
      {sourceError ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          <AlertTriangle size={18} />
          <span>{t.webcamPermissionDenied}</span>
        </div>
      ) : null}
      <Footer t={t} onBack={onBack} onNext={onStart} nextLabel={t.startAssessment} disabled={!canStart} />
    </ClinicalCard>
  );
}

function LiveStep({ t, elapsed, duration, countdown, frame, config, webcamStream, onPoseMetrics, onEnd }) {
  const isWebcamOnly = config.acquisitionMode === acquisitionModes.webcam;
  const isCountingDown = countdown != null;

  return (
    <div className="min-h-screen bg-rehab-bg p-5 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-rehab-teal">{t.liveAssessment}</p>
          <h1 className="text-2xl font-semibold text-rehab-ink">{isCountingDown ? t.assessmentStarting : t.assessmentInProgress}</h1>
        </div>
        <div className="rounded-full bg-[#43AA8B]/10 px-4 py-2 text-sm font-semibold text-[#2F7D67]">
          {isCountingDown ? t.preparePatientStill : `${elapsed}s / ${duration}s`}
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.7fr]">
      <ClinicalCard className="p-5">
        <SectionHeader title={t.stepLiveAssessment} description={t.liveAssessmentDesc} />
        <div className="relative">
          {isWebcamOnly && webcamStream ? (
            <WebcamPoseAssessment t={t} stream={webcamStream} frame={frame} onMetrics={onPoseMetrics} />
          ) : (
            <div className="mt-5 grid min-h-96 place-items-center rounded-lg bg-slate-900 text-white">
            <div className="text-center">
              <div className="mx-auto mb-5 h-40 w-28 rounded-full border-4 border-teal-300" />
              <p className="text-lg font-semibold">{t.simulatedSkeleton}</p>
              <p className="text-sm text-slate-300">{isWebcamOnly ? t.webcamPosePrimary : t.webcamLater}</p>
            </div>
            </div>
          )}
          {isCountingDown ? <CountdownOverlay t={t} value={countdown} /> : null}
        </div>
        {isWebcamOnly ? (
          <p className="mt-3 text-sm text-rehab-muted">{t.mediaPipeActiveHelp}</p>
        ) : null}
      </ClinicalCard>
      <ClinicalCard className="p-5">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-rehab-muted">{isCountingDown ? t.countdown : t.timer}</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-4xl font-semibold text-rehab-ink">{isCountingDown ? countdown : `${elapsed}s`}</p>
            <span className="rounded-full bg-rehab-teal/10 px-3 py-1 text-xs font-semibold text-rehab-teal">{duration}s</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-rehab-teal transition-all" style={{ width: `${Math.min(100, (elapsed / duration) * 100)}%` }} />
          </div>
        </div>
        <div className="mt-5 grid gap-3">
          <Metric label={t.stabilityScore} value={`${frame.stability}/100`} score={frame.stability} icon={Gauge} />
          <Metric label={t.postureScore} value={`${frame.posture}/100`} score={frame.posture} icon={Activity} />
          <Metric label={t.trunkDeviation} value={`${frame.trunkInclination} deg`} score={100 - frame.trunkInclination * 8} icon={Target} />
          <Metric label={t.bodyCenterDeviation} value={`${frame.bodyCenterDeviation} ${isWebcamOnly ? "%" : "mm"}`} score={100 - frame.bodyCenterDeviation * 7} icon={UserRound} />
          {!isWebcamOnly ? <Metric label={t.apSway} value={`${frame.apSway} mm`} score={100 - frame.apSway * 4} icon={Waves} /> : null}
          {!isWebcamOnly ? <Metric label={t.mlSway} value={`${frame.mlSway} mm`} score={100 - frame.mlSway * 4} icon={Waves} /> : null}
          {isWebcamOnly ? <Metric label={t.boardStability} value={t.notAvailableWebcamOnly} muted /> : null}
        </div>
        <div className={`mt-5 rounded-lg p-4 text-sm font-semibold ${warningPanelClass(frame.warningLevel)}`}>{frame.warning}</div>
        <Button className="mt-5 w-full" onClick={onEnd}>{t.endAssessment}</Button>
      </ClinicalCard>
      </div>
    </div>
  );
}

function CountdownOverlay({ t, value }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center rounded-xl bg-slate-950/72 backdrop-blur-sm">
      <div className="text-center text-white">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#90BE6D]">{t.assessmentStarting}</p>
        <p className="mt-4 text-8xl font-semibold leading-none text-white">{value}</p>
        <p className="mt-4 text-sm font-medium text-slate-200">{t.preparePatientStill}</p>
      </div>
    </div>
  );
}

function warningPanelClass(level) {
  if (level === "danger") return "bg-[#F94144]/10 text-[#B4232A]";
  if (level === "alert") return "bg-[#F8961E]/15 text-[#A14F00]";
  if (level === "warning") return "bg-[#F9C74F]/20 text-[#8A6B00]";
  return "bg-[#90BE6D]/10 text-[#47743C]";
}

function ResultsStep({ t, patient, config, results, patientSessions, savedSession, onSave, onReport, onReturnToProfile }) {
  const boardAvailable = Boolean(results.availableMetrics?.board);
  const postureUnits = getPostureUnits(config.acquisitionMode);
  const [clinicalImpression, setClinicalImpression] = useState(results.interpretation ?? "");
  const comparisonSession = patientSessions.find((session) => !savedSession || String(session.id) !== String(savedSession.id));

  return (
    <ClinicalCard className="p-5">
      <SectionHeader title={t.stepResults} description={`${t.estimatedIndicatorsFor} ${patient.fullName}.`} />
      <div className={`mt-5 overflow-hidden rounded-2xl border ${resultTone(results.totalBalanceScore).border} ${resultTone(results.totalBalanceScore).bg}`}>
        <div className="grid gap-0 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{t.totalBalanceScore}</p>
            <div className="mt-3 flex items-end gap-3">
              <p className={`text-6xl font-semibold leading-none ${resultTone(results.totalBalanceScore).text}`}>{results.totalBalanceScore}</p>
              <p className="pb-2 text-lg font-semibold text-rehab-muted">/100</p>
            </div>
            <StatusBadge tone={results.status === "High instability" ? "danger" : results.status === "Moderate instability" ? "warning" : "connected"} dot={false}>
              {resultStatusLabel(t, results.status)}
            </StatusBadge>
          </div>
          <div className="grid gap-3 border-t border-white/80 bg-white/70 p-5 sm:grid-cols-2 lg:border-l lg:border-t-0">
            <MiniOutcome label={t.postureStability} value={`${results.postureStabilityScore}/100`} score={results.postureStabilityScore} />
            <MiniOutcome label={t.boardStability} value={boardAvailable ? `${results.boardStabilityScore}/100` : t.notAvailableWebcamOnly} score={results.boardStabilityScore} muted={!boardAvailable} />
            <MiniOutcome label={t.trunkDeviation} value={`${results.trunkDeviation} ${postureUnits.trunk}`} score={100 - results.trunkDeviation * 8} />
            <MiniOutcome label={t.bodyCenterDeviation} value={`${results.bodyCenterDeviation} ${postureUnits.center}`} score={100 - results.bodyCenterDeviation * 7} />
          </div>
        </div>
      </div>
      <ResultsCharts samples={results.samples ?? []} boardAvailable={boardAvailable} t={t} />
      {comparisonSession ? (
        <SessionComparisonCard t={t} results={results} previousSession={comparisonSession} postureUnits={postureUnits} />
      ) : null}
      <div className="mt-5">
        <label className="text-sm font-semibold text-rehab-ink" htmlFor="clinical-impression">
          {t.clinicalImpressionEditable}
        </label>
        <textarea
          id="clinical-impression"
          rows={4}
          maxLength={500}
          value={clinicalImpression}
          onChange={(event) => setClinicalImpression(event.target.value)}
          className="mt-2 w-full rounded-lg border border-rehab-line px-3 py-2 text-sm text-rehab-ink outline-none transition focus:border-rehab-teal focus:ring-2 focus:ring-rehab-teal/15"
        />
        <p className="mt-1 text-xs text-rehab-muted">{template(t.characterCount, { count: clinicalImpression.length })}</p>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {boardAvailable ? (
          <MetricsList title={t.swayMetrics} items={[`${t.apMean}: ${results.meanSwayAp} mm`, `${t.mlMean}: ${results.meanSwayMl} mm`, `${t.swayVelocity}: ${results.swayVelocity} mm/s`, `${t.instabilityEvents}: ${results.instabilityEvents}`]} />
        ) : (
          <UnavailablePanel title={t.swayMetrics} message={t.notAvailableWebcamOnly} />
        )}
        <MetricsList
          title={t.postureMetrics}
          items={[
            `${t.trunkDeviation}: ${results.trunkDeviation} ${postureUnits.trunk}`,
            `${t.shoulderAsymmetry}: ${results.shoulderAsymmetry} ${postureUnits.asymmetry}`,
            `${t.hipAsymmetry}: ${results.hipAsymmetry} ${postureUnits.asymmetry}`,
            `${t.bodyCenterDeviation}: ${results.bodyCenterDeviation} ${postureUnits.center}`,
          ]}
        />
        <MetricsList title={t.recommendations} items={results.recommendations} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        {savedSession ? (
          <Button variant="secondary" onClick={onReturnToProfile}>
            {t.viewPatientSessions}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => onSave(clinicalImpression)} disabled={Boolean(savedSession)}>
          <Save size={16} /> {savedSession ? t.sessionSaved : t.saveSession}
        </Button>
        <Button onClick={onReport} disabled={!savedSession}>{t.generatePdfReport}</Button>
      </div>
    </ClinicalCard>
  );
}

function SessionComparisonCard({ t, results, previousSession, postureUnits }) {
  const rows = [
    {
      label: t.overallScore,
      current: results.totalBalanceScore,
      previous: getSessionMetric(previousSession, "totalScore", "totalBalanceScore"),
      unit: "pts",
      higherIsBetter: true,
    },
    {
      label: t.postureScoreMetric,
      current: results.postureStabilityScore,
      previous: getSessionMetric(previousSession, "postureScore", "postureStabilityScore"),
      unit: "pts",
      higherIsBetter: true,
    },
    {
      label: t.trunkDeviation,
      current: results.trunkDeviation,
      previous: getSessionMetric(previousSession, "trunkDeviation", "trunkInclination"),
      unit: postureUnits.trunk,
      higherIsBetter: false,
    },
    {
      label: t.shoulderAsymmetry,
      current: results.shoulderAsymmetry,
      previous: getSessionMetric(previousSession, "shoulderAsymmetry"),
      unit: "%",
      higherIsBetter: false,
    },
    {
      label: t.hipAsymmetry,
      current: results.hipAsymmetry,
      previous: getSessionMetric(previousSession, "hipAsymmetry"),
      unit: "%",
      higherIsBetter: false,
    },
    {
      label: t.bodyCenterDeviation,
      current: results.bodyCenterDeviation,
      previous: getSessionMetric(previousSession, "bodyCenterDeviation"),
      unit: postureUnits.center,
      higherIsBetter: false,
    },
  ];
  const overallDelta = roundDelta(results.totalBalanceScore - getSessionMetric(previousSession, "totalScore", "totalBalanceScore"));
  const summary =
    Math.abs(overallDelta) <= 2
      ? t.overallStable
      : overallDelta > 0
        ? template(t.overallImproving, { delta: overallDelta })
        : template(t.overallDeclining, { delta: overallDelta });

  return (
    <div className="mt-5 rounded-lg border border-rehab-line bg-white p-4">
      <p className="font-semibold text-rehab-ink">{t.comparedToLastSession}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-rehab-line text-xs uppercase tracking-wide text-rehab-muted">
              <th className="py-2 pr-3 font-semibold">{t.metric}</th>
              <th className="px-3 py-2 font-semibold">{t.thisSession}</th>
              <th className="px-3 py-2 font-semibold">{t.previousSession}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ComparisonRow key={row.label} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${overallDelta > 2 ? "bg-emerald-50 text-emerald-700" : overallDelta < -2 ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-rehab-muted"}`}>
        {summary}
      </p>
    </div>
  );
}

function ComparisonRow({ row }) {
  const delta = roundDelta(row.current - row.previous);
  const state = deltaState(delta, row.higherIsBetter);

  return (
    <tr className="border-b border-rehab-line last:border-0">
      <td className="py-3 pr-3 font-semibold text-rehab-ink">{row.label}</td>
      <td className="px-3 py-3">
        <p className="font-semibold text-rehab-ink">{formatComparisonValue(row.current, row.unit)}</p>
        <p className={`mt-1 text-xs font-semibold ${state.className}`}>{state.arrow} {formatDelta(delta, row.unit)}</p>
      </td>
      <td className="px-3 py-3 text-rehab-muted">{formatComparisonValue(row.previous, row.unit)}</td>
    </tr>
  );
}

function getSessionMetric(session, key, fallbackKey = key) {
  return Number(session?.[key] ?? session?.results?.[key] ?? session?.results?.[fallbackKey] ?? 0);
}

function deltaState(delta, higherIsBetter) {
  if (Math.abs(delta) <= 2) {
    return { arrow: "→", className: "text-rehab-muted" };
  }
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  if (improved) {
    return { arrow: higherIsBetter ? "↑" : "↓", className: "text-emerald-700" };
  }
  return { arrow: higherIsBetter ? "↓" : "↑", className: "text-rose-700" };
}

function formatComparisonValue(value, unit) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return `${roundDelta(Number(value))} ${unit}`;
}

function formatDelta(delta, unit) {
  if (Math.abs(delta) <= 2) return `0 ${unit}`;
  return `${delta > 0 ? "+" : ""}${delta} ${unit}`;
}

function roundDelta(value) {
  return Math.round(Number(value) * 10) / 10;
}

function ResultsCharts({ samples, boardAvailable, t = {} }) {
  const postureData = samples.map((sample) => ({
    t: sample.t,
    posture: sample.posture,
  }));
  const swayData = samples
    .filter((sample) => sample.ml != null && sample.ap != null)
    .map((sample) => ({
      ml: sample.ml,
      ap: sample.ap,
    }));

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-rehab-line bg-white p-4">
        <p className="font-semibold text-rehab-ink">{t.postureStabilityOverAssessment}</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={postureData} margin={{ top: 10, right: 16, bottom: 18, left: 0 }}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fontSize: 12 }} stroke="#577590">
                <Label value={t.timeSeconds ?? "Time (s)"} offset={-8} position="insideBottom" fill="#577590" />
              </XAxis>
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#577590" />
              <ReferenceArea y1={75} y2={100} fill="#90BE6D" fillOpacity={0.18} />
              <ReferenceLine y={75} stroke="#90BE6D" strokeDasharray="4 4">
                <Label value={t.normalRange} position="insideTopRight" fill="#47743C" fontSize={12} />
              </ReferenceLine>
              <Line type="monotone" dataKey="posture" stroke="#2563EB" strokeWidth={3} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-rehab-line bg-white p-4">
        <p className="font-semibold text-rehab-ink">{t.centerOfPressurePath}</p>
        {boardAvailable ? (
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 16, bottom: 22, left: 8 }}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="ml" name="Mediolateral" tick={{ fontSize: 12 }} stroke="#577590">
                  <Label value={t.mediolateralMm} offset={-12} position="insideBottom" fill="#577590" />
                </XAxis>
                <YAxis type="number" dataKey="ap" name="Anteroposterior" tick={{ fontSize: 12 }} stroke="#577590">
                  <Label value={t.anteroposteriorMm} angle={-90} position="insideLeft" fill="#577590" />
                </YAxis>
                <ReferenceLine x={0} stroke="#577590" strokeDasharray="4 4" />
                <ReferenceLine y={0} stroke="#577590" strokeDasharray="4 4" />
                <Scatter data={swayData} fill="#43AA8B" line={false} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="mt-4 grid h-64 place-items-center rounded-lg border border-dashed border-rehab-line bg-slate-50 p-4 text-center">
            <p className="text-sm font-semibold text-rehab-muted">{t.swayPathAvailableBoard}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function getPostureUnits(acquisitionMode) {
  const isWebcamOnly = acquisitionMode === acquisitionModes.webcam;
  return {
    trunk: "deg",
    asymmetry: "%",
    center: isWebcamOnly ? "%" : "mm",
  };
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

function resultStatusLabel(t, status) {
  const labels = {
    Stable: t.stableResult,
    "Moderate instability": t.moderateInstability,
    "High instability": t.highInstability,
  };
  return labels[status] ?? status;
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

function ReportStep({ t, patient, session, report, onGenerate, onDownload, onReturnToProfile, onDone }) {
  return (
    <ClinicalCard className="p-5">
      <SectionHeader title={t.stepReport} description={t.generateDownloadReport} />
      <div className="mt-5 rounded-lg border border-rehab-line bg-slate-50 p-5">
        <p className="font-semibold">{t.reportPreview}</p>
        <p className="mt-2 text-sm text-rehab-muted">{patient.fullName} - {testTypeLabel(t, session.testType)} - {session.totalScore}/100</p>
        <p className="mt-2 text-sm text-rehab-muted">{session.results.interpretation}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onGenerate} disabled={Boolean(report)}>
          <CheckCircle2 size={16} /> {report ? t.savedToProfile : t.saveReportToProfile}
        </Button>
        <Button onClick={onDownload}>{t.downloadPdf}</Button>
        {report ? (
          <Button variant="secondary" onClick={onReturnToProfile}>{t.viewPatientReports}</Button>
        ) : null}
        <Button variant="secondary" onClick={onDone}>{t.finish}</Button>
      </div>
    </ClinicalCard>
  );
}

function Option({ selected, title, description, onClick, icon: Icon }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border p-4 text-left transition hover:shadow-clinical ${selected ? "border-rehab-teal bg-teal-50 ring-2 ring-rehab-teal/15" : "border-rehab-line bg-white"}`}>
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className={`grid h-10 w-10 place-items-center rounded-lg ${selected ? "bg-rehab-teal text-white" : "bg-slate-100 text-rehab-blue"}`}>
            <Icon size={18} />
          </span>
        ) : null}
        <span>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-rehab-muted">{description}</p>
        </span>
      </div>
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

function SetupChip({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-rehab-line bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-rehab-blue">
          <Icon size={16} />
        </span>
        <span>
          <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{label}</p>
          <p className="text-sm font-semibold text-rehab-ink">{value}</p>
        </span>
      </div>
    </div>
  );
}

function Metric({ label, value, muted = false, score, icon: Icon }) {
  const tone = metricTone(score);
  return (
    <div className={`rounded-xl border p-4 ${muted ? "border-dashed border-rehab-line bg-slate-50" : "border-rehab-line bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        {Icon ? (
          <span className="grid h-9 w-9 place-items-center rounded-lg text-white" style={{ backgroundColor: tone }}>
            <Icon size={17} />
          </span>
        ) : null}
        {!muted && Number.isFinite(Number(score)) ? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone }} /> : null}
      </div>
      <p className="text-sm text-rehab-muted">{label}</p>
      <p className={`mt-1 ${muted ? "text-sm font-semibold text-rehab-muted" : "text-2xl font-semibold"}`}>{value}</p>
      {!muted && Number.isFinite(Number(score)) ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, Number(score)))}%`, backgroundColor: tone }} />
        </div>
      ) : null}
    </div>
  );
}

function MetricsList({ title, items }) {
  return (
    <div className="rounded-xl border border-rehab-line bg-white p-4">
      <p className="font-semibold">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-rehab-muted">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rehab-teal" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnavailablePanel({ title, message }) {
  return (
    <div className="rounded-lg border border-dashed border-rehab-line bg-slate-50 p-4">
      <p className="font-semibold">{title}</p>
      <p className="mt-3 text-sm text-rehab-muted">{message}</p>
    </div>
  );
}

function ScoreBar({ label, score }) {
  const tone = metricTone(score);
  return (
    <div className="mt-3 rounded-lg bg-white/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{label}</span>
        <span className="text-sm font-semibold text-rehab-ink">{score}/100</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, Number(score)))}%`, backgroundColor: tone }} />
      </div>
    </div>
  );
}

function MiniOutcome({ label, value, score, muted = false }) {
  const tone = metricTone(score);
  return (
    <div className={`rounded-xl border p-4 ${muted ? "border-dashed border-rehab-line bg-slate-50" : "border-white bg-white"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{label}</p>
      <p className={`mt-2 font-semibold ${muted ? "text-sm text-rehab-muted" : "text-xl text-rehab-ink"}`}>{value}</p>
      {!muted && Number.isFinite(Number(score)) ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, Number(score)))}%`, backgroundColor: tone }} />
        </div>
      ) : null}
    </div>
  );
}

function resultTone(score) {
  if (Number(score) >= 80) return { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" };
  if (Number(score) >= 65) return { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" };
  return { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700" };
}

function metricTone(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return "#577590";
  if (numeric >= 80) return "#43AA8B";
  if (numeric >= 65) return "#F9C74F";
  if (numeric >= 45) return "#F8961E";
  return "#F94144";
}

function template(text = "", values = {}) {
  return Object.entries(values).reduce((current, [key, value]) => current.replaceAll(`{${key}}`, value ?? ""), text);
}

function initials(name = "") {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}
