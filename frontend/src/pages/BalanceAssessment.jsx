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
import { ContextStrip } from "../components/clinical/ContextStrip";
import { EmptyState } from "../components/clinical/EmptyState";
import { SectionHeader } from "../components/clinical/SectionHeader";
import { StatusBadge } from "../components/clinical/StatusBadge";
import { api } from "../api/client.js";
import { sessionStateLabel } from "../i18n/clinicalValues.js";
import { acquisitionModes, createAssessmentSource, getAssessmentSourceOptions } from "../assessment/sources/index.js";
import { buildSession, statusText } from "../utils/assessment";
import { WebcamPoseAssessment } from "../webcam/WebcamPoseAssessment.jsx";

export function BalanceAssessmentPage({ t, patients, sessions, onSaveSession, onSaveReport, onDownloadSessionReport, preselectedPatientId, onClearPreselectedPatient, onReturnToPatientProfile, onWorkflowFocusChange, webcamMirrored = true }) {
  const [workflowOpen, setWorkflowOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [selectedPatientId, setSelectedPatientId] = useState(preselectedPatientId ?? null);
  const [config, setConfig] = useState({
    acquisitionMode: acquisitionModes.webcam,
    testType: "static",
    visualCondition: "eyes_open",
    durationSeconds: 30,
    notes: "",
  });
  // All safety confirmations start unchecked: checking them must be a
  // deliberate clinician action, not a default.
  const [checklist, setChecklist] = useState({
    board: false,
    ring: false,
    webcam: false,
    esp32: false,
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
  const steps = [t.setup ?? "Setup", t.record ?? "Record", t.review ?? "Review"];
  const sourceConfig = useMemo(() => ({ ...config, patientId: selectedPatientId }), [config, selectedPatientId]);
  const activeSource = useMemo(() => createAssessmentSource({ mode: sourceConfig.acquisitionMode, config: sourceConfig, t }), [sourceConfig, t]);
  const countdownIntervalRef = useRef(null);
  const countdownLostTimeoutRef = useRef(null);
  const completionTimeoutRef = useRef(null);

  useEffect(() => {
    if (preselectedPatientId) {
      setSelectedPatientId(preselectedPatientId);
      setWorkflowOpen(true);
      setStep(0);
      onClearPreselectedPatient();
    }
  }, [preselectedPatientId, onClearPreselectedPatient]);

  useEffect(() => {
    onWorkflowFocusChange?.(workflowOpen && step === 1);
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
      setStep(2);
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
    if (!workflowOpen || step !== 1 || results || assessmentPhase !== "positioning") return;
    const boardReady = ![acquisitionModes.board, acquisitionModes.combined].includes(config.acquisitionMode) || (liveFrame.boardStatus === "connected" && Number(liveFrame.boardSampleCount ?? 0) > 0);
    const webcamReady = ![acquisitionModes.webcam, acquisitionModes.combined].includes(config.acquisitionMode) || Boolean(poseState?.readiness?.ready);
    const calibrationReady = config.acquisitionMode === acquisitionModes.demo || (webcamReady && boardReady);
    if (calibrationReady) {
      startCalibrationCountdown();
    }
  }, [workflowOpen, step, config.acquisitionMode, results, assessmentPhase, poseState, liveFrame.boardStatus, liveFrame.boardSampleCount]);

  useEffect(() => {
    if (
      step !== 1 ||
      assessmentPhase !== "countdown" ||
      ![acquisitionModes.webcam, acquisitionModes.combined].includes(config.acquisitionMode)
    ) return;

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
    if (!workflowOpen || step !== 1 || results || assessmentPhase !== "assessing" || !assessmentRunning) return;

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
    if (!workflowOpen || step !== 1 || results || config.acquisitionMode !== acquisitionModes.combined) return;
    const timer = window.setInterval(() => {
      setLiveFrame(activeSource.getFrame(elapsed));
    }, 250);
    return () => window.clearInterval(timer);
  }, [workflowOpen, step, results, config.acquisitionMode, activeSource, elapsed]);

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

  const canStart =
    config.acquisitionMode === acquisitionModes.webcam
      ? checklist.webcam && checklist.supervision
      : config.acquisitionMode === acquisitionModes.demo
        ? checklist.webcam && checklist.supervision
      : Object.values(checklist).every(Boolean);
  const currentStepLabel = template(t.stepOfTotal, { current: step + 1, total: 3, step: steps[step] });

  const handleStartRecording = async () => {
    clearCountdownInterval();
    setElapsed(0);
    setResults(null);
    setSourceError("");
    setPoseState(null);
    setCountdown(null);
    setAssessmentPhase("positioning");
    setAssessmentRunning(false);
    try {
      await activeSource.start();
      const sourceStream = activeSource.getStream?.() ?? null;
      setWebcamStream(sourceStream || null);
      setLiveFrame(activeSource.getFrame(0));
      setStep(1);
    } catch (error) {
      console.warn("Webcam acquisition could not start.", error);
      setSourceError(t.webcamPermissionDenied);
    }
  };

  const handleGenerateReport = async () => {
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
  };

  const handleDone = () => {
    setStep(0);
    setSelectedPatientId(null);
    setResults(null);
    clearCountdownInterval();
    setCountdown(null);
    setElapsed(0);
    setAssessmentPhase("positioning");
    setAssessmentRunning(false);
    setSavedSession(null);
    setReport(null);
  };

  return (
    <div className="space-y-5">
      {step !== 1 ? (
        <>
          <ContextStrip
            t={t}
            patient={selectedPatient}
            status={sessionStateLabel(t, results ? "Completed" : "Draft")}
            step={currentStepLabel}
            nextAction={step < 2 ? steps[Math.min(step + 1, 2)] : t.downloadReport}
          />

          <ClinicalCard className="overflow-hidden p-0">
            <div className="grid md:grid-cols-3">
              {steps.map((item, index) => (
                <div key={item} className={`flex items-center gap-3 px-5 py-4 text-sm font-semibold ${index === step ? "bg-rehab-teal text-white" : index < step ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-rehab-muted"}`}>
                  <span className={`inline-grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${index === step ? "bg-white/20" : index < step ? "bg-emerald-100 text-emerald-700" : "bg-white text-rehab-muted"}`}>
                    {index + 1}
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </ClinicalCard>
        </>
      ) : null}

      {step === 0 ? (
        <SetupStep
          t={t}
          patients={patients}
          selectedPatientId={selectedPatientId}
          onSelectPatient={setSelectedPatientId}
          config={config}
          onChangeConfig={setConfig}
          checklist={checklist}
          onChangeChecklist={setChecklist}
          canStart={canStart}
          sourceError={sourceError}
          onStart={handleStartRecording}
        />
      ) : null}

      {step === 1 ? (
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

      {step === 2 && results ? (
        <ReviewStep
          patient={selectedPatient}
          t={t}
          config={config}
          results={results}
          patientSessions={sessions.filter((session) => session.patientId === selectedPatient.id)}
          savedSession={savedSession}
          report={report}
          onSave={async (clinicalImpression) => {
            const session = buildSession({ patient: selectedPatient, config, results, clinician_impression: clinicalImpression });
            const saved = await onSaveSession(session);
            setSavedSession(saved ?? session);
          }}
          onGenerateReport={handleGenerateReport}
          onDownload={() => onDownloadSessionReport({ patient: selectedPatient, session: savedSession })}
          onReturnToProfile={() => onReturnToPatientProfile(selectedPatient.id, "sessions")}
          onReturnToReports={() => onReturnToPatientProfile(selectedPatient.id, "reports")}
          onDone={handleDone}
        />
      ) : null}
    </div>
  );
}

function SetupStep({ t, patients, selectedPatientId, onSelectPatient, config, onChangeConfig, checklist, onChangeChecklist, canStart, sourceError, onStart }) {
  const [query, setQuery] = useState("");
  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const sourceOptions = getAssessmentSourceOptions(t);

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase();
    return patients.filter((p) => `${p.fullName} ${p.patientCode} ${p.pathology}`.toLowerCase().includes(normalized));
  }, [patients, query]);

  const checklistItems =
    config.acquisitionMode === acquisitionModes.webcam
      ? [["webcam", t.webcamReadyPrimary], ["supervision", t.supervisionConfirmed]]
      : config.acquisitionMode === acquisitionModes.demo
        ? [["webcam", t.demoDataSourceActive], ["supervision", t.supervisionConfirmed]]
        : [
            ["board", t.boardPositioned],
            ["ring", t.ringConfirmed],
            ["webcam", t.webcamReady],
            ["esp32", t.esp32Ready],
            ["supervision", t.supervisionConfirmed],
          ];

  return (
    <div className="space-y-4">
      {/* ── 1. Patient selection ── */}
      <ClinicalCard className="p-5">
        <SectionHeader title={t.stepSelectPatient} description={t.choosePatientBeforeConfig} />

        <div className={`mt-5 rounded-xl border p-4 shadow-sm ${selectedPatient ? "border-teal-200 bg-teal-50" : "border-rehab-line bg-white"}`}>
          <div className="flex items-center gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${selectedPatient ? "bg-rehab-teal text-white" : "bg-slate-100 text-rehab-muted"}`}>
              <UserRound size={20} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{t.selectedPatient}</p>
              {selectedPatient ? (
                <p className="mt-0.5 text-sm font-semibold text-rehab-ink">
                  {selectedPatient.fullName}
                  <span className="ml-2 font-normal text-rehab-muted">· {selectedPatient.patientCode} — {t.clinicalTerms?.pathologies?.[selectedPatient.pathology] ?? selectedPatient.pathology}</span>
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-rehab-muted">{t.choosePatientToContinue}</p>
              )}
            </div>
          </div>
        </div>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-3 text-rehab-muted" size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-lg border border-rehab-line py-2.5 pl-10 pr-3 text-sm outline-none focus:border-rehab-teal" placeholder={t.searchPatient} />
        </div>

        <div className="mt-4 max-h-72 overflow-y-auto rounded-lg pr-0.5">
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((patient) => (
            <button
              key={patient.id}
              type="button"
              onClick={() => onSelectPatient(patient.id)}
              className={`rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-clinical ${selectedPatientId === patient.id ? "border-rehab-teal bg-teal-50 ring-2 ring-rehab-teal/15" : "border-rehab-line bg-white"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`grid h-11 w-11 place-items-center rounded-xl text-xs font-semibold ${selectedPatientId === patient.id ? "bg-rehab-teal text-white" : "bg-rehab-blue/10 text-rehab-blue"}`}>
                    {initials(patient.fullName)}
                  </span>
                  <div>
                    <p className="font-semibold text-rehab-ink">{patient.fullName}</p>
                    <p className="text-sm text-rehab-muted">{patient.patientCode} · {patient.age} {t.years} · {t.clinicalTerms?.pathologies?.[patient.pathology] ?? patient.pathology}</p>
                  </div>
                </div>
                <StatusBadge tone={patient.status === "Declining" ? "danger" : patient.status === "Follow-up" ? "warning" : "connected"}>
                  {statusLabel(t, patient.status)}
                </StatusBadge>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-rehab-muted sm:grid-cols-2">
                <p><span className="font-semibold text-rehab-ink">{t.clinicalGoal}:</span> {t.clinicalTerms?.goals?.[patient.clinicalGoal] ?? patient.clinicalGoal ?? "-"}</p>
                <p><span className="font-semibold text-rehab-ink">{t.dominantSide}:</span> {t.clinicalTerms?.sides?.[patient.dominantSide] ?? patient.dominantSide ?? "-"}</p>
              </div>
              {patient.latestScore ? <ScoreBar label={t.latestScore} score={patient.latestScore} /> : null}
            </button>
          ))}
        </div>
        </div>
      </ClinicalCard>

      {/* ── 2. Test configuration ── */}
      <ClinicalCard className={`p-5 transition-opacity ${!selectedPatientId ? "pointer-events-none opacity-40" : ""}`}>
        <SectionHeader title={t.stepConfigureTest} description={t.configureTestDesc} />

        <div className="mt-5">
          <p className="mb-3 text-sm font-semibold text-rehab-ink">{t.acquisitionMode}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {sourceOptions.map((option) => (
              <button
                key={option.mode}
                type="button"
                disabled={!option.availableNow}
                onClick={() => option.availableNow && onChangeConfig({ ...config, acquisitionMode: option.mode })}
                className={`rounded-xl border p-4 text-left transition hover:shadow-clinical disabled:cursor-not-allowed disabled:opacity-60 ${config.acquisitionMode === option.mode ? "border-rehab-teal bg-teal-50 ring-2 ring-rehab-teal/15" : "border-rehab-line bg-white"}`}
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
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Option icon={ShieldCheck} selected={config.testType === "static"} title={t.staticTest} description={t.staticTestDesc} onClick={() => onChangeConfig({ ...config, testType: "static" })} />
          <Option icon={Waves} selected={config.testType === "dynamic"} title={t.dynamicTest} description={t.dynamicTestDesc} onClick={() => onChangeConfig({ ...config, testType: "dynamic" })} />
          <Option icon={Eye} selected={config.visualCondition === "eyes_open"} title={t.eyesOpen} description={t.eyesOpenDesc} onClick={() => onChangeConfig({ ...config, visualCondition: "eyes_open" })} />
          <Option icon={EyeOff} selected={config.visualCondition === "eyes_closed"} title={t.eyesClosed} description={t.eyesClosedDesc} onClick={() => onChangeConfig({ ...config, visualCondition: "eyes_closed" })} />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-rehab-ink">
            {t.duration}
            <select value={config.durationSeconds} onChange={(e) => onChangeConfig({ ...config, durationSeconds: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-rehab-line px-3 py-2 font-normal">
              <option value={10}>{t.tenSecondDemo}</option>
              <option value={30}>{t.thirtySeconds}</option>
              <option value={60}>{t.sixtySeconds}</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-rehab-ink">
            {t.notes}
            <input value={config.notes} onChange={(e) => onChangeConfig({ ...config, notes: e.target.value })} className="mt-1 w-full rounded-lg border border-rehab-line px-3 py-2 font-normal" />
          </label>
        </div>
      </ClinicalCard>

      {/* ── 3. Pre-assessment checklist + Start CTA ── */}
      <ClinicalCard className={`p-5 transition-opacity ${!selectedPatientId ? "pointer-events-none opacity-40" : ""}`}>
        <SectionHeader
          title={t.stepPreparation}
          description={config.acquisitionMode === acquisitionModes.webcam ? t.webcamModeActiveData : t.demoModeActiveData}
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <SetupChip icon={Camera} label={t.acquisitionMode} value={config.acquisitionMode === acquisitionModes.webcam ? t.webcamBasedAssessment : config.acquisitionMode === acquisitionModes.demo ? t.demoAssessmentMode : config.acquisitionMode} />
          <SetupChip icon={ShieldCheck} label={t.test} value={config.testType === "static" ? t.staticTest : t.dynamicTest} />
          <SetupChip icon={Eye} label={t.conditions} value={config.visualCondition === "eyes_open" ? t.eyesOpen : t.eyesClosed} />
          <SetupChip icon={Timer} label={t.duration} value={`${config.durationSeconds}s`} />
        </div>

        <div className="mt-5 grid gap-3">
          {checklistItems.map(([key, label]) => (
            <label key={key} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${checklist[key] ? "border-emerald-200 bg-emerald-50" : "border-rehab-line bg-white"}`}>
              <input type="checkbox" checked={checklist[key]} onChange={(e) => onChangeChecklist({ ...checklist, [key]: e.target.checked })} className="h-4 w-4 accent-rehab-teal" />
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${checklist[key] ? "bg-rehab-teal text-white" : "bg-slate-100 text-rehab-muted"}`}>
                <ClipboardCheck size={16} />
              </span>
              <span className="font-medium text-rehab-ink">{label}</span>
            </label>
          ))}
        </div>

        {sourceError ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>{t.webcamPermissionDenied}</span>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between border-t border-rehab-line pt-5">
          <p className={`text-sm font-semibold ${canStart && selectedPatientId ? "text-emerald-700" : "text-rehab-muted"}`}>
            {!selectedPatientId ? (t.selectPatientFirst ?? "Select a patient above to continue") : canStart ? (t.readyToStart ?? "All checks passed — ready to record") : (t.completeChecklist ?? "Complete the checklist to continue")}
          </p>
          <Button onClick={onStart} disabled={!canStart || !selectedPatientId}>
            <Activity size={16} /> {t.startAssessment}
          </Button>
        </div>
      </ClinicalCard>
    </div>
  );
}

function LiveStep({ t, elapsed, duration, countdown, assessmentPhase, assessmentRunning, frame, config, webcamStream, webcamMirrored, poseState, onPoseState, onPoseMetrics, onEnd }) {
  const hasWebcam = config.acquisitionMode === acquisitionModes.webcam || config.acquisitionMode === acquisitionModes.combined;
  const boardEnabled = config.acquisitionMode === acquisitionModes.board || config.acquisitionMode === acquisitionModes.combined;
  const isCountingDown = countdown != null;
  const progress = Math.min(100, (elapsed / duration) * 100);
  const cameraActive = !hasWebcam || isCameraStreamActive(webcamStream);
  const modelActive = !hasWebcam || Boolean(poseState?.readiness?.modelActive || poseState?.engineMode || poseState?.processingStatus);
  const bodyDetected = !hasWebcam || Boolean(poseState?.readiness?.personDetected || poseState?.tracking?.bodyDetected);
  const fullBodyVisible = !hasWebcam || Boolean(poseState?.readiness?.fullBodyVisible);
  const feetVisible = !hasWebcam || Boolean(poseState?.readiness?.feetVisible);
  const stanceStable = !hasWebcam || Boolean(poseState?.readiness?.stanceStable);
  const boardReady = !boardEnabled || (frame.boardStatus === "connected" && Number(frame.boardSampleCount ?? 0) > 0);
  const ready = (!hasWebcam || (cameraActive && modelActive && fullBodyVisible && feetVisible && stanceStable)) && boardReady;
  const isComplete = assessmentPhase === "complete";
  const isAssessing = assessmentPhase === "assessing" && assessmentRunning;
  const isLoading = hasWebcam && (!cameraActive || !modelActive);
  const liveMessage = liveAssessmentMessage({ t, isLoading, isCountingDown, isAssessing, isComplete, ready, poseState, isWebcamOnly: hasWebcam });
  // Only show checks for channels actually in use — a demo run must never
  // claim the camera or the ESP32 board are active.
  const isDemoMode = config.acquisitionMode === acquisitionModes.demo;
  const sessionChecks = [
    ...(hasWebcam
      ? [
          [t.cameraReady ?? "Camera", cameraActive],
          ["MediaPipe", modelActive],
          [t.fullBodyVisible ?? "Full body visible", bodyDetected && fullBodyVisible],
          [t.feetVisible ?? "Feet visible", feetVisible],
        ]
      : []),
    ...(boardEnabled ? [[t.esp32Status ?? "ESP32 connected", boardReady]] : []),
    ...(isDemoMode
      ? [[t.demoDataSourceActive ?? "Demo data source active", true]]
      : [[t.calibrationComplete ?? "Calibration complete", ready || isAssessing || isComplete]]),
  ];

  return (
    <div className="h-screen overflow-hidden bg-[#eaf1f2] p-2">
      <main className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_clamp(18.5rem,23vw,23rem)] gap-2">
        <section className="relative min-h-0 overflow-hidden rounded-[1.15rem] bg-[#dfeceb] shadow-[0_18px_60px_rgba(20,33,61,0.16)]">
          <div className="absolute inset-0">
          {hasWebcam && webcamStream ? (
            <WebcamPoseAssessment t={t} stream={webcamStream} frame={frame} onMetrics={onPoseMetrics} onState={onPoseState} mirrored={webcamMirrored} immersive />
          ) : (
            <div className="grid h-full place-items-center bg-[linear-gradient(135deg,#f3faf7,#dfeef4)] text-[#264653]">
              <div className="text-center">
                <div className="mx-auto mb-5 h-44 w-32 rounded-full border-4 border-[#43AA8B]" />
                <p className="text-xl font-semibold">{t.simulatedSkeleton}</p>
                <p className="mt-2 text-sm text-[#577590]">{t.liveAssessmentDesc}</p>
              </div>
            </div>
          )}
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-36 bg-gradient-to-b from-[#0b2824]/54 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-[#0b2824]/35 to-transparent" />

          <div className="absolute left-4 top-4 z-20 max-w-[min(26rem,48%)] rounded-xl border border-white/20 bg-[#102924]/68 px-4 py-3 text-white shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${isAssessing ? "animate-pulse bg-[#F94144]" : ready ? "bg-[#90BE6D]" : "bg-[#F9C74F]"}`} />
              <p className="text-xs font-bold uppercase tracking-[0.14em]">
                {isAssessing ? (t.recording ?? "Recording") : (t.positioningCalibration ?? "Calibration")}
              </p>
            </div>
            <p className="mt-1.5 text-sm font-semibold leading-5 text-white/92">{liveMessage?.text}</p>
          </div>

          <div className="absolute right-4 top-4 z-20 w-52 rounded-xl border border-white/30 bg-white/94 p-3 text-rehab-ink shadow-xl shadow-slate-950/15 backdrop-blur-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rehab-muted">{t.timeRemaining ?? "Time remaining"}</p>
                <p className="mt-0.5 font-mono text-3xl font-black leading-none tabular-nums">
                  {Math.max(0, duration - elapsed)}<span className="ml-1 text-sm font-bold text-rehab-muted">s</span>
                </p>
              </div>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-rehab-teal/10 text-rehab-teal">
                <Timer size={18} />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-rehab-muted">
              <span>{elapsed}s / {duration}s</span>
              <span>{Math.round(isComplete ? 100 : progress)}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-rehab-teal transition-all duration-300" style={{ width: `${isComplete ? 100 : progress}%` }} />
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-[12%] bottom-5 z-20 flex items-end justify-center">
            <div className="flex items-center gap-3 rounded-full border border-white/18 bg-[#102924]/58 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#43AA8B]" /> {t.commonUi?.bodyCenter}</span>
              <span className="h-4 w-px bg-white/20" />
              <span>{t.stablePosture ?? "Hold a natural, still stance"}</span>
            </div>
          </div>

          {isCountingDown ? <CalibrationOverlay t={t} value={countdown} /> : null}
        </section>

        <BiomechanicsSidebar
          t={t}
          frame={frame}
          checks={sessionChecks}
          poseState={poseState}
          ready={ready}
          isAssessing={isAssessing}
          onEnd={onEnd}
        />
      </main>
    </div>
  );
}

function BiomechanicsSidebar({ t, frame, checks, poseState, ready, isAssessing, onEnd }) {
  const balance = clampScore(frame.stability ?? frame.totalBalanceScore);
  const posture = clampScore(frame.posture);
  const stability = clampScore(frame.boardStability ?? frame.stability);
  const trunk = Number(poseState?.metrics?.trunkInclination ?? frame.trunkInclination ?? 0);

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-[1.15rem] border border-slate-200/80 bg-[#f8fbfb] shadow-[0_18px_60px_rgba(20,33,61,0.10)]">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rehab-teal">BalanceRehab</p>
          <h2 className="text-sm font-bold text-rehab-ink">{t.liveBiomechanics ?? "Live biomechanics"}</h2>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isAssessing ? "bg-rose-50 text-rose-700" : ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {isAssessing ? (t.recording ?? "Recording") : ready ? (t.ready ?? "Ready") : (t.calibrating ?? "Calibrating")}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-3">
        <SidebarSection title={t.sessionStatus ?? "Session status"}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {checks.map(([label, active]) => (
              <div key={label} className="flex min-w-0 items-center gap-2">
                <CheckCircle2 size={14} className={active ? "shrink-0 text-rehab-teal" : "shrink-0 text-slate-300"} />
                <span className={`truncate text-[11px] font-semibold ${active ? "text-rehab-ink" : "text-rehab-muted"}`}>{label}</span>
              </div>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title={t.keyScores ?? "Key scores"}>
          <div className="grid grid-cols-3 gap-2">
            <CompactScore label={t.balanceScore ?? "Balance"} value={balance} color="#43AA8B" />
            <CompactScore label={t.posture ?? "Posture"} value={posture} color="#577590" />
            <CompactScore label={t.stability ?? "Stability"} value={stability} color="#90BE6D" />
          </div>
        </SidebarSection>

        <SidebarSection title={t.liveStabilogram ?? "Live stabilogram"} className="min-h-0 flex-1">
          <div className="h-full min-h-[10rem]">
            <LiveCopMiniPlot samples={stabilogramSamples(frame)} light />
          </div>
        </SidebarSection>

        <SidebarSection title={t.bodyControl ?? "Body control"}>
          <div className="space-y-2">
            <ControlIndicator t={t} label={t.apBalance ?? "AP balance"} value={frame.apSway} limit={12} />
            <ControlIndicator t={t} label={t.mlBalance ?? "ML balance"} value={frame.mlSway} limit={12} />
            <ControlIndicator t={t} label={t.trunkAlignment ?? "Trunk alignment"} value={trunk} limit={10} unit="°" />
          </div>
        </SidebarSection>
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
        <Button className="min-h-11 w-full justify-center bg-rehab-ink hover:bg-[#203357]" onClick={onEnd}>
          <ClipboardCheck size={16} /> {t.endAssessment}
        </Button>
      </div>
    </aside>
  );
}

function SidebarSection({ title, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_4px_18px_rgba(20,33,61,0.045)] ${className}`}>
      <p className="mb-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-rehab-muted">{title}</p>
      {children}
    </section>
  );
}

function CompactScore({ label, value, color }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2.5 text-center">
      <p className="font-mono text-xl font-black leading-none text-rehab-ink tabular-nums">{value}</p>
      <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-wide text-rehab-muted">{label}</p>
      <div className="mx-auto mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ControlIndicator({ t, label, value, limit, unit = "" }) {
  const numeric = Number(value ?? 0);
  const normalized = Math.round(Math.min(100, Math.abs(numeric) / limit * 100));
  const position = 50 + Math.max(-45, Math.min(45, numeric / limit * 45));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold">
        <span className="text-rehab-ink">{label}</span>
        <span className="font-mono text-rehab-muted tabular-nums">{Number.isFinite(numeric) ? `${Math.round(numeric * 10) / 10}${unit}` : "-"}</span>
      </div>
      <div className="relative h-2 rounded-full bg-[linear-gradient(90deg,#f9c74f_0%,#90be6d_35%,#43aa8b_50%,#90be6d_65%,#f9c74f_100%)] opacity-80">
        <span className="absolute top-1/2 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rehab-ink shadow-sm" style={{ left: `${position}%` }} />
      </div>
      <span className="sr-only">{normalized}% {t?.ofExpectedRange ?? "of expected range"}</span>
    </div>
  );
}

function stabilogramSamples(frame) {
  const samples = Array.isArray(frame.boardSamples) ? frame.boardSamples.slice(-80) : [];
  if (samples.length) return samples;
  const ap = Number(frame.apSway ?? 0);
  const ml = Number(frame.mlSway ?? 0);
  return Array.from({ length: 18 }, (_, index) => ({
    ap: Math.sin(index * 0.62) * ap * 0.35 + ap * 0.08,
    ml: Math.cos(index * 0.51) * ml * 0.35 - ml * 0.06,
  }));
}

function clampScore(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : 0;
}

function LiveVitalsPanel({
  t,
  frame,
  liveMessage,
  elapsed,
  duration,
  isAssessing,
  isComplete,
  ready,
  hasWebcam,
  boardEnabled,
  cameraActive,
  modelActive,
  bodyDetected,
  fullBodyVisible,
  feetVisible,
  stanceStable,
  boardReady,
  light = false,
}) {
  const total = frame.stability ?? frame.totalBalanceScore;
  const posture = frame.posture;
  const board = frame.boardStability;
  const syncItems = [
    hasWebcam ? [t.cameraReady ?? "Camera", cameraActive] : null,
    hasWebcam ? [t.modelActive ?? "Model", modelActive] : null,
    hasWebcam ? [t.fullBodyVisible ?? "Full body", bodyDetected && fullBodyVisible] : null,
    hasWebcam ? [t.feetVisible ?? "Feet visible", feetVisible] : null,
    hasWebcam ? [t.stanceStable ?? "Stance stable", stanceStable] : null,
    boardEnabled ? [t.esp32Status ?? "ESP32", boardReady] : null,
  ].filter(Boolean);
  const phaseLabel = isComplete
    ? (t.assessmentComplete ?? "Assessment complete")
    : isAssessing
      ? (t.recording ?? "Recording")
      : ready
        ? (t.readyToStart ?? "Ready to record")
        : (t.positioningCalibration ?? "Positioning and calibration");

  return (
    <div className={`absolute left-4 right-[8.5rem] top-4 z-20 rounded-xl p-3 shadow-xl backdrop-blur-md max-lg:right-4 max-lg:top-[4.6rem] ${
      light
        ? "border border-slate-200 bg-white text-rehab-ink shadow-slate-200/80"
        : "border border-white/20 bg-[#102924]/66 text-white shadow-[#102924]/20"
    }`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isAssessing ? "bg-[#F94144]" : ready ? "bg-[#43AA8B]" : "bg-[#F9C74F] text-[#463500]"}`}>
            {isAssessing ? <span className="h-3 w-3 animate-pulse rounded-full bg-white" /> : <Gauge size={18} />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{phaseLabel}</p>
            <p className={`mt-0.5 text-xs font-semibold ${light ? "text-rehab-muted" : "text-white/58"}`}>
              {liveMessage?.text ?? ""} · {elapsed}s / {duration}s · {Math.max(0, duration - elapsed)}s remaining
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:min-w-[31rem]">
          <LiveVital label={t.totalBalanceScore ?? "Total"} value={total} suffix="/100" color="#43AA8B" light={light} />
          <LiveVital label={t.posture ?? "Posture"} value={posture} suffix="/100" color="#90BE6D" light={light} />
          <LiveVital label={t.boardStability ?? "Board"} value={board} suffix="/100" color="#F9C74F" light={light} />
          <LiveVital label={t.apSway ?? "AP sway"} value={frame.apSway} color="#F8961E" light={light} />
          <LiveVital label={t.mlSway ?? "ML sway"} value={frame.mlSway} color="#277DA1" light={light} />
        </div>
      </div>

      <div className={`mt-3 flex flex-wrap gap-2 border-t pt-3 ${light ? "border-slate-100" : "border-white/10"}`}>
        {syncItems.map(([label, active]) => (
          <span key={label} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            active
              ? light ? "bg-emerald-50 text-emerald-700" : "bg-[#90BE6D]/18 text-white"
              : light ? "bg-slate-100 text-rehab-muted" : "bg-white/10 text-white/58"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-[#90BE6D]" : light ? "bg-slate-300" : "bg-white/30"}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LiveVital({ label, value, suffix = "", color, light = false }) {
  const numeric = Number(value);
  const display = Number.isFinite(numeric) ? `${Math.round(numeric * 10) / 10}${suffix}` : "-";
  return (
    <div className={`rounded-lg px-3 py-2 ${light ? "border border-slate-100 bg-slate-50" : "bg-white/10"}`}>
      <div className="mb-1 h-1 rounded-full" style={{ backgroundColor: color }} />
      <p className={`truncate text-[10px] font-bold uppercase tracking-wide ${light ? "text-rehab-muted" : "text-white/52"}`}>{label}</p>
      <p className={`mt-0.5 text-base font-black leading-none ${light ? "text-rehab-ink" : "text-white"}`}>{display}</p>
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

function LiveBoardPanel({ t, frame, light = false }) {
  const samples = Array.isArray(frame.boardSamples) ? frame.boardSamples : [];
  const chartData = samples.slice(-80).map((sample) => ({
    t: Number(sample.t ?? 0),
    ap: Number(sample.ap ?? 0),
    ml: Number(sample.ml ?? 0),
    stability: sample.stability == null ? null : Number(sample.stability),
  }));
  const connected = frame.boardStatus === "connected";
  const latest = chartData[chartData.length - 1] ?? null;

  return (
    <div className={`absolute bottom-4 left-4 z-20 w-[min(30rem,calc(100vw-2rem))] rounded-xl p-4 shadow-xl backdrop-blur-md ${
      light
        ? "border border-slate-200 bg-white text-rehab-ink shadow-slate-200/80"
        : "border border-white/22 bg-[#16352f]/68 text-white shadow-[#16352f]/20"
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${light ? "text-rehab-muted" : "text-white/58"}`}>
            {t.boardStability ?? "Board stability"}
          </p>
          <p className="mt-1 text-sm font-semibold">
            {connected
              ? `${samples.length} ${t.recordedSamples ?? "recorded samples"}${frame.boardSessionId ? ` · S-${frame.boardSessionId}` : ""}`
              : frame.boardError || t.waitingForBoardStream || "Waiting for ESP32 board stream"}
          </p>
        </div>
        <div className="flex gap-2">
          <LiveBoardMetric label="AP" value={frame.apSway} light={light} />
          <LiveBoardMetric label="ML" value={frame.mlSway} light={light} />
          <LiveBoardMetric label={t.stability ?? "Stability"} value={frame.boardStability} suffix="/100" light={light} />
        </div>
      </div>

      <div className="mt-3 h-36">
        {chartData.length ? (
          <LiveCopMiniPlot samples={chartData} light={light} />
        ) : (
          <div className={`grid h-full place-items-center rounded-lg border border-dashed text-center text-xs font-semibold ${light ? "border-slate-200 text-rehab-muted" : "border-white/18 text-white/62"}`}>
            {t.waitingForBoardStream ?? "Waiting for ESP32 board stream"}
          </div>
        )}
      </div>

      <div className={`mt-2 flex items-center gap-4 text-[11px] font-semibold ${light ? "text-rehab-muted" : "text-white/68"}`}>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#F9C74F]" /> {t.apSway}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#43AA8B]" /> {t.mlSway}</span>
        {latest?.stability != null ? <span>{t.stability ?? "Stability"} {Math.round(latest.stability)}/100</span> : null}
      </div>
    </div>
  );
}

function LiveCopMiniPlot({ samples, light = false }) {
  const width = 420;
  const height = 150;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 58;
  const originAp = Number(samples[0]?.ap ?? 0);
  const originMl = Number(samples[0]?.ml ?? 0);
  const displaySamples = samples.map((sample) => ({
    ...sample,
    displayAp: sample.ap - originAp,
    displayMl: sample.ml - originMl,
  }));
  const maxAxis = Math.max(1, ...displaySamples.flatMap((sample) => [Math.abs(sample.displayAp), Math.abs(sample.displayMl)]));
  const scale = radius / Math.max(6, maxAxis * 1.25);
  const points = displaySamples.map((sample) => ({ x: cx + sample.displayMl * scale, y: cy - sample.displayAp * scale }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const end = points[points.length - 1];
  const axis = light ? "#94A3B8" : "rgba(255,255,255,0.42)";
  const grid = light ? "#E2E8F0" : "rgba(255,255,255,0.14)";
  const text = light ? "#577590" : "rgba(255,255,255,0.72)";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full rounded-lg" role="img" aria-label="Live estimated CoP-like sway path">
      <rect x="1" y="1" width={width - 2} height={height - 2} rx="12" fill={light ? "#F8FAFC" : "rgba(255,255,255,0.06)"} stroke={light ? "#E2E8F0" : "rgba(255,255,255,0.16)"} />
      {[-2, -1, 1, 2].map((step) => (
        <g key={step}>
          <line x1={cx + step * 32} y1="16" x2={cx + step * 32} y2={height - 16} stroke={grid} strokeWidth="1" />
          <line x1="20" y1={cy + step * 22} x2={width - 20} y2={cy + step * 22} stroke={grid} strokeWidth="1" />
        </g>
      ))}
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke={grid} strokeWidth="2" />
      <circle cx={cx} cy={cy} r={radius * 0.55} fill="none" stroke={grid} strokeWidth="1.5" strokeDasharray="5 4" />
      <line x1={cx} y1="16" x2={cx} y2={height - 16} stroke={axis} strokeWidth="1.5" strokeDasharray="4 4" />
      <line x1="20" y1={cy} x2={width - 20} y2={cy} stroke={axis} strokeWidth="1.5" strokeDasharray="4 4" />
      <text x={cx} y="13" textAnchor="middle" fill={text} fontSize="10" fontWeight="700">AP</text>
      <text x={width - 20} y={cy - 6} textAnchor="end" fill={text} fontSize="10" fontWeight="700">ML</text>
      {path ? <path d={path} fill="none" stroke="#43AA8B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {points.map((point, index) => (
        <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="2" fill="#277DA1" opacity="0.25" />
      ))}
      {end ? <circle cx={end.x} cy={end.y} r="5.5" fill="#F94144" stroke="#fff" strokeWidth="2" /> : null}
    </svg>
  );
}

function LiveBoardMetric({ label, value, suffix = "", light = false }) {
  const display = value == null || Number.isNaN(Number(value)) ? "-" : `${Math.round(Number(value) * 10) / 10}${suffix}`;
  return (
    <div className={`min-w-14 rounded-lg px-2.5 py-1.5 text-right ${light ? "border border-slate-100 bg-slate-50" : "bg-white/12"}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${light ? "text-rehab-muted" : "text-white/54"}`}>{label}</p>
      <p className={`text-sm font-bold ${light ? "text-rehab-ink" : "text-white"}`}>{display}</p>
    </div>
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

function CalibrationOverlay({ t, value }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <div className="grid h-32 w-32 place-items-center rounded-full border-4 border-white/75 bg-[#102924]/58 text-center text-white shadow-2xl shadow-slate-950/30 backdrop-blur-sm">
        <div>
          <p className="font-mono text-6xl font-black leading-none tabular-nums">{value}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/76">{t.assessmentBeginsIn}</p>
        </div>
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

function ReviewStep({ t, patient, config, results, patientSessions, savedSession, report, onSave, onGenerateReport, onDownload, onReturnToProfile, onReturnToReports, onDone }) {
  const postureUnits = getPostureUnits(config.acquisitionMode);
  const [clinicalImpression, setClinicalImpression] = useState(results.interpretation ?? "");
  const comparisonSession = patientSessions.find((session) => !savedSession || String(session.id) !== String(savedSession.id));
  const analytics = buildResultAnalytics(results, comparisonSession, t);
  const swayTrace = buildAssessmentSwayTrace(results, config.acquisitionMode);
  const swaySamples = swayTrace.samples;
  const swayMetrics = buildSwaySummaryMetrics(results, swaySamples);
  const classification = swayClassification(results.totalBalanceScore ?? 0, t);
  const resultScores = [
    { label: t.balanceScore ?? "Balance score", value: results.totalBalanceScore, suffix: "/100", color: classification.color },
    { label: t.postureScoreMetric ?? "Posture score", value: results.postureStabilityScore, suffix: "/100", color: "#577590" },
    { label: t.stabilityScore ?? "Stability score", value: results.stabilityScore ?? results.boardStabilityScore ?? results.totalBalanceScore, suffix: "/100", color: "#43AA8B" },
    { label: t.apSway ?? "AP sway", value: swayMetrics.meanAp, suffix: " cm", color: "#F8961E", estimated: true },
    { label: t.mlSway ?? "ML sway", value: swayMetrics.meanMl, suffix: " cm", color: "#577590", estimated: true },
    { label: t.swayVelocity ?? "Sway velocity", value: swayMetrics.velocity, suffix: " cm/s", color: "#F9C74F", estimated: true },
    { label: t.instabilityEvents ?? "Instability events", value: swayMetrics.instabilityEvents, suffix: "", color: "#F94144", estimated: true },
  ];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-clinical">
        <div className="grid lg:grid-cols-[1fr_18rem]">
          <div className="p-6 lg:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-rehab-teal">{t.assessmentSummary ?? "Clinical summary"}</p>
                <h2 className="mt-2 text-3xl font-semibold text-rehab-ink">{patient.fullName}</h2>
                <p className="mt-1 text-sm font-semibold text-rehab-muted">{patient.patientCode} · {patient.age ?? "-"} {t.years ?? "years"} · {t.clinicalTerms?.pathologies?.[patient.pathology] ?? patient.pathology ?? "-"}</p>
              </div>
              <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ color: classification.color, backgroundColor: `${classification.color}18` }}>
                {classification.label}
              </span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryDatum label={t.test ?? "Test type"} value={testTypeLabel(t, config.testType)} />
              <SummaryDatum label={t.acquisitionMode ?? "Acquisition mode"} value={acquisitionLabelForResults(config.acquisitionMode, t)} />
              <SummaryDatum label={t.duration ?? "Duration"} value={`${config.durationSeconds}s`} />
              <SummaryDatum label={t.visionCondition ?? "Condition"} value={conditionLabel(t, config.visualCondition)} />
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rehab-muted">{t.clinicalInterpretationSection ?? "Clinical interpretation"}</p>
              <p className="mt-2 text-sm font-medium leading-6 text-rehab-ink">{results.interpretation || analytics.shortInterpretation}</p>
            </div>
          </div>

          <div className="grid place-items-center border-t border-slate-200 bg-[#eff8f5] p-6 lg:border-l lg:border-t-0">
            <div className="text-center">
              <CircularScore score={results.totalBalanceScore} />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-rehab-muted">{t.totalBalanceScore ?? "Balance score"}</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: classification.color }}>{classification.label}</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <AnalyticsSectionHeader title={t.keyScores ?? "Key scores"} subtitle={t.estimatedIndicators ?? "Estimated indicators"} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {resultScores.map((metric) => <ResultScoreCard key={metric.label} {...metric} estimatedLabel={t.commonUi?.estimated ?? t.estimatedIndicators} />)}
        </div>
      </section>

      {results.trackingQuality && !results.trackingQuality.sufficient ? (
        <ClinicalCard className="border-[#F9C74F]/35 bg-[#F9C74F]/12 p-4">
          <p className="text-sm font-semibold text-[#8A6B00]">{t.trackingQualityInsufficient ?? "Tracking quality insufficient"}</p>
          <p className="mt-1 text-xs font-medium text-[#8A6B00]/80">
            {results.trackingQuality.sampleCount ?? 0} {t.recordedSamples ?? "recorded samples"} / {results.trackingQuality.usablePercent ?? 0}% usable tracking.
          </p>
        </ClinicalCard>
      ) : null}

      <ClinicalPosturographyPanel
        t={t}
        results={results}
        analytics={analytics}
        acquisitionMode={config.acquisitionMode}
        trace={swayTrace}
      />

      <section className="space-y-4">
        <AnalyticsSectionHeader title={t.clinicalInterpretationSection ?? "Interpretation and recommendations"} />
        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <ClinicalFindingsPanel findings={analytics.findings} t={t} />
          <RecommendationCards recommendations={analytics.recommendations} t={t} />
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-blue-950">
          Les indicateurs présentés sont estimés à partir de la webcam et/ou des capteurs ultrasoniques. Ils ne sont pas équivalents à une mesure médicale du centre de pression par plateforme de force certifiée.
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
        </div>
      </ClinicalCard>

      {comparisonSession ? (
        <SessionComparisonCard t={t} results={results} previousSession={comparisonSession} postureUnits={postureUnits} />
      ) : null}

      {savedSession ? (
        <ClinicalCard className="p-5">
          <SectionHeader title={t.stepReport} description={t.generateDownloadReport} />
          <div className="mt-5 rounded-xl border border-rehab-line bg-slate-50 p-5">
            <p className="font-semibold text-rehab-ink">{t.reportPreview}</p>
            <p className="mt-2 text-sm text-rehab-muted">{patient.fullName} · {testTypeLabel(t, savedSession.testType)} · {savedSession.totalScore}/100</p>
            {savedSession.results?.interpretation ? (
              <p className="mt-2 text-sm text-rehab-muted">{savedSession.results.interpretation}</p>
            ) : null}
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onGenerateReport} disabled={Boolean(report)}>
              <CheckCircle2 size={16} /> {report ? t.savedToProfile : t.saveReportToProfile}
            </Button>
            <Button onClick={onDownload}>{t.downloadPdf}</Button>
            {report ? (
              <Button variant="secondary" onClick={onReturnToReports}>{t.viewPatientReports}</Button>
            ) : null}
            <Button variant="secondary" onClick={onDone}>{t.finish}</Button>
          </div>
        </ClinicalCard>
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

function SummaryDatum({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-rehab-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-rehab-ink">{value ?? "-"}</p>
    </div>
  );
}

function ResultScoreCard({ label, value, suffix, color, estimated = false, estimatedLabel }) {
  const numeric = Number(value);
  const display = Number.isFinite(numeric) ? Math.round(numeric * 10) / 10 : "-";
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-rehab-muted">{label}</p>
        {estimated ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-rehab-muted">{estimatedLabel}</span> : null}
      </div>
      <p className="mt-4 font-mono text-2xl font-black text-rehab-ink tabular-nums">
        {display}<span className="ml-1 text-xs font-bold text-rehab-muted">{suffix}</span>
      </p>
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
          <BodyCenterHeatmap samples={analytics.timeSeries} t={t} />
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

function BoardSwayReportPanel({ t, results }) {
  const samples = (results.sensorSamples?.length ? results.sensorSamples : results.samples ?? [])
    .filter((sample) => sample.ap != null && sample.ml != null)
    .map((sample, index) => ({
      ...sample,
      t: Number(sample.t ?? index),
      ap: Number(sample.ap),
      ml: Number(sample.ml),
      resultant: Number.isFinite(Number(sample.resultant)) ? Number(sample.resultant) : Math.hypot(Number(sample.ap), Number(sample.ml)),
    }));
  const density = buildSwayDensity(samples);
  const classification = statusText(results.status, t);

  return (
    <section className="space-y-4">
      <AnalyticsSectionHeader title={t.estimatedBoardSway ?? "Estimated board sway"} subtitle={t.estimatedUltrasonicNotice ?? "Estimated indicators from ultrasonic sensors; not equivalent to a medical force platform."} />
      <div className="grid gap-4 md:grid-cols-4">
        <MiniOutcome label={t.stabilityClassification ?? "Classification"} value={classification} score={results.totalBalanceScore} />
        <MiniOutcome label={t.pathLength ?? "Path length"} value={formatMetricValue(results.pathLength, "cm")} score={100 - finite(results.pathLength)} />
        <MiniOutcome label={t.rmsSway ?? "RMS sway"} value={formatMetricValue(results.rmsSway, "cm")} score={100 - finite(results.rmsSway) * 4} />
        <MiniOutcome label={t.sensorQuality ?? "Sensor quality"} value={formatMetricValue(results.sensorQuality, "%")} score={results.sensorQuality} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <AnalyticsChartCard title={t.copStyleTrajectory ?? "Estimated CoP-like sway trajectory"} size="medium">
          <CopStyleSwayPlot samples={samples} t={t} />
        </AnalyticsChartCard>
        <AnalyticsChartCard title={t.swayDensityMap ?? "Sway distribution density"} size="medium">
          <div className="flex h-full flex-col gap-3 rounded-lg border border-rehab-line bg-white p-3">
            <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-7 gap-1">
              {density.map((cell) => (
                <div
                  key={`${cell.x}-${cell.y}`}
                  className="rounded"
                  style={{ backgroundColor: swayHeatColor(cell.intensity) }}
                  title={`${cell.count} samples`}
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-rehab-muted">
              <span>{t.commonUi?.low}</span>
              <span className="h-2 flex-1 rounded-full mx-2 bg-[linear-gradient(90deg,#277DA1,#43AA8B,#F9C74F,#F94144)]" />
              <span>{t.commonUi?.high}</span>
            </div>
          </div>
        </AnalyticsChartCard>
        <AnalyticsChartCard title={t.apStabilogram ?? "AP stabilogram over time"} size="medium">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={samples} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="#D9E4EA" strokeDasharray="3 3" />
              <XAxis dataKey="t" stroke="#577590" tick={{ fontSize: 12 }} />
              <YAxis stroke="#577590" tick={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#577590" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="ap" stroke="#F8961E" strokeWidth={3} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </AnalyticsChartCard>
        <AnalyticsChartCard title={t.mlStabilogram ?? "ML stabilogram over time"} size="medium">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={samples} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="#D9E4EA" strokeDasharray="3 3" />
              <XAxis dataKey="t" stroke="#577590" tick={{ fontSize: 12 }} />
              <YAxis stroke="#577590" tick={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#577590" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="ml" stroke="#277DA1" strokeWidth={3} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </AnalyticsChartCard>
        <AnalyticsChartCard title={t.resultantSwayOverTime ?? "Resultant sway over time"} size="medium">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={samples} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="#D9E4EA" strokeDasharray="3 3" />
              <XAxis dataKey="t" stroke="#577590" tick={{ fontSize: 12 }} />
              <YAxis stroke="#577590" tick={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="resultant" stroke="#F94144" strokeWidth={3} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </AnalyticsChartCard>
        <AnalyticsChartCard title={t.scoreComparisonCards ?? "Score comparison"} size="medium">
          <div className="grid h-full content-center gap-3 sm:grid-cols-2">
            <Metric label={t.apSway ?? "AP sway"} value={formatMetricValue(results.meanSwayAp, "cm")} score={100 - finite(results.meanSwayAp) * 5} icon={Waves} />
            <Metric label={t.mlSway ?? "ML sway"} value={formatMetricValue(results.meanSwayMl, "cm")} score={100 - finite(results.meanSwayMl) * 5} icon={Waves} />
            <Metric label={t.maxSway ?? "Max sway"} value={formatMetricValue(results.maxResultantSway, "cm")} score={100 - finite(results.maxResultantSway) * 4} icon={Target} />
            <Metric label={t.instabilityEvents ?? "Instability events"} value={results.instabilityEvents ?? 0} score={100 - finite(results.instabilityEvents) * 12} icon={AlertTriangle} />
          </div>
        </AnalyticsChartCard>
      </div>
    </section>
  );
}

function CopStyleSwayPlot({ samples, t = {} }) {
  const width = 520;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;
  const plotRadius = 138;
  const originAp = Number(samples[0]?.ap ?? 0);
  const originMl = Number(samples[0]?.ml ?? 0);
  const displaySamples = samples.map((sample) => ({
    ...sample,
    displayAp: sample.ap - originAp,
    displayMl: sample.ml - originMl,
  }));
  const maxAxis = Math.max(1, ...displaySamples.flatMap((sample) => [Math.abs(sample.displayAp), Math.abs(sample.displayMl)]));
  const scale = plotRadius / Math.max(6, maxAxis * 1.25);
  const points = displaySamples.map((sample) => ({
    x: cx + sample.displayMl * scale,
    y: cy - sample.displayAp * scale,
    ap: sample.ap,
    ml: sample.ml,
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const start = points[0];
  const end = points[points.length - 1];
  const envelope = Math.min(plotRadius, Math.max(20, (maxAxis || 1) * scale));

  return (
    <div className="flex h-full min-h-[19rem] flex-col rounded-lg border border-rehab-line bg-[#FBFDFD] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">
          {t.estimatedCopNotice ?? "Estimated sway proxy, not a certified force-platform measurement"}
        </p>
        <div className="flex gap-2 text-[11px] font-semibold text-rehab-muted">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#2F7D67]" /> {t.commonUi?.start}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#F94144]" /> {t.commonUi?.end}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="min-h-0 flex-1" role="img" aria-label="Estimated CoP-like sway trajectory">
        <defs>
          <pattern id="cop-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#E2E8F0" strokeWidth="1" />
          </pattern>
          <linearGradient id="cop-trace" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#43AA8B" />
            <stop offset="100%" stopColor="#277DA1" />
          </linearGradient>
        </defs>

        <rect x="76" y="26" width="368" height="286" rx="14" fill="url(#cop-grid)" stroke="#CBD5E1" strokeWidth="1.5" />
        <ellipse cx={cx - 62} cy={cy} rx="44" ry="118" fill="#F8FAFC" stroke="#D9E4EA" strokeWidth="2" />
        <ellipse cx={cx + 62} cy={cy} rx="44" ry="118" fill="#F8FAFC" stroke="#D9E4EA" strokeWidth="2" />
        <circle cx={cx} cy={cy} r={plotRadius} fill="none" stroke="#D9E4EA" strokeWidth="2" />
        <circle cx={cx} cy={cy} r={plotRadius * 0.62} fill="none" stroke="#E2E8F0" strokeWidth="2" strokeDasharray="6 5" />
        <circle cx={cx} cy={cy} r={Math.max(10, envelope)} fill="#43AA8B" opacity="0.08" stroke="#43AA8B" strokeWidth="1.5" />

        <line x1={cx} y1="34" x2={cx} y2="306" stroke="#577590" strokeWidth="1.5" strokeDasharray="5 5" />
        <line x1="88" y1={cy} x2="432" y2={cy} stroke="#577590" strokeWidth="1.5" strokeDasharray="5 5" />
        <text x={cx} y="20" textAnchor="middle" fill="#264653" fontSize="13" fontWeight="700">{t.commonUi?.anterior}</text>
        <text x={cx} y="338" textAnchor="middle" fill="#264653" fontSize="13" fontWeight="700">{t.commonUi?.posterior}</text>
        <text x="38" y={cy + 4} textAnchor="middle" fill="#264653" fontSize="13" fontWeight="700">{t.commonUi?.left}</text>
        <text x="482" y={cy + 4} textAnchor="middle" fill="#264653" fontSize="13" fontWeight="700">{t.commonUi?.right}</text>

        {path ? <path d={path} fill="none" stroke="url(#cop-trace)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" /> : null}
        {points.map((point, index) => (
          <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r={index === points.length - 1 ? 0 : 2.2} fill="#277DA1" opacity="0.26" />
        ))}
        {start ? <circle cx={start.x} cy={start.y} r="6" fill="#2F7D67" stroke="#FFFFFF" strokeWidth="2" /> : null}
        {end ? <circle cx={end.x} cy={end.y} r="7" fill="#F94144" stroke="#FFFFFF" strokeWidth="2" /> : null}
      </svg>
    </div>
  );
}

function buildAssessmentSwayTrace(results = {}, acquisitionMode = results.acquisitionMode) {
  const mode = acquisitionMode ?? results.acquisitionMode;
  const isDemo = mode === acquisitionModes.demo || results.acquisitionMode === acquisitionModes.demo;
  const sensorRaw = Array.isArray(results.sensorSamples) ? results.sensorSamples : [];
  const postureRaw = Array.isArray(results.postureSamples) ? results.postureSamples : [];
  const mergedRaw = Array.isArray(results.samples) ? results.samples : [];
  const mergedBoard = mergedRaw.filter(hasBoardSway);
  const mergedPosture = mergedRaw.filter(hasWebcamPosture);
  const boardSamples = normalizeRecordedSwaySamples(sensorRaw.length ? sensorRaw : mergedBoard, "esp32");
  const webcamSamples = normalizeRecordedSwaySamples(postureRaw.length ? postureRaw : mergedPosture, "webcam");
  const hasBoard = boardSamples.length > 0;
  const hasWebcam = webcamSamples.length > 0;
  const selected =
    hasBoard && (mode === acquisitionModes.board || mode === acquisitionModes.combined || results.availableMetrics?.board)
      ? { source: hasWebcam && mode === acquisitionModes.combined ? "combined" : "esp32", samples: boardSamples }
      : hasWebcam
        ? { source: "webcam", samples: webcamSamples }
        : hasBoard
          ? { source: "esp32", samples: boardSamples }
          : { source: isDemo ? "demo" : "none", samples: [] };

  const samples = selected.samples.length
    ? smoothSwaySamples(centerSwaySamples(selected.samples))
    : isDemo
      ? generateDemoSwayTrace(results)
      : [];

  // A demo acquisition must always be labeled as simulated data, even though the
  // simulator writes board-shaped samples — never attribute it to the ESP32.
  const source = isDemo ? "demo" : selected.source;

  return {
    samples,
    source,
    acquisitionMode: mode,
    realSamplesUsed: source !== "demo" && source !== "none" && samples.length > 0,
    fallbackUsed: source === "demo" && samples.length > 0,
    mediaPipeSamples: postureRaw.length || mergedPosture.length,
    esp32Samples: sensorRaw.length || mergedBoard.length,
    webcamSamples,
    boardSamples,
    fusionMethod: selected.source === "combined"
      ? "ESP32 board AP/ML sway drives the CoP-like trajectory; MediaPipe webcam samples remain separate posture indicators."
      : null,
  };
}

function buildEstimatedSwaySamples(results = {}) {
  return buildAssessmentSwayTrace(results, results.acquisitionMode).samples;
}

function normalizeRecordedSwaySamples(raw, source) {
  return raw.map((sample, index) => {
    const ap = source === "webcam" ? webcamApProxy(sample) : firstFinite(sample.ap, sample.anteriorPosteriorSway, sample.anterior_posterior_sway);
    const ml = source === "webcam" ? webcamMlProxy(sample) : firstFinite(sample.ml, sample.medialLateralSway, sample.medial_lateral_sway);
    if (!Number.isFinite(ap) || !Number.isFinite(ml)) return null;
    return {
      t: round1(firstFinite(sample.t, sample.timestampMs != null ? Number(sample.timestampMs) / 1000 : null, index * 0.25)),
      ap: round1(ap),
      ml: round1(ml),
      resultant: round1(firstFinite(sample.resultant, Math.hypot(ap, ml))),
      source,
    };
  }).filter(Boolean);
}

function hasBoardSway(sample = {}) {
  return Number.isFinite(Number(sample.ap ?? sample.anteriorPosteriorSway ?? sample.anterior_posterior_sway))
    && Number.isFinite(Number(sample.ml ?? sample.medialLateralSway ?? sample.medial_lateral_sway));
}

function hasWebcamPosture(sample = {}) {
  return Number.isFinite(Number(sample.bodyCenterX ?? sample.hipCenterX ?? sample.shoulderCenterX))
    && Number.isFinite(Number(sample.bodyCenterY ?? sample.hipCenterY ?? sample.shoulderCenterY));
}

function webcamApProxy(sample = {}) {
  return firstFinite(
    sample.apSwayProxy,
    sample.ap_sway_proxy,
    sample.ap,
    sample.bodyCenterY != null ? (0.5 - Number(sample.bodyCenterY)) * 22 : null,
    sample.hipCenterY != null ? (0.5 - Number(sample.hipCenterY)) * 22 : null,
    sample.shoulderCenterY != null ? (0.5 - Number(sample.shoulderCenterY)) * 18 : null,
    sample.signedBodyCenterDeviation,
    sample.trunkInclination != null ? Number(sample.trunkInclination) * 0.45 : null,
  );
}

function webcamMlProxy(sample = {}) {
  return firstFinite(
    sample.mlSwayProxy,
    sample.ml_sway_proxy,
    sample.ml,
    sample.bodyCenterX != null ? (Number(sample.bodyCenterX) - 0.5) * 22 : null,
    sample.hipCenterX != null ? (Number(sample.hipCenterX) - 0.5) * 22 : null,
    sample.shoulderCenterX != null ? (Number(sample.shoulderCenterX) - 0.5) * 18 : null,
    sample.shoulderAsymmetry != null ? Number(sample.shoulderAsymmetry) * 0.35 : null,
  );
}

function generateDemoSwayTrace(results = {}) {
  const score = Number(results.totalBalanceScore ?? 76);
  const amplitude = score >= 80 ? 2.2 : score >= 65 ? 5.2 : 8.8;
  const count = Math.max(90, Number(results.durationSeconds ?? 30) * 3);
  const generated = Array.from({ length: count }, (_, index) => {
    const drift = score < 65 ? Math.sin(index * 0.045) * 2.4 : Math.sin(index * 0.035) * 0.8;
    const ap = Math.sin(index * 0.22) * amplitude + Math.sin(index * 0.071) * amplitude * 0.48 + drift;
    const ml = Math.cos(index * 0.19) * amplitude * 0.82 + Math.sin(index * 0.053) * amplitude * 0.38 - drift * 0.42;
    return { t: round1(index / 3), ap: round1(ap), ml: round1(ml), resultant: round1(Math.hypot(ap, ml)) };
  });
  return smoothSwaySamples(centerSwaySamples(generated));
}

function sourceLabelForTrace(trace, t) {
  if (trace.source === "combined") return t.sourceCombined ?? "Source: Combined";
  if (trace.source === "esp32") return t.sourceEsp32SerialBoard ?? "Source: ESP32 serial board";
  if (trace.source === "webcam") return t.sourceMediaPipeWebcam ?? "Source: MediaPipe webcam";
  if (trace.source === "demo") return t.sourceDemoData ?? "Source: Demo data";
  return t.sourceNoRecordedSamples ?? "Source: No recorded samples";
}

function centerSwaySamples(samples) {
  if (!samples.length) return samples;
  const baseAp = samples[0].ap;
  const baseMl = samples[0].ml;
  return samples.map((sample) => ({
    ...sample,
    ap: round1(sample.ap - baseAp),
    ml: round1(sample.ml - baseMl),
    resultant: round1(Math.hypot(sample.ap - baseAp, sample.ml - baseMl)),
  }));
}

function smoothSwaySamples(samples) {
  return samples.map((sample, index) => {
    const window = samples.slice(Math.max(0, index - 2), Math.min(samples.length, index + 3));
    const ap = average(window.map((item) => item.ap));
    const ml = average(window.map((item) => item.ml));
    return { ...sample, ap: round1(ap), ml: round1(ml), resultant: round1(Math.hypot(ap, ml)) };
  });
}

function buildSwaySummaryMetrics(results = {}, samples = []) {
  const apValues = samples.map((sample) => Math.abs(Number(sample.ap))).filter(Number.isFinite);
  const mlValues = samples.map((sample) => Math.abs(Number(sample.ml))).filter(Number.isFinite);
  const resultantValues = samples.map((sample) => sample.resultant).filter(Number.isFinite);
  const hasSamples = samples.length > 0;
  const pathLengthFromSamples = samples.slice(1).reduce((sum, sample, index) => {
    const prev = samples[index];
    return sum + Math.hypot(sample.ap - prev.ap, sample.ml - prev.ml);
  }, 0);
  const pathLength = hasSamples ? pathLengthFromSamples : results.pathLength;
  const duration = Math.max(1, samples.at(-1)?.t ?? results.durationSeconds ?? 30);
  const threshold = results.totalBalanceScore >= 80 ? 3 : results.totalBalanceScore >= 65 ? 6 : 9;
  return {
    meanAp: round1(hasSamples ? average(apValues) : results.meanSwayAp),
    meanMl: round1(hasSamples ? average(mlValues) : results.meanSwayMl),
    meanSway: round1(hasSamples ? average(resultantValues) : results.meanResultantSway),
    maxSway: round1(hasSamples ? Math.max(0, ...resultantValues) : results.maxResultantSway),
    pathLength: round1(pathLength),
    velocity: round1(hasSamples ? pathLength / duration : results.swayVelocity),
    instabilityEvents: hasSamples ? samples.filter((sample) => sample.resultant > threshold * 1.5).length : (results.instabilityEvents ?? 0),
    quality: results.sensorQuality ?? results.trackingQuality?.usablePercent ?? 88,
    threshold,
  };
}

function swayClassification(score, t = {}) {
  const numeric = Number(score) || 0;
  if (numeric >= 80) return { label: t.stableResult ?? "Stable", color: "#43AA8B" };
  if (numeric >= 65) return { label: t.moderateInstability ?? "Moderate", color: "#F9C74F" };
  return { label: t.highInstability ?? "High instability", color: "#F94144" };
}

function swaySvgPoints(samples, width, height, radius) {
  const cx = width / 2;
  const cy = height / 2;
  const maxAxis = Math.max(1, ...samples.flatMap((sample) => [Math.abs(sample.ap), Math.abs(sample.ml)]));
  const scale = radius / Math.max(4, maxAxis * 1.18);
  return samples.map((sample) => ({
    x: cx + sample.ml * scale,
    y: cy - sample.ap * scale,
  }));
}

function swaySpreadRadius(points) {
  if (!points.length) return 0;
  const cx = average(points.map((point) => point.x));
  const cy = average(points.map((point) => point.y));
  return Math.max(...points.map((point) => Math.hypot(point.x - cx, point.y - cy)));
}

function firstFinite(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function average(values) {
  const finiteValues = values.map(Number).filter(Number.isFinite);
  if (!finiteValues.length) return 0;
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function buildSwayDensity(samples, size = 7) {
  const cells = Array.from({ length: size * size }, (_, index) => ({ x: index % size, y: Math.floor(index / size), count: 0, intensity: 0 }));
  const maxAxis = Math.max(1, ...samples.flatMap((sample) => [Math.abs(sample.ap), Math.abs(sample.ml)]));
  samples.forEach((sample) => {
    const x = Math.max(0, Math.min(size - 1, Math.floor(((sample.ml / maxAxis + 1) / 2) * size)));
    const y = Math.max(0, Math.min(size - 1, Math.floor(((sample.ap / maxAxis + 1) / 2) * size)));
    cells[y * size + x].count += 1;
  });
  const maxCount = Math.max(1, ...cells.map((cell) => cell.count));
  return cells.map((cell) => ({ ...cell, intensity: cell.count / maxCount }));
}

function swayHeatColor(intensity) {
  const value = Math.max(0, Math.min(1, Number(intensity) || 0));
  if (value < 0.33) return interpolateHex("#277DA1", "#43AA8B", value / 0.33);
  if (value < 0.66) return interpolateHex("#43AA8B", "#F9C74F", (value - 0.33) / 0.33);
  return interpolateHex("#F9C74F", "#F94144", (value - 0.66) / 0.34);
}

function interpolateHex(from, to, amount) {
  const parse = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  const a = parse(from);
  const b = parse(to);
  const rgb = a.map((channel, index) => Math.round(channel + (b[index] - channel) * amount));
  return `rgb(${rgb.join(",")})`;
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

function BodyCenterHeatmap({ samples, t }) {
  const cells = samples.slice(-40);
  return (
    <div className="grid h-full grid-cols-8 gap-1">
      {cells.length ? cells.map((sample, index) => {
        const intensity = Math.min(1, Math.abs(sample.centerAbs ?? 0) / 18);
        const color = intensity > 0.72 ? "#F94144" : intensity > 0.42 ? "#F8961E" : intensity > 0.22 ? "#F9C74F" : "#43AA8B";
        return <div key={`${sample.t}-${index}`} className="rounded-md" style={{ backgroundColor: color, opacity: 0.35 + intensity * 0.65 }} title={`${sample.centerAbs}%`} />;
      }) : <div className="col-span-8 grid place-items-center rounded-xl border border-dashed border-white/20 text-sm font-semibold text-slate-300">{t.commonUi?.noRecordedSamples}</div>}
    </div>
  );
}

function ClinicalPosturographyPanel({ t, results, analytics, acquisitionMode, trace }) {
  const traceInfo = trace ?? buildAssessmentSwayTrace(results, acquisitionMode);
  const realSamples = traceInfo.samples;
  const hasSamples = realSamples.length > 0;
  const isDemo = (acquisitionMode ?? results?.acquisitionMode) === acquisitionModes.demo;
  const samples = hasSamples ? realSamples : (isDemo ? generateDemoSwayTrace(results) : []);
  const isDemoFallback = isDemo && !hasSamples && samples.length > 0;
  const noRealSamples = !isDemo && !hasSamples;
  const density = buildSwayDensity(samples, 9);
  const classification = swayClassification(results.totalBalanceScore ?? 0, t);
  const metrics = buildSwaySummaryMetrics(results, samples);
  const sourceLabel = sourceLabelForTrace(traceInfo, t);

  if (noRealSamples) {
    return (
      <section className="space-y-5">
        <AnalyticsSectionHeader
          title={t.posturographicAnalysis ?? "Estimated posturographic analysis"}
          subtitle={sourceLabel}
        />
        <ClinicalCard className="border-rose-200 bg-rose-50 p-5">
          <p className="text-sm font-semibold text-rose-800">
            {t.noRecordedSamplesCaptured ?? "No recorded samples were captured. Please repeat the assessment."}
          </p>
          <p className="mt-2 text-xs text-rose-700">
            {t.acquisitionMode ?? "Acquisition mode"}: {acquisitionLabelForResults(acquisitionMode ?? results.acquisitionMode, t)}
            {" · "}MediaPipe samples: {traceInfo.mediaPipeSamples}
            {" · "}ESP32 samples: {traceInfo.esp32Samples}
          </p>
        </ClinicalCard>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <AnalyticsSectionHeader
        title={t.posturographicAnalysis ?? "Estimated posturographic analysis"}
        subtitle={sourceLabel}
      />
      <ClinicalCard className={`p-4 ${traceInfo.fallbackUsed || isDemoFallback ? "border-amber-200 bg-amber-50" : hasSamples ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-rehab-ink">{traceInfo.realSamplesUsed ? (t.recordedSessionData ?? "Données issues de la session enregistrée") : isDemo ? (t.simulatedSessionData ?? "Données simulées (mode démo) — aucune acquisition matérielle.") : (t.noRecordedSamplesAvailable ?? "No recorded samples available for this session.")}</p>
            <p className="mt-1 text-xs font-semibold text-rehab-muted">
              {t.acquisitionMode ?? "Acquisition mode"}: {acquisitionLabelForResults(acquisitionMode ?? results.acquisitionMode, t)} · {samples.length} {t.samplesRecorded ?? "échantillons"}
            </p>
            {traceInfo.fusionMethod ? (
              <p className="mt-1 text-xs font-semibold text-rehab-blue">
                {t.combinedFusionMethod ?? traceInfo.fusionMethod}
              </p>
            ) : null}
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-rehab-muted">{sourceLabel}</span>
        </div>
      </ClinicalCard>

      <ClinicalCard className="border-0 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <ClinicalScoreTile label={t.totalBalanceScore ?? "Global balance score"} value={`${Math.round(results.totalBalanceScore ?? 0)}/100`} color={classification.color} />
          <ClinicalScoreTile label={t.stabilityClassification ?? "Classification"} value={classification.label} color={classification.color} />
          <ClinicalScoreTile label={t.meanSway ?? "Mean sway"} value={formatMetricValue(metrics.meanSway, "cm")} color="#43AA8B" />
          <ClinicalScoreTile label={t.maxSway ?? "Max sway"} value={formatMetricValue(metrics.maxSway, "cm")} color="#F8961E" />
          <ClinicalScoreTile label={t.pathLength ?? "Path length"} value={formatMetricValue(metrics.pathLength, "cm")} color="#577590" />
          <ClinicalScoreTile label={t.swayVelocity ?? "Sway velocity"} value={formatMetricValue(metrics.velocity, "cm/s")} color="#577590" />
          <ClinicalScoreTile label={t.instabilityEvents ?? "Instability events"} value={metrics.instabilityEvents} color="#F94144" />
          <ClinicalScoreTile label={t.sensorQuality ?? "Tracking/sensor quality"} value={formatMetricValue(metrics.quality, "%")} color="#90BE6D" />
        </div>
        <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold leading-5 text-blue-900">
          {t.pdfEstimatedIndicatorLimit ?? "Ces visualisations sont inspirées de la posturographie. Les indicateurs sont estimés à partir de la webcam et/ou des capteurs ultrasoniques et ne correspondent pas à une mesure médicale certifiée du centre de pression."}
        </p>
      </ClinicalCard>

      {isDemoFallback ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Graphiques de démonstration — aucun échantillon enregistré disponible.
        </div>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <AnalyticsChartCard title={t.balanceFootprintMap ?? "Carte d'appui podal — trajectoire estimée"} size="large">
          <SourceCaption label={sourceLabel} />
          <FootSupportSwayMap samples={samples} classification={classification} t={t} />
        </AnalyticsChartCard>

        <AnalyticsChartCard title={t.apMlTrajectory ?? "Trajectoire estimée type CoP"} size="large">
          <SourceCaption label={sourceLabel} />
          <SwayTrajectoryPlot samples={samples} classification={classification} t={t} />
        </AnalyticsChartCard>

        <AnalyticsChartCard title={t.apStabilogram ?? "Oscillation AP estimée"} size="medium">
          <SourceCaption label={sourceLabel} />
          <SwayLineChart samples={samples} dataKey="ap" color="#F8961E" reference={metrics.threshold} label={`${t.apSway} (cm)`} timeLabel={t.commonUi?.time} />
        </AnalyticsChartCard>

        <AnalyticsChartCard title={t.mlStabilogram ?? "Oscillation ML estimée"} size="medium">
          <SourceCaption label={sourceLabel} />
          <SwayLineChart samples={samples} dataKey="ml" color="#577590" reference={metrics.threshold} label={`${t.mlSway} (cm)`} timeLabel={t.commonUi?.time} />
        </AnalyticsChartCard>

        <AnalyticsChartCard title={t.resultantSwayOverTime ?? "Oscillation résultante — pics d'instabilité"} size="medium">
          <SourceCaption label={sourceLabel} />
          <SwayLineChart samples={samples} dataKey="resultant" color="#F94144" reference={metrics.threshold * 1.25} showPeaks label={`${t.commonUi?.resultantSway} (cm)`} timeLabel={t.commonUi?.time} />
        </AnalyticsChartCard>

        <AnalyticsChartCard title={t.swayDensityHeatmap ?? "Carte de densité des oscillations"} size="medium">
          <SourceCaption label={sourceLabel} />
          <SwayDensityHeatmap density={density} t={t} />
        </AnalyticsChartCard>
      </div>
    </section>
  );
}

function ClinicalScoreTile({ label, value, color }) {
  return (
    <div className="rounded-xl border border-rehab-line bg-white p-3">
      <span className="block h-1 w-9 rounded-full" style={{ backgroundColor: color }} />
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-rehab-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-tight text-rehab-ink">{value}</p>
    </div>
  );
}

function SourceCaption({ label }) {
  return (
    <p className="mb-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rehab-muted">
      {label}
    </p>
  );
}

function FootSupportSwayMap({ samples, classification, t }) {
  const points = swaySvgPoints(samples, 520, 330, 142);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const start = points[0];
  const end = points.at(-1);
  const envelope = Math.max(18, Math.min(130, swaySpreadRadius(points)));

  return (
    <svg viewBox="0 0 520 330" className="h-full w-full rounded-xl bg-[#FBFDFD]" role="img" aria-label="Estimated sway trace on foot support map">
      <defs>
        <pattern id="foot-map-grid" width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M 26 0 L 0 0 0 26" fill="none" stroke="#E2E8F0" strokeWidth="1" />
        </pattern>
        <linearGradient id="foot-trace" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#43AA8B" />
          <stop offset="55%" stopColor="#F9C74F" />
          <stop offset="100%" stopColor={classification.color} />
        </linearGradient>
      </defs>
      <rect x="24" y="18" width="472" height="292" rx="18" fill="url(#foot-map-grid)" stroke="#CBD5E1" />
      <ellipse cx="206" cy="166" rx="46" ry="112" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" />
      <ellipse cx="314" cy="166" rx="46" ry="112" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" />
      <line x1="260" x2="260" y1="34" y2="296" stroke="#577590" strokeDasharray="6 6" />
      <line x1="54" x2="466" y1="166" y2="166" stroke="#577590" strokeDasharray="6 6" />
      <circle cx="260" cy="166" r="94" fill="none" stroke="#43AA8B" strokeOpacity="0.55" strokeDasharray="8 6" />
      <circle cx="260" cy="166" r={envelope} fill={classification.color} opacity="0.08" stroke={classification.color} strokeWidth="2" />
      {path ? <path d={path} fill="none" stroke="url(#foot-trace)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {points.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="1.8" fill="#577590" opacity="0.22" />)}
      {start ? <circle cx={start.x} cy={start.y} r="6" fill="#43AA8B" stroke="#FFFFFF" strokeWidth="2" /> : null}
      {end ? <circle cx={end.x} cy={end.y} r="7" fill="#F94144" stroke="#FFFFFF" strokeWidth="2" /> : null}
      <text x="260" y="30" textAnchor="middle" fill="#334155" fontSize="13" fontWeight="700">{t.commonUi?.anterior}</text>
      <text x="260" y="316" textAnchor="middle" fill="#334155" fontSize="13" fontWeight="700">{t.commonUi?.posterior}</text>
      <text x="42" y="170" textAnchor="middle" fill="#334155" fontSize="13" fontWeight="700">{t.commonUi?.left}</text>
      <text x="478" y="170" textAnchor="middle" fill="#334155" fontSize="13" fontWeight="700">{t.commonUi?.right}</text>
      <text x="206" y="248" textAnchor="middle" fill="#94A3B8" fontSize="11" fontWeight="700">G</text>
      <text x="314" y="248" textAnchor="middle" fill="#94A3B8" fontSize="11" fontWeight="700">D</text>
    </svg>
  );
}

function SwayTrajectoryPlot({ samples, classification, t }) {
  const points = swaySvgPoints(samples, 520, 330, 130);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const start = points[0];
  const end = points.at(-1);

  return (
    <svg viewBox="0 0 520 330" className="h-full w-full rounded-xl bg-white" role="img" aria-label="AP ML estimated sway trajectory">
      <rect x="44" y="22" width="430" height="268" rx="14" fill="#FBFDFD" stroke="#CBD5E1" />
      {[1, 2, 3].map((i) => (
        <g key={i}>
          <line x1={44 + (430 / 4) * i} x2={44 + (430 / 4) * i} y1="22" y2="290" stroke="#E2E8F0" />
          <line x1="44" x2="474" y1={22 + (268 / 4) * i} y2={22 + (268 / 4) * i} stroke="#E2E8F0" />
        </g>
      ))}
      <line x1="259" x2="259" y1="22" y2="290" stroke="#577590" strokeDasharray="6 6" />
      <line x1="44" x2="474" y1="156" y2="156" stroke="#577590" strokeDasharray="6 6" />
      <circle cx="259" cy="156" r="54" fill="#43AA8B" opacity="0.08" stroke="#43AA8B" />
      <circle cx="259" cy="156" r="96" fill="none" stroke="#F9C74F" strokeDasharray="7 5" />
      <text x="316" y="151" textAnchor="start" fill="#3D7A5E" fontSize="10" fontWeight="600">Zone sécurisée</text>
      <text x="358" y="137" textAnchor="start" fill="#9A7600" fontSize="10" fontWeight="600">Zone de vigilance</text>
      {path ? <path d={path} fill="none" stroke={classification.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" /> : null}
      {start ? <circle cx={start.x} cy={start.y} r="6" fill="#43AA8B" stroke="#FFFFFF" strokeWidth="2" /> : null}
      {end ? <circle cx={end.x} cy={end.y} r="7" fill="#F94144" stroke="#FFFFFF" strokeWidth="2" /> : null}
      <text x="259" y="316" textAnchor="middle" fill="#577590" fontSize="13" fontWeight="700">{t.mlSway} (cm)</text>
      <text x="18" y="156" textAnchor="middle" fill="#577590" fontSize="13" fontWeight="700" transform="rotate(-90 18 156)">{t.apSway} (cm)</text>
    </svg>
  );
}

function SwayLineChart({ samples, dataKey, color, reference, label, timeLabel, showPeaks = false }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={samples} margin={{ top: 10, right: 24, bottom: 24, left: 0 }}>
        <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
        <XAxis dataKey="t" stroke="#577590" tick={{ fontSize: 12 }}>
          <Label value={`${timeLabel} (s)`} offset={-10} position="insideBottom" fill="#577590" />
        </XAxis>
        <YAxis stroke="#577590" tick={{ fontSize: 12 }}>
          <Label value={label} angle={-90} position="insideLeft" fill="#577590" />
        </YAxis>
        <ReferenceArea y1={-reference} y2={reference} fill="#43AA8B" fillOpacity={0.10} />
        {showPeaks ? <ReferenceArea y1={reference} fill="#F94144" fillOpacity={0.09} /> : null}
        <ReferenceLine y={0} stroke="#577590" strokeDasharray="4 4" />
        <ReferenceLine y={reference} stroke="#F8961E" strokeDasharray="4 4" />
        <ReferenceLine y={-reference} stroke="#F8961E" strokeDasharray="4 4" />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={3} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SwayDensityHeatmap({ density, t }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-rehab-line bg-white p-3">
      <div className="grid min-h-0 flex-1 grid-cols-9 grid-rows-9 gap-1">
        {density.map((cell) => (
          <div
            key={`${cell.x}-${cell.y}`}
            className="rounded-md"
            style={{ backgroundColor: swayHeatColor(cell.intensity), opacity: 0.28 + cell.intensity * 0.72 }}
            title={`${cell.count} samples`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-rehab-muted">
        <span>{t.commonUi?.low}</span>
        <span className="h-2 flex-1 rounded-full bg-[linear-gradient(90deg,#577590,#43AA8B,#F9C74F,#F94144)]" />
        <span>{t.commonUi?.high}</span>
      </div>
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
    findingFromScore(stabilityScore, t.findingStabilityGood ?? "Posture stability remained within the expected supervised range.", t.findingStabilityWarn ?? "Posture stability requires attention during progression.", t.findingStabilityBad ?? "Posture stability indicates elevated instability risk."),
    findingFromScore(alignmentScore, t.findingAlignmentGood ?? "Body center alignment is well controlled.", t.findingAlignmentWarn ?? "Body center movement increased during the assessment.", t.findingAlignmentBad ?? "Body center deviation is high and should be reviewed."),
    findingFromScore(symmetryScore, t.findingSymmetryGood ?? "Shoulder and hip symmetry are clinically acceptable.", t.findingSymmetryWarn ?? "Asymmetry is present and should be monitored.", t.findingSymmetryBad ?? "Marked asymmetry detected during the assessment."),
    findingFromScore(trunkControlScore, t.findingTrunkGood ?? "Trunk control is stable.", t.findingTrunkWarn ?? "Trunk deviation is increased.", t.findingTrunkBad ?? "Trunk control requires focused intervention."),
  ];

  const recommendationCards = (results.recommendations ?? []).map((text) => ({
    label: t.recommendationLabel ?? "Recommendation",
    text,
    tone: recommendationTone(text),
  }));

  return {
    timeSeries,
    trajectory: timeSeries.map((item) => ({ centerX: item.centerX, trunkY: item.trunkY })),
    keyMetrics,
    findings,
    recommendations: recommendationCards.length ? recommendationCards : [{ label: t.recommendationLabel ?? "Recommendation", text: t.recoContinueTraining ?? "Continue supervised balance training and repeat assessment for trend monitoring.", tone: "good" }],
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
      { name: t.shoulders ?? "Shoulder", score: scoreFromDeviation(results.shoulderAsymmetry, 10) },
      { name: t.hips ?? "Hip", score: scoreFromDeviation(results.hipAsymmetry, 10) },
    ],
    progressComparison: previousScore > 0
      ? [
          { name: "Previous", score: previousScore },
          { name: "Current", score: results.totalBalanceScore },
        ]
      : [{ name: "Current", score: results.totalBalanceScore }],
    sessionLabel: scoreDelta > 2 ? "Improving" : scoreDelta < -2 ? "Declining" : results.totalBalanceScore < 65 ? "Follow-up" : "Stable",
    shortInterpretation: scoreDelta > 2
      ? (t.shortInterpImproved ?? "Improved by {points} points since last session.").replace("{points}", scoreDelta)
      : scoreDelta < -2
        ? (t.shortInterpDeclined ?? "Declined by {points} points since last session.").replace("{points}", Math.abs(scoreDelta))
        : (t.shortInterpStable ?? "Current session shows stable functional balance indicators."),
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
    metricItem(t.trunkInclinationMetric ?? "Trunk inclination", results.trunkInclination ?? results.trunkDeviation, "°", 8, false, t),
    metricItem(t.trunkRotation ?? "Trunk rotation", results.trunkRotation, "°", 10, false, t),
    metricItem(t.pelvicTilt ?? "Pelvic tilt", results.pelvicTilt, "°", 5, false, t),
    metricItem(t.weightShift ?? "Weight shift", results.weightShiftEstimation, "%", 9, false, t),
  ];
  const headItems = [
    metricItem(t.headTilt ?? "Head tilt", results.headTilt, "°", 8, false, t),
    metricItem(t.headRotation ?? "Head rotation", results.headRotation, "%", 8, false, t),
    metricItem(t.chinDeviation ?? "Chin deviation", results.chinDeviation, "%", 5, false, t),
    metricItem(t.eyeAlignment ?? "Eye alignment", results.eyeAlignment, "°", 5, false, t),
  ];
  const symmetryItems = [
    metricItem(t.shoulderAsymmetry ?? "Shoulder asymmetry", results.shoulderAsymmetry, "°", 5, false, t),
    metricItem(t.hipAsymmetry ?? "Hip asymmetry", results.hipAsymmetry, "°", 5, false, t),
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

function round1(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 10) / 10 : 0;
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
    trunk: "°",
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
