import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Camera, CheckCircle2, ClipboardCheck, Eye, EyeOff, Gauge, Save, Search, ShieldCheck, Target, Timer, UserRound, Waves } from "lucide-react";
import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  Bar,
  BarChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
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
import { api } from "../api/client.js";
import { acquisitionModes, createAssessmentSource, getAssessmentSourceOptions } from "../assessment/sources/index.js";
import { buildSession } from "../utils/assessment";
import { WebcamPoseAssessment } from "../webcam/WebcamPoseAssessment.jsx";

export function BalanceAssessmentPage({ t, patients, sessions, onSaveSession, onSaveReport, onDownloadSessionReport, preselectedPatientId, onClearPreselectedPatient, onReturnToPatientProfile, onWorkflowFocusChange, webcamMirrored = true }) {
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
  const [poseState, setPoseState] = useState(null);
  const [assessmentPhase, setAssessmentPhase] = useState("positioning");
  const [assessmentRunning, setAssessmentRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [savedSession, setSavedSession] = useState(null);
  const [report, setReport] = useState(null);

  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId);
  const steps = [t.selectPatient, t.configureTest, t.preparation, t.liveAssessment, t.results, t.reportStep];
  const activeSource = useMemo(() => createAssessmentSource({ mode: config.acquisitionMode, config, t }), [config, t]);
  const countdownIntervalRef = useRef(null);
  const countdownLostTimeoutRef = useRef(null);
  const completionTimeoutRef = useRef(null);

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

  const clearCountdownInterval = () => {
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (countdownLostTimeoutRef.current) {
      window.clearTimeout(countdownLostTimeoutRef.current);
      countdownLostTimeoutRef.current = null;
    }
  };

  const showCompletedThenResults = (finalResults) => {
    if (completionTimeoutRef.current) {
      window.clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
    setCountdown(null);
    setAssessmentPhase("complete");
    setAssessmentRunning(false);

    completionTimeoutRef.current = window.setTimeout(() => {
      activeSource.stop();
      setWebcamStream(null);
      setResults(finalResults);
      setStep(4);
      completionTimeoutRef.current = null;
    }, 900);
  };

  const startCalibrationCountdown = () => {
    if (countdownIntervalRef.current || assessmentPhase !== "positioning") return;

    console.log("[BalanceRehab] assessment phase: positioning -> countdown");
    if (countdownLostTimeoutRef.current) {
      window.clearTimeout(countdownLostTimeoutRef.current);
      countdownLostTimeoutRef.current = null;
    }
    setAssessmentPhase("countdown");
    setAssessmentRunning(false);
    setCountdown(3);

    countdownIntervalRef.current = window.setInterval(() => {
      setCountdown((current) => {
        if (current == null) return current;
        if (current <= 1) {
          clearCountdownInterval();
          console.log("[BalanceRehab] assessment phase: countdown -> assessing");
          setAssessmentPhase("assessing");
          setAssessmentRunning(true);
          return null;
        }
        return current - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (!workflowOpen || step !== 3 || results || assessmentPhase !== "positioning") return;
    const calibrationReady = config.acquisitionMode === acquisitionModes.demo || poseState?.readiness?.ready;
    if (calibrationReady) {
      startCalibrationCountdown();
    }
  }, [workflowOpen, step, config.acquisitionMode, results, assessmentPhase, poseState]);

  useEffect(() => {
    if (step !== 3 || assessmentPhase !== "countdown" || config.acquisitionMode !== acquisitionModes.webcam) return;

    if (poseState?.readiness?.ready) {
      if (countdownLostTimeoutRef.current) {
        window.clearTimeout(countdownLostTimeoutRef.current);
        countdownLostTimeoutRef.current = null;
      }
      return;
    }

    if (!countdownLostTimeoutRef.current) {
      countdownLostTimeoutRef.current = window.setTimeout(() => {
        console.log("[BalanceRehab] assessment phase: countdown -> positioning (tracking lost)");
        clearCountdownInterval();
        setCountdown(null);
        setAssessmentPhase("positioning");
        setAssessmentRunning(false);
      }, 1000);
    }
  }, [step, assessmentPhase, config.acquisitionMode, poseState]);

  useEffect(() => {
    if (!workflowOpen || step !== 3 || results || assessmentPhase !== "assessing" || !assessmentRunning) return;

    const timer = window.setInterval(() => {
      setElapsed((current) => {
        const next = current + 1;
        setLiveFrame(activeSource.getFrame(next));
        if (next >= config.durationSeconds) {
          window.clearInterval(timer);
          const finalResults = activeSource.getResults();
          showCompletedThenResults(finalResults);
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [workflowOpen, step, config, results, activeSource, assessmentPhase, assessmentRunning]);

  useEffect(() => {
    return () => {
      clearCountdownInterval();
      if (completionTimeoutRef.current) {
        window.clearTimeout(completionTimeoutRef.current);
        completionTimeoutRef.current = null;
      }
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
            clearCountdownInterval();
            setElapsed(0);
            setResults(null);
            setSourceError("");
            setPoseState(null);
            setCountdown(null);
            setAssessmentPhase("positioning");
            setAssessmentRunning(false);
            try {
              const stream = await activeSource.start();
              const sourceStream = activeSource.getStream?.() ?? null;
              setWebcamStream(sourceStream || null);
              setLiveFrame(activeSource.getFrame(0));
              setStep(3);
            } catch (error) {
              console.warn("Webcam acquisition could not start.", error);
              setSourceError(t.webcamPermissionDenied);
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
          assessmentPhase={assessmentPhase}
          assessmentRunning={assessmentRunning}
          frame={liveFrame}
          config={config}
          webcamStream={webcamStream}
          webcamMirrored={webcamMirrored}
          poseState={poseState}
          onPoseState={setPoseState}
          onPoseMetrics={(metrics) => {
            if (assessmentRunning && countdown == null) {
              activeSource.recordPoseMetrics?.(metrics);
            } else {
              activeSource.previewPoseMetrics?.(metrics);
            }
            setLiveFrame(activeSource.getFrame(elapsed));
          }}
          onEnd={() => {
            clearCountdownInterval();
            const finalResults = activeSource.getResults();
            showCompletedThenResults(finalResults);
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
            clearCountdownInterval();
            setCountdown(null);
            setAssessmentPhase("positioning");
            setAssessmentRunning(false);
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

function LiveStep({ t, elapsed, duration, countdown, assessmentPhase, assessmentRunning, frame, config, webcamStream, webcamMirrored, poseState, onPoseState, onPoseMetrics, onEnd }) {
  const isWebcamOnly = config.acquisitionMode === acquisitionModes.webcam;
  const isCountingDown = countdown != null;
  const progress = Math.min(100, (elapsed / duration) * 100);
  const cameraActive = !isWebcamOnly || isCameraStreamActive(webcamStream);
  const modelActive = !isWebcamOnly || Boolean(poseState?.readiness?.modelActive || poseState?.engineMode || poseState?.processingStatus);
  const bodyDetected = !isWebcamOnly || Boolean(poseState?.readiness?.personDetected || poseState?.tracking?.bodyDetected);
  const fullBodyVisible = !isWebcamOnly || Boolean(poseState?.readiness?.fullBodyVisible);
  const ready = !isWebcamOnly || (cameraActive && modelActive && fullBodyVisible);
  const isComplete = assessmentPhase === "complete";
  const isAssessing = assessmentPhase === "assessing" && assessmentRunning;
  const isLoading = isWebcamOnly && (!cameraActive || !modelActive);
  const liveMessage = liveAssessmentMessage({ t, isLoading, isCountingDown, isAssessing, isComplete, ready, poseState, isWebcamOnly });

  return (
    <div className="min-h-screen bg-slate-950 p-2">
      <section className="relative min-h-[calc(100vh-1rem)] overflow-hidden rounded-[1rem] border border-white/10 bg-slate-950 shadow-2xl shadow-slate-950/40">
        <div className="absolute inset-0">
          {isWebcamOnly && webcamStream ? (
            <WebcamPoseAssessment t={t} stream={webcamStream} frame={frame} onMetrics={onPoseMetrics} onState={onPoseState} mirrored={webcamMirrored} immersive />
          ) : (
            <div className="grid h-full place-items-center bg-slate-950 text-white">
              <div className="text-center">
                <div className="mx-auto mb-5 h-44 w-32 rounded-full border-4 border-[#43AA8B]" />
                <p className="text-xl font-semibold">{t.simulatedSkeleton}</p>
                <p className="mt-2 text-sm text-slate-300">{isWebcamOnly ? t.webcamPosePrimary : t.liveAssessmentDesc}</p>
              </div>
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-44 bg-gradient-to-b from-slate-950/58 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-44 bg-gradient-to-t from-slate-950/58 to-transparent" />

        <div className="absolute left-4 top-4 z-20 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-white/16 bg-slate-950/54 p-3 text-white shadow-xl shadow-slate-950/20 backdrop-blur-md">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <StatusDot label={t.cameraReady ?? "Camera ready"} active={cameraActive} />
            <StatusDot label={t.modelActive ?? "Model active"} active={modelActive} />
            <StatusDot label={t.bodyDetected ?? "Body detected"} active={bodyDetected} />
            <StatusDot label={t.fullBodyVisible ?? "Full body visible"} active={fullBodyVisible} />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/58">{liveMessage.label}</p>
          <div className="mt-1 flex items-center gap-3">
            {isCountingDown ? (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#43AA8B] text-lg font-semibold text-white shadow-lg shadow-slate-950/25">
                {countdown}
              </span>
            ) : null}
            <p className="text-sm font-semibold leading-5">{liveMessage.text}</p>
          </div>
        </div>

        <div className="absolute right-4 top-4 z-20">
          <Button variant="secondary" className="border-white/20 bg-white/92 shadow-xl shadow-slate-950/15 backdrop-blur-md" onClick={onEnd}>
            {t.endAssessment}
          </Button>
        </div>

        <div className="absolute bottom-4 right-4 z-20 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-white/16 bg-slate-950/54 px-4 py-3 text-white shadow-xl shadow-slate-950/20 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-white/70">
            <span>{isComplete ? t.assessmentComplete ?? "Assessment complete" : t.assessmentProgress}</span>
            <span>{elapsed}s / {duration}s</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/18">
            <div className="h-full rounded-full bg-[#43AA8B] transition-all" style={{ width: `${isComplete ? 100 : progress}%` }} />
          </div>
          {!isAssessing && !isComplete ? (
            <div className="mt-2 text-[11px] font-semibold leading-4 text-white/66">
              {ready ? t.stablePosture ?? "Stable posture" : t.positioningCalibrationHelp}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function liveAssessmentMessage({ t, isLoading, isCountingDown, isAssessing, isComplete, ready, poseState, isWebcamOnly }) {
  if (isComplete) return { label: t.liveAssessment, text: t.assessmentComplete ?? "Assessment complete" };
  if (isAssessing) return { label: t.liveAssessment, text: t.assessmentInProgress ?? "Assessment in progress" };
  if (isCountingDown || ready) return { label: t.positioningCalibration, text: t.goodPositionReady ?? "Good position, ready to start" };
  if (isLoading) return { label: t.positioningCalibration, text: t.cameraLoading ?? "Camera loading" };
  if (!isWebcamOnly) return { label: t.liveAssessment, text: t.demoModeActive ?? "Demo mode active" };
  return {
    label: t.positioningCalibration,
    text: poseState?.readiness?.feedback ?? t.moveBackwardUntilVisible ?? "Move back until your entire body is visible",
  };
}

function StatusDot({ label, active }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${active ? "border-[#90BE6D]/35 bg-[#90BE6D]/16 text-white" : "border-white/12 bg-white/8 text-white/58"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-[#90BE6D]" : "bg-white/30"}`} />
      {label}
    </span>
  );
}

function warningPanelClass(level) {
  if (level === "danger") return "bg-[#F94144]/10 text-[#B4232A]";
  if (level === "alert") return "bg-[#F8961E]/15 text-[#A14F00]";
  if (level === "warning") return "bg-[#F9C74F]/20 text-[#8A6B00]";
  return "bg-[#90BE6D]/10 text-[#47743C]";
}

function LiveTrackingPanel({ t, poseState, detectionStatus, isWebcamOnly, webcamStream, overlay = false }) {
  const tracking = poseState?.tracking ?? {};
  const cameraActive = isCameraStreamActive(webcamStream);
  const modelActive = Boolean(poseState?.engineMode || poseState?.processingStatus);
  const items = isWebcamOnly
    ? [
        [t.cameraActive ?? "Camera active", cameraActive],
        [t.bodyDetected ?? "Body detected", Boolean(tracking.bodyDetected)],
        [t.faceDetected ?? "Face detected", Boolean(tracking.faceDetected)],
        [t.leftHandDetected ?? "Left hand detected", Boolean(tracking.leftHandDetected)],
        [t.rightHandDetected ?? "Right hand detected", Boolean(tracking.rightHandDetected)],
      ]
    : [[t.demoModeActive, true]];

  const cleanStatus =
    isWebcamOnly && cameraActive && !tracking.bodyDetected && !poseState?.error
      ? t.moveBackwardUntilVisible ?? "Move back until your entire body is visible."
      : detectionStatus;
  const shellClass = overlay
    ? "text-white"
    : "rounded-2xl border border-slate-100 bg-slate-50 p-3";
  const titleClass = overlay ? "text-white/62" : "text-rehab-muted";
  const statusClass = overlay ? "text-white" : "text-rehab-ink";

  return (
    <div className={shellClass}>
      <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${overlay ? "sr-only" : ""}`}>
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${titleClass}`}>{t.trackingStatus ?? "Tracking status"}</p>
          <p className={`mt-1 text-sm font-semibold leading-5 ${statusClass}`}>{cleanStatus}</p>
        </div>
        {isWebcamOnly ? (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${overlay ? "bg-white/14 text-white" : "bg-[#577590]/10 text-[#577590]"}`}>
            {poseState?.fps ?? 0} FPS
          </span>
        ) : null}
      </div>

      <div className={`${overlay ? "" : "mt-3"} flex flex-wrap justify-end gap-2`}>
        {items.map(([label, active]) => (
          <TrackingRow key={label} label={label} active={active} overlay={overlay} />
        ))}
      </div>

      {poseState?.error && !cameraActive ? (
        <div className="mt-3 rounded-xl border border-[#F8961E]/25 bg-[#F8961E]/10 px-3 py-2 text-sm font-semibold text-[#8A4A00]">
          {poseState.error}
        </div>
      ) : null}
    </div>
  );
}

function TrackingRow({ label, active, overlay = false }) {
  const className = overlay
    ? active
      ? "border-[#90BE6D]/45 bg-slate-950/38 text-white shadow-lg shadow-slate-950/15 backdrop-blur-md"
      : "border-white/18 bg-slate-950/28 text-white/68 shadow-lg shadow-slate-950/10 backdrop-blur-md"
    : active
      ? "border-[#90BE6D]/30 bg-[#90BE6D]/15 text-[#2F7D67]"
      : "border-slate-200 bg-white text-rehab-muted";
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${className}`}>
      <span className={`h-2 w-2 rounded-full ${active ? "bg-[#43AA8B]" : overlay ? "bg-white/38" : "bg-slate-300"}`} />
      <span>{label}</span>
    </div>
  );
}

function CalibrationPanel({ t, poseState, webcamStream, overlay = false }) {
  const readiness = poseState?.readiness;
  const tracking = poseState?.tracking ?? {};
  const cameraActive = isCameraStreamActive(webcamStream);
  const bodyDetected = Boolean(tracking.bodyDetected || readiness?.personDetected);
  const checks = [
    [t.cameraReady, cameraActive],
    [t.personDetected, bodyDetected],
    [t.fullBodyVisible, Boolean(readiness?.fullBodyVisible)],
  ];
  const guidance = bodyDetected
    ? readiness?.moveHint || readiness?.feedback || t.standInMarkedArea
    : t.moveBackwardUntilVisible ?? "Move back until your entire body is visible.";
  const panelClass = overlay
    ? "absolute bottom-5 left-5 z-20 max-w-3xl rounded-2xl border border-white/16 bg-slate-950/42 p-4 text-white shadow-xl shadow-slate-950/20 backdrop-blur-md"
    : "rounded-2xl border border-[#F9C74F]/20 bg-[#F9C74F]/10 p-3";
  const titleClass = overlay ? "text-white/65" : "text-rehab-muted";
  const textClass = overlay ? "text-white" : "text-rehab-ink";

  return (
    <div className={panelClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${titleClass}`}>{t.positioningCalibration}</p>
          <p className={`mt-1 text-sm font-semibold leading-5 ${textClass}`}>{guidance}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {checks.map(([label, ok]) => (
            <div key={label} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${ok ? "border-[#90BE6D]/40 bg-[#90BE6D]/20 text-white" : "border-[#F9C74F]/45 bg-[#F9C74F]/20 text-white"}`}>
              <span className={`h-2 w-2 rounded-full ${ok ? "bg-[#90BE6D]" : "bg-[#F9C74F]"}`} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
      {!bodyDetected ? <TroubleshootingList t={t} overlay={overlay} /> : null}
    </div>
  );
}

function TroubleshootingList({ t, overlay = false }) {
  const tips = [
    t.troubleshootStepBack ?? "Step back from the camera.",
    t.troubleshootFullBody ?? "Make sure your full body is visible.",
    t.troubleshootLighting ?? "Improve lighting.",
  ];

  return (
    <ul className={`mt-3 flex flex-wrap gap-2 text-xs font-semibold ${overlay ? "text-white/78" : "text-[#705600]"}`}>
      {tips.map((tip) => (
        <li key={tip} className={`rounded-full px-3 py-1.5 ${overlay ? "bg-white/12" : "bg-white"}`}>- {tip}</li>
      ))}
    </ul>
  );
}

function LegacyLiveTrackingPanel({ t, poseState, detectionStatus, isWebcamOnly, webcamStream }) {
  const tracking = poseState?.tracking ?? {};
  const cameraActive = isCameraStreamActive(webcamStream);
  const modelActive = Boolean(poseState?.engineMode || poseState?.processingStatus);
  const items = isWebcamOnly
    ? [
        [t.cameraActive ?? "Camera active", cameraActive],
        [t.modelActive ?? "Model active", modelActive],
        [t.bodyDetected ?? "Body detected", Boolean(tracking.bodyDetected)],
        [t.faceDetected ?? "Face detected", Boolean(tracking.faceDetected)],
        [t.leftHandDetected ?? "Left hand detected", Boolean(tracking.leftHandDetected)],
        [t.rightHandDetected ?? "Right hand detected", Boolean(tracking.rightHandDetected)],
      ]
    : [[t.demoModeActive, true]];

  const cleanStatus =
    isWebcamOnly && cameraActive && !tracking.bodyDetected && !poseState?.error
      ? t.cameraActiveWaitingFullBody ?? "Camera active, waiting for full-body pose detection."
      : detectionStatus;

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{t.trackingStatus ?? "Tracking status"}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-rehab-ink">{cleanStatus}</p>
        </div>
        {isWebcamOnly ? (
          <span className="shrink-0 rounded-full bg-[#577590]/10 px-2.5 py-1 text-xs font-semibold text-[#577590]">
            {poseState?.fps ?? 0} FPS
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {items.map(([label, active]) => (
          <LegacyTrackingRow key={label} label={label} active={active} t={t} />
        ))}
      </div>

      {poseState?.error && !cameraActive ? (
        <div className="mt-3 rounded-xl border border-[#F8961E]/25 bg-[#F8961E]/10 px-3 py-2 text-sm font-semibold text-[#8A4A00]">
          {poseState.error}
        </div>
      ) : null}
    </div>
  );
}

function LegacyTrackingRow({ label, active }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-[#90BE6D]/30 bg-[#90BE6D]/15 text-[#2F7D67]" : "border-slate-200 bg-white text-rehab-muted"}`}>
      <span className={`h-2 w-2 rounded-full ${active ? "bg-[#43AA8B]" : "bg-slate-300"}`} />
      <span>{label}</span>
    </div>
  );
}

function LegacyCalibrationPanel({ t, poseState, webcamStream }) {
  const readiness = poseState?.readiness;
  const tracking = poseState?.tracking ?? {};
  const cameraActive = isCameraStreamActive(webcamStream);
  const bodyDetected = Boolean(tracking.bodyDetected || readiness?.personDetected);
  const checks = [
    [t.cameraReady, cameraActive],
    [t.bodyDetected ?? t.personDetected, bodyDetected],
    [t.fullBodyVisible, Boolean(readiness?.fullBodyVisible)],
  ];
  const guidance = bodyDetected
    ? readiness?.moveHint || readiness?.feedback || t.standInMarkedArea
    : t.cameraActiveWaitingFullBody ?? "Camera active, waiting for full-body pose detection.";

  return (
    <div className="rounded-2xl border border-[#F9C74F]/20 bg-[#F9C74F]/10 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{t.positioningCalibration}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-rehab-ink">{bodyDetected ? guidance : t.moveBackwardUntilVisible}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
        {checks.map(([label, ok]) => (
            <div key={label} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${ok ? "border-[#90BE6D]/30 bg-white text-[#2F7D67]" : "border-[#F8961E]/30 bg-white text-[#8A6400]"}`}>
              <span className={`h-2 w-2 rounded-full ${ok ? "bg-[#43AA8B]" : "bg-[#F8961E]"}`} />
              <span>{label}</span>
          </div>
        ))}
        </div>
      </div>
      {!bodyDetected ? <LegacyTroubleshootingList t={t} /> : null}
    </div>
  );
}

function LegacyTroubleshootingList({ t }) {
  const tips = [
    t.troubleshootStepBack ?? "Step back from the camera.",
    t.troubleshootFullBody ?? "Make sure your full body is visible.",
    t.troubleshootLighting ?? "Improve lighting.",
    t.troubleshootHandsClear ?? "Remove hands from blocking the face or body.",
    t.troubleshootCameraHeight ?? "Place the camera at chest height or farther away.",
  ];

  return (
    <ul className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#705600]">
      {tips.map((tip) => (
        <li key={tip} className="rounded-full bg-white px-3 py-1.5">- {tip}</li>
      ))}
    </ul>
  );
}

function VeryLegacyCalibrationPanel({ t, poseState }) {
  const readiness = poseState?.readiness;
  const checks = [
    [t.cameraReady, true],
    [t.personDetected, Boolean(readiness?.personDetected)],
    [t.fullBodyVisible, Boolean(readiness?.fullBodyVisible)],
  ];

  return (
    <div className="absolute left-5 top-28 z-20 max-w-sm rounded-2xl border border-white/20 bg-white/92 p-4 shadow-xl shadow-slate-950/10 backdrop-blur-md">
      <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{t.positioningCalibration}</p>
      <div className="mt-4 space-y-2">
        {checks.map(([label, ok]) => (
          <div key={label} className={`flex items-center gap-2 text-sm font-semibold ${ok ? "text-[#2F7D67]" : "text-[#A14F00]"}`}>
            <span>{ok ? "OK" : "!"}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-rehab-muted">
        {readiness?.moveHint || readiness?.feedback || t.standInMarkedArea}
      </p>
    </div>
  );
}

function DuplicateLiveTrackingPanel({ t, poseState, detectionStatus, isWebcamOnly, webcamStream }) {
  const tracking = poseState?.tracking ?? {};
  const cameraActive = isCameraStreamActive(webcamStream);
  const modelActive = Boolean(poseState?.engineMode || poseState?.processingStatus);
  const items = isWebcamOnly
    ? [
        [t.cameraActive ?? "Camera active", cameraActive],
        [t.modelActive ?? "Model active", modelActive],
        [t.bodyDetected ?? "Body detected", Boolean(tracking.bodyDetected)],
        [t.faceDetected ?? "Face detected", Boolean(tracking.faceDetected)],
        [t.leftHandDetected ?? "Left hand detected", Boolean(tracking.leftHandDetected)],
        [t.rightHandDetected ?? "Right hand detected", Boolean(tracking.rightHandDetected)],
      ]
    : [[t.demoModeActive, true]];

  const cleanStatus =
    isWebcamOnly && cameraActive && !tracking.bodyDetected && !poseState?.error
      ? t.cameraActiveWaitingFullBody ?? "Camera active, waiting for full-body pose detection."
      : detectionStatus;

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{t.trackingStatus ?? "Tracking status"}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-rehab-ink">{cleanStatus}</p>
        </div>
        {isWebcamOnly ? (
          <span className="shrink-0 rounded-full bg-[#577590]/10 px-2.5 py-1 text-xs font-semibold text-[#577590]">
            {poseState?.fps ?? 0} FPS
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {items.map(([label, active]) => (
          <TrackingRow key={label} label={label} active={active} t={t} />
        ))}
      </div>

      {poseState?.error && !cameraActive ? (
        <div className="mt-3 rounded-xl border border-[#F8961E]/25 bg-[#F8961E]/10 px-3 py-2 text-sm font-semibold text-[#8A4A00]">
          {poseState.error}
        </div>
      ) : null}
    </div>
  );
}

function DuplicateTrackingRow({ label, active, t }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-[#90BE6D]/30 bg-[#90BE6D]/15 text-[#2F7D67]" : "border-slate-200 bg-white text-rehab-muted"}`}>
      <span className={`h-2 w-2 rounded-full ${active ? "bg-[#43AA8B]" : "bg-slate-300"}`} />
      <span>{label}</span>
    </div>
  );
}

function DuplicateCalibrationPanel({ t, poseState, webcamStream }) {
  const readiness = poseState?.readiness;
  const tracking = poseState?.tracking ?? {};
  const cameraActive = isCameraStreamActive(webcamStream);
  const bodyDetected = Boolean(tracking.bodyDetected || readiness?.personDetected);
  const checks = [
    [t.cameraReady, cameraActive],
    [t.bodyDetected ?? t.personDetected, bodyDetected],
    [t.fullBodyVisible, Boolean(readiness?.fullBodyVisible)],
  ];
  const guidance = bodyDetected
    ? readiness?.moveHint || readiness?.feedback || t.standInMarkedArea
    : t.cameraActiveWaitingFullBody ?? "Camera active, waiting for full-body pose detection.";

  return (
    <div className="rounded-2xl border border-[#F9C74F]/20 bg-[#F9C74F]/10 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{t.positioningCalibration}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-rehab-ink">{bodyDetected ? guidance : t.moveBackwardUntilVisible}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
        {checks.map(([label, ok]) => (
            <div key={label} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${ok ? "border-[#90BE6D]/30 bg-white text-[#2F7D67]" : "border-[#F8961E]/30 bg-white text-[#8A6400]"}`}>
              <span className={`h-2 w-2 rounded-full ${ok ? "bg-[#43AA8B]" : "bg-[#F8961E]"}`} />
              <span>{label}</span>
          </div>
        ))}
        </div>
      </div>
      {!bodyDetected ? <TroubleshootingList t={t} /> : null}
    </div>
  );
}

function DuplicateTroubleshootingList({ t }) {
  const tips = [
    t.troubleshootStepBack ?? "Step back from the camera.",
    t.troubleshootFullBody ?? "Make sure your full body is visible.",
    t.troubleshootLighting ?? "Improve lighting.",
    t.troubleshootHandsClear ?? "Remove hands from blocking the face or body.",
    t.troubleshootCameraHeight ?? "Place the camera at chest height or farther away.",
  ];

  return (
    <ul className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#705600]">
      {tips.map((tip) => (
        <li key={tip} className="rounded-full bg-white px-3 py-1.5">- {tip}</li>
      ))}
    </ul>
  );
}

function DuplicateLegacyCalibrationPanel({ t, poseState }) {
  const readiness = poseState?.readiness;
  const checks = [
    [t.cameraReady, true],
    [t.personDetected, Boolean(readiness?.personDetected)],
    [t.fullBodyVisible, Boolean(readiness?.fullBodyVisible)],
  ];

  return (
    <div className="absolute left-5 top-28 z-20 max-w-sm rounded-2xl border border-white/20 bg-white/92 p-4 shadow-xl shadow-slate-950/10 backdrop-blur-md">
      <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{t.positioningCalibration}</p>
      <div className="mt-4 space-y-2">
        {checks.map(([label, ok]) => (
          <div key={label} className={`flex items-center gap-2 text-sm font-semibold ${ok ? "text-[#2F7D67]" : "text-[#A14F00]"}`}>
            <span>{ok ? "✓" : "⚠"}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-rehab-muted">
        {readiness?.moveHint || readiness?.feedback || t.standInMarkedArea}
      </p>
    </div>
  );
}

function CalibrationOverlay({ t, value }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center rounded-xl bg-slate-950/72 backdrop-blur-sm">
      <div className="mx-4 max-w-xl rounded-3xl border border-white/15 bg-white/10 p-8 text-center text-white shadow-2xl backdrop-blur-md">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#90BE6D]">{t.positioningCalibration}</p>
        <p className="mt-4 text-6xl font-semibold leading-none text-white">{value}</p>
        <p className="mt-4 text-lg font-semibold">{t.assessmentBeginsIn}</p>
        <p className="mt-3 text-sm font-medium leading-6 text-slate-200">{t.positioningCalibrationHelp}</p>
      </div>
    </div>
  );
}

function poseStatusLabel(t, status, readiness, tracking, webcamStream) {
  const cameraActive = isCameraStreamActive(webcamStream);
  if (status === "lost") return t.poseLost;
  if (readiness?.ready) return t.poseDetected;
  if (readiness?.bodyBlockedByHands) return t.handsBodyBlocked ?? "Hands detected, but body is blocked. Move your hands away and step back.";
  if (tracking?.bodyDetected && !readiness?.fullBodyVisible) return t.moveBackwardUntilVisible ?? "Move back until your full body is visible.";
  if (tracking?.bodyDetected) return t.poseDetected;
  if (cameraActive) return t.cameraActiveWaitingFullBody ?? "Camera active, waiting for full-body pose detection.";
  return t.poseNotDetected;
}

function poseStatusTone(status, readiness, isWebcamOnly, tracking) {
  if (!isWebcamOnly) return "bg-[#43AA8B] text-white";
  if (status === "lost") return "bg-[#F8961E] text-white";
  if (readiness?.ready) return "bg-[#43AA8B] text-white";
  if (tracking?.bodyDetected || readiness?.bodyBlockedByHands) return "bg-[#F9C74F] text-[#604A00]";
  return "bg-[#F9C74F] text-[#604A00]";
}

function liveFeedback(t, poseState, frame, isWebcamOnly) {
  if (!isWebcamOnly) return { level: frame.warningLevel, text: frame.warning };
  const readiness = poseState?.readiness;
  const tracking = poseState?.tracking ?? {};
  if (poseState?.status === "lost") return { level: "warning", text: t.poseLost };
  if (readiness?.bodyBlockedByHands) return { level: "warning", text: t.handsBodyBlocked ?? "Hands detected, but body is blocked. Move your hands away and step back." };
  if (!tracking.bodyDetected) return { level: "warning", text: t.moveBackwardUntilVisible ?? "Move back until your full body is visible." };
  if (!readiness?.fullBodyVisible) return { level: "warning", text: t.moveBackwardUntilVisible ?? "Move back until your full body is visible." };
  if (!readiness?.ready) return { level: readiness?.level ?? "warning", text: readiness?.feedback ?? t.standInMarkedArea };
  return { level: frame.warningLevel ?? "stable", text: frame.warning ?? t.stablePosture };
}

function isCameraStreamActive(stream) {
  return Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === "live"));
}

function liveFeedbackTone(level) {
  if (level === "danger") return "border-[#F94144]/35 bg-[#F94144]/90 text-white";
  if (level === "alert") return "border-[#F8961E]/35 bg-[#F8961E]/92 text-white";
  if (level === "warning") return "border-[#F9C74F]/50 bg-[#F9C74F]/92 text-[#574100]";
  return "border-[#90BE6D]/35 bg-[#90BE6D]/92 text-[#263F21]";
}

function ResultsStep({ t, patient, config, results, patientSessions, savedSession, onSave, onReport, onReturnToProfile }) {
  const boardAvailable = Boolean(results.availableMetrics?.board);
  const postureUnits = getPostureUnits(config.acquisitionMode);
  const [clinicalImpression, setClinicalImpression] = useState(results.interpretation ?? "");
  const [movementFeatures, setMovementFeatures] = useState(null);
  const [movementReviewState, setMovementReviewState] = useState("idle");
  const comparisonSession = patientSessions.find((session) => !savedSession || String(session.id) !== String(savedSession.id));
  const analytics = buildResultAnalytics(results, comparisonSession, t);

  useEffect(() => {
    let cancelled = false;
    const sessionId = savedSession?.id;
    if (!sessionId || Number.isNaN(Number(sessionId))) {
      setMovementFeatures(null);
      setMovementReviewState("idle");
      return;
    }

    setMovementReviewState("loading");
    api.movementFeatures(sessionId)
      .then((features) => {
        if (!cancelled) {
          setMovementFeatures(features);
          setMovementReviewState("ready");
        }
      })
      .catch((error) => {
        console.warn("Movement feature extraction could not be loaded.", error);
        if (!cancelled) {
          setMovementFeatures(null);
          setMovementReviewState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [savedSession?.id]);

  const labelMovement = async (label, intent = "unknown") => {
    const sessionId = savedSession?.id;
    if (!sessionId || Number.isNaN(Number(sessionId))) return;
    setMovementReviewState("saving");
    try {
      await api.createMovementLabel(sessionId, {
        start_ms: 0,
        end_ms: Math.max(0, Number(config.durationSeconds ?? 0) * 1000),
        label,
        intent,
        confidence: 0.8,
        notes: "Whole-session prototype label from results review.",
      });
      const features = await api.movementFeatures(sessionId);
      setMovementFeatures(features);
      setMovementReviewState("ready");
    } catch (error) {
      console.warn("Movement label could not be saved.", error);
      setMovementReviewState("error");
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#43AA8B]">{t.assessmentSummary ?? "Assessment Summary"}</p>
        <ClinicalCard className="mt-3 overflow-hidden border-0 bg-gradient-to-br from-[#0F766E] via-[#43AA8B] to-[#90BE6D] p-0 text-white shadow-xl shadow-slate-200/80">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative p-8">
            <div className="absolute right-5 top-5 rounded-full bg-white/18 px-3 py-1 text-xs font-semibold text-white">
              {acquisitionLabelForResults(config.acquisitionMode, t)}
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">{t.stepResults}</p>
            <p className="mt-2 inline-flex rounded-full bg-white/16 px-3 py-1 text-xs font-semibold text-white/88">
              {results.metricLabel ?? t.estimatedWebcamIndicators ?? "Estimated webcam-based indicators"}
            </p>
            <h2 className="mt-2 text-3xl font-semibold">{patient.fullName}</h2>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-white/85">
              <span className="rounded-full bg-white/14 px-3 py-1">{testTypeLabel(t, config.testType)}</span>
              <span className="rounded-full bg-white/14 px-3 py-1">{conditionLabel(t, config.visualCondition)}</span>
              <span className="rounded-full bg-white/14 px-3 py-1">{config.durationSeconds}s</span>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-white/88">{results.interpretation}</p>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <CircularScore score={results.totalBalanceScore} light />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/75">{t.totalBalanceScore}</p>
                <p className="mt-1 text-5xl font-semibold leading-none">{Math.round(results.totalBalanceScore)}<span className="text-xl text-white/70">/100</span></p>
                <span className="mt-4 inline-flex rounded-full bg-white px-3 py-1 text-sm font-semibold text-rehab-ink">
                  {analytics.sessionLabel}
                </span>
                <p className="mt-3 text-sm font-semibold text-white/90">{analytics.shortInterpretation}</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 border-t border-white/20 bg-white/14 p-5 sm:grid-cols-2 lg:border-l lg:border-t-0">
            {analytics.keyMetrics.map((metric) => (
              <AnalyticsMetricCard key={metric.label} metric={metric} />
            ))}
          </div>
        </div>
      </ClinicalCard>
      </section>

      {results.trackingQuality && !results.trackingQuality.sufficient ? (
        <ClinicalCard className="border-[#F9C74F]/35 bg-[#F9C74F]/12 p-4">
          <p className="text-sm font-semibold text-[#8A6B00]">{t.trackingQualityInsufficient ?? "Tracking quality insufficient"}</p>
          <p className="mt-1 text-xs font-medium text-[#8A6B00]/80">
            {results.trackingQuality.sampleCount ?? 0} {t.recordedSamples ?? "recorded samples"} / {results.trackingQuality.usablePercent ?? 0}% usable tracking.
          </p>
        </ClinicalCard>
      ) : null}

      <ResultsAnalyticsGrid analytics={analytics} t={t} sampleCount={(results.samples ?? []).length} />

      <FullBodyAnalysisPanel t={t} results={results} analytics={analytics} />

      <MovementIntelligencePanel
        t={t}
        savedSession={savedSession}
        features={movementFeatures}
        state={movementReviewState}
        onLabel={labelMovement}
      />

      <section className="space-y-4">
        <AnalyticsSectionHeader title={t.clinicalInterpretationSection ?? "Clinical Interpretation"} />
        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <ClinicalFindingsPanel findings={analytics.findings} t={t} />
          <RecommendationCards recommendations={analytics.recommendations} t={t} />
        </div>
      </section>

      <ClinicalCard className="p-5">
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
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {comparisonSession ? (
            <Button variant="secondary" onClick={() => document.getElementById("session-comparison")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              {t.comparePreviousSession ?? "Compare previous session"}
            </Button>
          ) : null}
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

      {comparisonSession ? (
        <SessionComparisonCard t={t} results={results} previousSession={comparisonSession} postureUnits={postureUnits} />
      ) : null}
    </div>
  );
}

function CircularScore({ score, light = false }) {
  const numeric = Math.max(0, Math.min(100, Number(score) || 0));
  const color = light ? "#FFFFFF" : metricTone(numeric);
  return (
    <div className="relative grid h-44 w-44 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${numeric * 3.6}deg, ${light ? "rgba(255,255,255,0.22)" : "#E2E8F0"} 0deg)` }}>
      <div className={`grid h-36 w-36 place-items-center rounded-full shadow-inner ${light ? "bg-white/16 text-white" : "bg-white"}`}>
        <div className="text-center">
          <p className={`text-5xl font-semibold leading-none ${light ? "text-white" : "text-rehab-ink"}`}>{Math.round(numeric)}</p>
          <p className={`text-xs font-semibold ${light ? "text-white/75" : "text-rehab-muted"}`}>/100</p>
        </div>
      </div>
    </div>
  );
}

function AnalyticsMetricCard({ metric }) {
  const Icon = metric.icon;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/95 p-4 shadow-lg shadow-slate-900/5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ backgroundColor: metric.color }}>
          <Icon size={18} />
        </span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${metric.trendClass}`}>{metric.trendArrow} {metric.trendLabel}</span>
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-rehab-muted">{metric.label}</p>
      <p className="mt-1 text-3xl font-semibold text-rehab-ink">{Math.round(metric.score)}<span className="text-sm text-rehab-muted">/100</span></p>
      <div className="mt-3 h-12">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={metric.sparkline}>
            <Line type="monotone" dataKey="value" stroke={metric.color} strokeWidth={3} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ResultsAnalyticsGrid({ analytics, t, sampleCount }) {
  return (
    <section className="space-y-6">
      <AnalyticsSectionHeader title={t.mainTrendSection ?? "Main Trend"} subtitle={`${sampleCount} ${t.recordedSamples ?? "recorded samples"}`} />
      <AnalyticsChartCard title={t.stabilityOverTime ?? "Stability score over time"} size="large">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={analytics.timeSeries} margin={{ top: 12, right: 26, left: 0, bottom: 12 }}>
            <CartesianGrid stroke="#D9E4EA" strokeDasharray="3 3" />
            <XAxis dataKey="t" stroke="#577590" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} stroke="#577590" tick={{ fontSize: 12 }} />
            <ReferenceArea y1={75} y2={100} fill="#90BE6D" fillOpacity={0.18} />
            <ReferenceLine y={75} stroke="#90BE6D" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="stability" stroke="#43AA8B" strokeWidth={4} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </AnalyticsChartCard>

      <AnalyticsSectionHeader title={t.movementAnalysis ?? "Movement Analysis"} />
      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <AnalyticsChartCard title={t.bodyCenterTrajectory ?? "Body center movement trajectory"} size="medium">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 22, bottom: 22, left: 8 }}>
              <CartesianGrid stroke="#D9E4EA" strokeDasharray="3 3" />
              <XAxis type="number" dataKey="centerX" stroke="#577590" tick={{ fontSize: 12 }} />
              <YAxis type="number" dataKey="trunkY" stroke="#577590" tick={{ fontSize: 12 }} />
              <ReferenceLine x={0} stroke="#F9C74F" strokeDasharray="4 4" />
              <ReferenceLine y={0} stroke="#F9C74F" strokeDasharray="4 4" />
              <Scatter data={analytics.trajectory} fill="#F8961E" isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </AnalyticsChartCard>
        <AnalyticsChartCard title={t.bodyCenterHeatmap ?? "Body center heatmap"} size="medium">
          <BodyCenterHeatmap samples={analytics.timeSeries} />
        </AnalyticsChartCard>
      </div>

      <AnalyticsSectionHeader title={t.postureAnalysis ?? "Posture Analysis"} />
      <div className="grid gap-5 lg:grid-cols-2">
        <AnalyticsChartCard title={t.trunkDeviationOverTime ?? "Trunk deviation over time"} size="medium">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics.timeSeries} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="#D9E4EA" strokeDasharray="3 3" />
              <XAxis dataKey="t" stroke="#577590" tick={{ fontSize: 12 }} />
              <YAxis stroke="#577590" tick={{ fontSize: 12 }} />
              <ReferenceLine y={8} stroke="#F8961E" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="trunk" stroke="#F8961E" strokeWidth={4} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </AnalyticsChartCard>
        <AnalyticsChartCard title={t.symmetryBars ?? "Shoulder / hip symmetry"} size="medium">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.symmetryBars} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="#D9E4EA" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#577590" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} stroke="#577590" tick={{ fontSize: 12 }} />
              <Bar dataKey="score" fill="#577590" radius={[10, 10, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </AnalyticsChartCard>
      </div>

      <AnalyticsSectionHeader title={t.progressComparisonSection ?? "Progress Comparison"} />
      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <AnalyticsChartCard title={t.sessionProgressComparison ?? "Session progress comparison"} size="medium">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.progressComparison} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="#D9E4EA" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#577590" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} stroke="#577590" tick={{ fontSize: 12 }} />
              <Bar dataKey="score" fill="#43AA8B" radius={[10, 10, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </AnalyticsChartCard>
        <AnalyticsChartCard title={t.functionalRadar ?? "Functional radar profile"} size="radar">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={analytics.radar}>
              <PolarGrid stroke="#B8C7D3" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "#577590", fontSize: 13 }} />
              <Radar dataKey="score" stroke="#43AA8B" fill="#43AA8B" fillOpacity={0.4} isAnimationActive={false} />
            </RadarChart>
          </ResponsiveContainer>
        </AnalyticsChartCard>
      </div>
    </section>
  );
}

function FullBodyAnalysisPanel({ t, results, analytics }) {
  const groups = buildFullBodyMetricGroups(results, t);
  return (
    <section className="space-y-4">
      <AnalyticsSectionHeader
        title={t.fullBodyAnalysis ?? "Full-body analysis"}
        subtitle={t.fullBodyAnalysisDesc ?? "Landmark-derived posture, head, arm, and alignment indicators"}
      />
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => (
          <ClinicalCard key={group.title} className="border-0 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-rehab-ink">{group.title}</p>
                <p className="mt-1 text-xs text-rehab-muted">{group.description}</p>
              </div>
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${group.color}1F`, color: group.color }}>
                {group.availableCount}/{group.items.length}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {group.items.map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-rehab-muted">{item.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${metricAvailabilityClass(item.value)}`}>
                      {item.value == null ? (t.notAvailable ?? "Not available") : item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-lg font-semibold text-rehab-ink">{formatMetricValue(item.value, item.unit)}</p>
                </div>
              ))}
            </div>
          </ClinicalCard>
        ))}
      </div>
      <ClinicalCard className="border-0 bg-[#577590]/8 p-5">
        <div className="grid gap-4 sm:grid-cols-4">
          {analytics.secondaryScores.map((score) => (
            <div key={score.label}>
              <p className="text-xs font-semibold text-rehab-muted">{score.label}</p>
              <p className="mt-1 text-2xl font-semibold text-rehab-ink">{Math.round(score.value)}<span className="text-sm text-rehab-muted">/100</span></p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-3 border-t border-[#577590]/15 pt-4 sm:grid-cols-3">
          {engineCoverageItems(results.engineCoverage, t).map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
              <span className="text-xs font-semibold text-rehab-muted">{item.label}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.className}`}>{item.value}</span>
            </div>
          ))}
        </div>
      </ClinicalCard>
    </section>
  );
}

function MovementIntelligencePanel({ t, savedSession, features, state, onLabel }) {
  const featureRows = [
    [t.estimatedBodySway ?? "Estimated body sway", features?.features?.estimated_body_sway, "% frame"],
    [t.movementSmoothness ?? "Movement smoothness", features?.features?.movement_smoothness, ""],
    [t.handArmCompensation ?? "Hand/arm compensation", features?.features?.hand_arm_compensation, "%"],
    [t.postureSymmetry ?? "Posture symmetry", features?.features?.posture_symmetry, "/100"],
    [t.headMovement ?? "Head movement", features?.features?.head_movement, "% frame"],
    [t.bodySwayVelocity ?? "Body sway velocity", features?.features?.body_sway_velocity, "%/s"],
    [t.dominantFrequency ?? "Dominant frequency", features?.features?.dominant_frequency_hz, "Hz"],
    [t.movementJerk ?? "Movement jerk", features?.features?.movement_jerk, ""],
  ];
  const quality = features?.tracking_quality;
  const disabled = !savedSession || state === "saving" || state === "loading";

  return (
    <section className="space-y-4">
      <AnalyticsSectionHeader
        title={t.movementIntelligence ?? "Movement intelligence dataset"}
        subtitle={t.movementIntelligenceDesc ?? "Feature extraction and clinician labels for future ML training"}
      />
      <ClinicalCard className="border-0 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <p className="text-sm font-semibold text-rehab-ink">{t.modelReadiness ?? "Model readiness"}</p>
            <div className="mt-3 grid gap-2 text-sm">
              <FeatureStatusRow label={t.sessionSaved ?? "Session saved"} value={savedSession ? (t.ok ?? "OK") : (t.saveSessionFirst ?? "Save session first")} good={Boolean(savedSession)} />
              <FeatureStatusRow label={t.trackingQuality ?? "Tracking quality"} value={quality?.message ?? (state === "loading" ? "Loading" : "Pending")} good={Boolean(quality?.sufficient)} />
              <FeatureStatusRow label={t.intentEstimate ?? "Intent estimate"} value={features?.intent_estimate ?? "unknown"} good={features?.intent_estimate && features.intent_estimate !== "unknown"} />
              <FeatureStatusRow label={t.labelsCount ?? "Labels"} value={features?.labels_count ?? 0} good={(features?.labels_count ?? 0) > 0} />
            </div>
            <p className="mt-4 rounded-xl border border-[#F9C74F]/30 bg-[#F9C74F]/12 p-3 text-xs font-semibold leading-5 text-[#8A6B00]">
              {features?.note ?? t.intentModelNotTrained ?? "Voluntary vs involuntary classification is not trained yet. Add clinician labels to build the dataset."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" disabled={disabled} onClick={() => onLabel("voluntary", "voluntary")}>{t.labelVoluntary ?? "Label voluntary"}</Button>
              <Button variant="secondary" disabled={disabled} onClick={() => onLabel("involuntary", "involuntary")}>{t.labelInvoluntary ?? "Label involuntary"}</Button>
              <Button variant="secondary" disabled={disabled} onClick={() => onLabel("compensation", "unknown")}>{t.labelCompensation ?? "Label compensation"}</Button>
              <Button variant="secondary" disabled={disabled} onClick={() => onLabel("tracking_failure", "unknown")}>{t.labelTrackingFailure ?? "Label tracking failure"}</Button>
            </div>
            {state === "error" ? (
              <p className="mt-3 text-xs font-semibold text-[#B4232A]">{t.movementFeaturesUnavailable ?? "Movement feature service unavailable. Save the session and make sure the backend is running."}</p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {featureRows.map(([label, value, unit]) => (
              <div key={label} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                <p className="text-xs font-semibold text-rehab-muted">{label}</p>
                <p className="mt-1 text-xl font-semibold text-rehab-ink">{formatMetricValue(value, unit)}</p>
              </div>
            ))}
          </div>
        </div>
      </ClinicalCard>
    </section>
  );
}

function FeatureStatusRow({ label, value, good }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2">
      <span className="text-xs font-semibold text-rehab-muted">{label}</span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${good ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-rehab-muted"}`}>
        {value}
      </span>
    </div>
  );
}

function AnalyticsSectionHeader({ title, subtitle }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h3 className="text-xl font-semibold text-rehab-ink">{title}</h3>
      {subtitle ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-rehab-muted">{subtitle}</span> : null}
    </div>
  );
}

function AnalyticsChartCard({ title, children, size = "medium", className = "" }) {
  const height = size === "large" ? "h-[26rem]" : size === "radar" ? "h-[24rem]" : "h-[22rem]";
  return (
    <div className={`rounded-2xl border border-rehab-line bg-white p-5 shadow-sm ${className}`}>
      <p className="font-semibold text-rehab-ink">{title}</p>
      <div className={`mt-4 ${height}`}>{children}</div>
    </div>
  );
}

function BodyCenterHeatmap({ samples }) {
  const cells = samples.slice(-40);
  return (
    <div className="grid h-full grid-cols-8 gap-1">
      {cells.length ? cells.map((sample, index) => {
        const intensity = Math.min(1, Math.abs(sample.centerAbs ?? 0) / 18);
        const color = intensity > 0.72 ? "#F94144" : intensity > 0.42 ? "#F8961E" : intensity > 0.22 ? "#F9C74F" : "#43AA8B";
        return <div key={`${sample.t}-${index}`} className="rounded-md" style={{ backgroundColor: color, opacity: 0.35 + intensity * 0.65 }} title={`${sample.centerAbs}%`} />;
      }) : <div className="col-span-8 grid place-items-center rounded-xl border border-dashed border-white/20 text-sm font-semibold text-slate-300">No recorded samples</div>}
    </div>
  );
}

function ClinicalFindingsPanel({ findings, t }) {
  return (
    <ClinicalCard className="border-0 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
      <SectionHeader title={t.clinicalFindings ?? "Clinical findings"} description={t.clinicalFindingsDesc ?? "Color-coded observations from recorded posture metrics."} />
      <div className="mt-5 grid gap-3">
        {findings.map((finding) => (
          <div key={finding.text} className={`rounded-2xl border p-4 shadow-sm ${findingToneClass(finding.tone)}`}>
            <p className="text-sm font-semibold">{finding.text}</p>
          </div>
        ))}
      </div>
    </ClinicalCard>
  );
}

function RecommendationCards({ recommendations, t }) {
  return (
    <ClinicalCard className="border-0 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
      <SectionHeader title={t.recommendations} description={t.recommendationsDesc ?? "Rule-based rehabilitation support suggestions."} />
      <div className="mt-5 grid gap-3">
        {recommendations.map((recommendation) => (
          <div key={recommendation.text} className={`rounded-2xl border p-4 shadow-sm ${findingToneClass(recommendation.tone)}`}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{recommendation.label}</p>
            <p className="mt-1 text-sm font-semibold">{recommendation.text}</p>
          </div>
        ))}
      </div>
    </ClinicalCard>
  );
}

function buildResultAnalytics(results, previousSession, t = {}) {
  const samples = Array.isArray(results.samples) ? results.samples : [];
  const timeSeries = samples.map((sample, index) => ({
    t: sample.t ?? index,
    stability: finite(sample.stability ?? sample.posture ?? results.postureStabilityScore),
    posture: finite(sample.posture ?? results.postureStabilityScore),
    trunk: finite(sample.trunkInclination ?? sample.trunkDeviation ?? results.trunkDeviation),
    shoulder: finite(sample.shoulderAsymmetry ?? results.shoulderAsymmetry),
    hip: finite(sample.hipAsymmetry ?? results.hipAsymmetry),
    centerAbs: finite(sample.bodyCenterDeviation ?? results.bodyCenterDeviation),
    centerX: finite(sample.signedBodyCenterDeviation ?? sample.bodyCenterDeviation ?? 0),
    trunkY: finite(sample.signedTrunkInclination ?? sample.trunkInclination ?? sample.trunkDeviation ?? 0),
    estimatedBodySway: finite(sample.estimatedBodySway ?? sample.bodyCenterDeviation ?? 0),
    handArmCompensation: finite(sample.handArmCompensation ?? results.handArmCompensation ?? 0),
  }));

  const stabilityScore = finite(results.stabilityScore ?? results.totalBalanceScore);
  const postureScore = finite(results.postureStabilityScore ?? results.totalBalanceScore);
  const alignmentScore = finite(results.alignmentScore ?? scoreFromDeviation(results.bodyCenterDeviation, 7));
  const symmetryScore = finite(results.symmetryScore ?? scoreFromDeviation((finite(results.shoulderAsymmetry) + finite(results.hipAsymmetry)) / 2, 8));
  const trunkControlScore = finite(results.trunkControlScore ?? scoreFromDeviation(results.trunkDeviation, 6.5));
  const posturalControlScore = finite(results.posturalControlScore ?? stabilityScore);
  const previousScore = getSessionMetric(previousSession, "totalScore", "totalBalanceScore");
  const scoreDelta = Number.isFinite(previousScore) && previousScore > 0 ? roundDelta(results.totalBalanceScore - previousScore) : 0;

  const keyMetrics = [
    makeMetric(t.stabilityScore ?? "Stability score", stabilityScore, Activity, "#43AA8B", timeSeries.map((item) => item.stability)),
    makeMetric(t.estimatedBodySway ?? "Estimated body sway", deviationScore(results.estimatedBodySway, 11), ShieldCheck, "#90BE6D", timeSeries.map((item) => deviationScore(item.estimatedBodySway, 11))),
    makeMetric(t.postureSymmetry ?? "Posture symmetry", symmetryScore, UserRound, "#577590", timeSeries.map((item) => scoreFromDeviation((item.shoulder + item.hip) / 2, 8))),
    makeMetric(t.movementSmoothness ?? "Movement smoothness", finite(results.movementSmoothnessScore ?? stabilityScore), Target, "#F8961E", timeSeries.map((item) => item.stability)),
  ];

  const findings = [
    findingFromScore(stabilityScore, "Posture stability remained within the expected supervised range.", "Posture stability requires attention during progression.", "Posture stability indicates elevated instability risk."),
    findingFromScore(alignmentScore, "Body center alignment is well controlled.", "Body center movement increased during the assessment.", "Body center deviation is high and should be reviewed."),
    findingFromScore(symmetryScore, "Shoulder and hip symmetry are clinically acceptable.", "Asymmetry is present and should be monitored.", "Marked asymmetry detected during the assessment."),
    findingFromScore(trunkControlScore, "Trunk control is stable.", "Trunk deviation is increased.", "Trunk control requires focused intervention."),
  ];

  const recommendationCards = (results.recommendations ?? []).map((text) => ({
    label: "Recommendation",
    text,
    tone: recommendationTone(text),
  }));

  return {
    timeSeries,
    trajectory: timeSeries.map((item) => ({ centerX: item.centerX, trunkY: item.trunkY })),
    keyMetrics,
    findings,
    recommendations: recommendationCards.length ? recommendationCards : [{ label: "Recommendation", text: "Continue supervised balance training and repeat assessment for trend monitoring.", tone: "good" }],
    radar: [
      { metric: t.stability ?? "Stability", score: stabilityScore },
      { metric: t.symmetry ?? "Symmetry", score: symmetryScore },
      { metric: t.alignment ?? "Alignment", score: alignmentScore },
      { metric: t.trunkControl ?? "Trunk Control", score: trunkControlScore },
      { metric: t.posture ?? "Posture", score: postureScore },
    ],
    secondaryScores: [
      { label: t.alignment ?? "Alignment", value: alignmentScore },
      { label: t.symmetry ?? "Symmetry", value: symmetryScore },
      { label: t.trunkControl ?? "Trunk control", value: trunkControlScore },
      { label: t.posturalControl ?? "Postural control", value: posturalControlScore },
    ],
    symmetryBars: [
      { name: "Shoulder", score: scoreFromDeviation(results.shoulderAsymmetry, 10) },
      { name: "Hip", score: scoreFromDeviation(results.hipAsymmetry, 10) },
    ],
    progressComparison: previousScore > 0
      ? [
          { name: "Previous", score: previousScore },
          { name: "Current", score: results.totalBalanceScore },
        ]
      : [{ name: "Current", score: results.totalBalanceScore }],
    sessionLabel: scoreDelta > 2 ? "Improving" : scoreDelta < -2 ? "Declining" : results.totalBalanceScore < 65 ? "Follow-up" : "Stable",
    shortInterpretation: scoreDelta > 2 ? `Improved by ${scoreDelta} points since last session.` : scoreDelta < -2 ? `Declined by ${Math.abs(scoreDelta)} points since last session.` : "Current session shows stable functional balance indicators.",
  };
}

function buildFullBodyMetricGroups(results, t = {}) {
  const movementItems = [
    metricItem(t.estimatedBodySway ?? "Estimated body sway", results.estimatedBodySway, "% frame", 6, false, t),
    metricItem(t.shoulderCenterMovement ?? "Shoulder center movement", results.shoulderCenterMovement, "% frame", 6, false, t),
    metricItem(t.hipCenterMovement ?? "Hip center movement", results.hipCenterMovement, "% frame", 6, false, t),
    metricItem(t.headMovement ?? "Head movement", results.headMovement, "% frame", 6, false, t),
    metricItem(t.handArmCompensation ?? "Hand/arm compensation", results.handArmCompensation, "%", 35, false, t),
    metricItem(t.movementSmoothness ?? "Movement smoothness", results.movementSmoothnessScore, "/100", 70, true, t),
  ];
  const postureItems = [
    metricItem(t.trunkInclinationMetric ?? "Trunk inclination", results.trunkInclination ?? results.trunkDeviation, "deg", 8, false, t),
    metricItem(t.trunkRotation ?? "Trunk rotation", results.trunkRotation, "deg", 10, false, t),
    metricItem(t.pelvicTilt ?? "Pelvic tilt", results.pelvicTilt, "deg", 5, false, t),
    metricItem(t.weightShift ?? "Weight shift", results.weightShiftEstimation, "%", 9, false, t),
  ];
  const headItems = [
    metricItem(t.headTilt ?? "Head tilt", results.headTilt, "deg", 8, false, t),
    metricItem(t.headRotation ?? "Head rotation", results.headRotation, "%", 8, false, t),
    metricItem(t.chinDeviation ?? "Chin deviation", results.chinDeviation, "%", 5, false, t),
    metricItem(t.eyeAlignment ?? "Eye alignment", results.eyeAlignment, "deg", 5, false, t),
  ];
  const symmetryItems = [
    metricItem(t.shoulderAsymmetry ?? "Shoulder asymmetry", results.shoulderAsymmetry, "deg", 5, false, t),
    metricItem(t.hipAsymmetry ?? "Hip asymmetry", results.hipAsymmetry, "deg", 5, false, t),
    metricItem(t.armSymmetry ?? "Arm symmetry", results.armSymmetry, "%", 12, false, t),
    metricItem(t.armDrift ?? "Arm drift", results.armDrift, "%", 12, false, t),
  ];

  return [
    {
      title: t.webcamMovementIndicators ?? "Estimated webcam-based indicators",
      description: t.webcamMovementIndicatorsDesc ?? "Calculated from recorded MediaPipe landmark movement; force-plate metrics are not inferred.",
      color: "#43AA8B",
      items: movementItems,
      availableCount: movementItems.filter((item) => item.value != null).length,
    },
    {
      title: t.postureAlignmentGroup ?? "Posture and alignment",
      description: t.postureAlignmentGroupDesc ?? "Trunk, pelvis, center shift",
      color: "#577590",
      items: postureItems,
      availableCount: postureItems.filter((item) => item.value != null).length,
    },
    {
      title: t.headFaceTracking ?? "Head and face tracking",
      description: t.headFaceTrackingDesc ?? "Face Landmarker when available",
      color: "#F8961E",
      items: headItems,
      availableCount: headItems.filter((item) => item.value != null).length,
    },
    {
      title: t.symmetryUpperLimbs ?? "Symmetry and upper limbs",
      description: t.symmetryUpperLimbsDesc ?? "Shoulders, hips, hands",
      color: "#90BE6D",
      items: symmetryItems,
      availableCount: symmetryItems.filter((item) => item.value != null).length,
    },
  ];
}

function metricItem(label, value, unit, threshold, higherIsBetter, t = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return { label, value: null, unit, status: t.notAvailable ?? "Not available" };
  }
  const isGood = higherIsBetter ? numeric >= threshold : numeric <= threshold;
  const isWarning = higherIsBetter ? numeric >= threshold - 10 : numeric <= threshold * 1.5;
  return {
    label,
    value: numeric,
    unit,
    status: isGood ? (t.withinRange ?? "Within range") : isWarning ? (t.monitor ?? "Monitor") : (t.attention ?? "Attention"),
  };
}

function formatMetricValue(value, unit) {
  if (value == null) return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${Math.round(numeric * 10) / 10}${unit ? ` ${unit}` : ""}`;
}

function metricAvailabilityClass(value) {
  if (value == null) return "bg-slate-100 text-rehab-muted";
  return "bg-emerald-50 text-emerald-700";
}

function engineCoverageItems(engineCoverage = {}, t = {}) {
  return [
    engineCoverageItem(t.poseTracking ?? "Pose tracking", engineCoverage.pose, t),
    engineCoverageItem(t.faceTracking ?? "Face tracking", engineCoverage.face, t),
    engineCoverageItem(t.handTracking ?? "Hand tracking", engineCoverage.hands, t),
  ];
}

function engineCoverageItem(label, coverage = {}, t = {}) {
  if (!coverage?.available) {
    return {
      label,
      value: t.notAvailable ?? "Not available",
      className: "bg-slate-100 text-rehab-muted",
    };
  }
  const percent = Number(coverage.detectedPercent) || 0;
  return {
    label,
    value: `${percent}%`,
    className: percent >= 75 ? "bg-emerald-50 text-emerald-700" : percent >= 35 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700",
  };
}

function makeMetric(label, score, icon, color, values) {
  const cleanValues = values.filter((value) => Number.isFinite(value));
  const first = cleanValues[0] ?? score;
  const last = cleanValues[cleanValues.length - 1] ?? score;
  const delta = roundDelta(last - first);
  return {
    label,
    score,
    icon,
    color,
    trendArrow: Math.abs(delta) <= 2 ? "→" : delta > 0 ? "↑" : "↓",
    trendLabel: Math.abs(delta) <= 2 ? "stable" : `${delta > 0 ? "+" : ""}${delta}`,
    trendClass: Math.abs(delta) <= 2 ? "bg-slate-100 text-rehab-muted" : delta > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
    sparkline: cleanValues.length ? cleanValues.map((value, index) => ({ index, value })) : [{ index: 0, value: score }],
  };
}

function findingFromScore(score, good, attention, risk) {
  if (score >= 80) return { tone: "good", text: good };
  if (score >= 65) return { tone: "attention", text: attention };
  return { tone: "risk", text: risk };
}

function findingToneClass(tone) {
  if (tone === "risk") return "border-[#F94144]/25 bg-[#F94144]/10 text-[#B4232A]";
  if (tone === "attention") return "border-[#F8961E]/25 bg-[#F8961E]/12 text-[#9A4B00]";
  return "border-[#90BE6D]/25 bg-[#90BE6D]/12 text-[#3E6E31]";
}

function statusToneFromScore(score) {
  const numeric = Number(score);
  if (numeric >= 80) return "connected";
  if (numeric >= 65) return "warning";
  return "danger";
}

function acquisitionLabelForResults(mode, t = {}) {
  if (mode === acquisitionModes.webcam) return t.webcamBasedAssessment ?? "Webcam-Based Assessment";
  if (mode === acquisitionModes.demo) return t.demoAssessmentMode ?? "Demo Mode";
  if (mode === acquisitionModes.board) return t.boardSensorsOnly ?? "Board sensors only";
  if (mode === acquisitionModes.combined) return t.combinedWebcamBoard ?? "Combined webcam + board";
  return mode ?? "-";
}

function recommendationTone(text = "") {
  const lowered = text.toLowerCase();
  if (lowered.includes("high") || lowered.includes("poor") || lowered.includes("worse")) return "risk";
  if (lowered.includes("continue") || lowered.includes("progress")) return "good";
  return "attention";
}

function scoreFromDeviation(value, multiplier) {
  return Math.max(0, Math.min(100, Math.round(100 - finite(value) * multiplier)));
}

function deviationScore(value, multiplier) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return scoreFromDeviation(numeric, multiplier);
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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
    <div id="session-comparison" className="mt-5 rounded-lg border border-rehab-line bg-white p-4">
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
