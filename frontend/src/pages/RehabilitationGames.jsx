import { getDateLocale } from "../i18n/dateLocale.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRightLeft,
  Award,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock,
  Search,
  Footprints,
  Gauge,
  Grid3X3,
  Hand,
  Lightbulb,
  LineChart,
  Move,
  Route,
  ShieldCheck,
  Play,
  Save,
  Star,
  Target,
  Trophy,
  User,
  Webcam,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart as ReLineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "../components/clinical/Button";
import { ClinicalCard } from "../components/clinical/ClinicalCard";
import { EmptyState } from "../components/clinical/EmptyState";
import { SectionHeader } from "../components/clinical/SectionHeader";
import { StatusBadge } from "../components/clinical/StatusBadge";
import { useMediaPipePose } from "../webcam/useMediaPipePose";
import { webcamVideoConstraints } from "../webcam/webcamConfig";
import { ObstacleAvoidanceGame } from "../games/ObstacleAvoidanceGame";

// ─── Game catalogue ───────────────────────────────────────────────────────────

const GAME_META = {
  stability_challenge: { icon: Gauge, color: "#43AA8B", visual: "freeze" },
  weight_shift_trainer: { icon: ArrowRightLeft, color: "#F8961E", visual: "shift" },
  path_following: { icon: LineChart, color: "#577590", visual: "path" },
  balance_maze: { icon: Grid3X3, color: "#F94144", visual: "maze" },
  reach_touch: { icon: Activity, color: "#90BE6D", visual: "reach" },
  balloon_pop: { icon: Target, color: "#F94144", visual: "balloon" },
  squat_trainer: { icon: BrainCircuit, color: "#577590", visual: "squat" },
  single_leg_balance: { icon: User, color: "#43AA8B", visual: "single" },
  obstacle_avoidance: { icon: Grid3X3, color: "#F8961E", visual: "avoid" },
};

const PLAYABLE_GAME_TYPES = new Set(Object.keys(GAME_META));

function localizedGames(t) {
  return Object.fromEntries(
    Object.entries(GAME_META).map(([key, meta]) => [
      key,
      { ...meta, ...(t.rehabilitationWorkspace?.games?.[key] ?? {}) },
    ]),
  );
}

export function RehabilitationGamesPage({
  t,
  patients,
  sessions,
  rehabilitationSessions = [],
  onSaveRehabilitationSession,
  preselectedPatientId,
  onOpenPatientRehabilitation,
  onWorkflowFocusChange,
}) {
  const [patientId, setPatientId] = useState(preselectedPatientId ?? null);
  const [selectedGame, setSelectedGame] = useState("stability_challenge");
  const [difficulty, setDifficulty] = useState("standard");
  const [durationSeconds, setDurationSeconds] = useState(45);
  const [activeSession, setActiveSession] = useState(null);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [step, setStep] = useState(0);
  const [setupSubStep, setSetupSubStep] = useState(0);
  const games = useMemo(() => localizedGames(t), [t]);

  const selectedPatient = patients.find((p) => p.id === patientId);
  const patientRehabSessions = rehabilitationSessions.filter(
    (s) => s.patientId === patientId,
  );
  const latestAssessment = sessions.find((s) => s.patientId === patientId);
  const suggestions = buildGuidedProgram(latestAssessment, t.rehabilitationWorkspace);
  const assessmentProfile = buildAssessmentProfile(latestAssessment, selectedPatient, t.rehabilitationWorkspace);
  const patientAnalytics = buildRehabAnalytics(patientRehabSessions);
  // activeStage: 0=Patient, 1=Exercise, 2=Preview, 3=Training, 4=Review
  const activeStage = step === 1 ? 3 : step === 2 ? 4 : setupSubStep;
  const currentStepLabel = t.rehabilitationWorkspace?.stepTrainingLabel ?? "Step 4 of 5 — Training";

  useEffect(() => {
    onWorkflowFocusChange?.(step === 1);
    return () => onWorkflowFocusChange?.(false);
  }, [onWorkflowFocusChange, step]);

  const runSession = () => {
    if (!selectedPatient) return;
    if (!PLAYABLE_GAME_TYPES.has(selectedGame)) return;
    setActiveSession({
      patientId: selectedPatient.id,
      gameType: selectedGame,
      acquisitionMode: "webcam_mediapipe",
      difficulty,
      durationSeconds,
      score: 0,
      accuracy: 0,
      stability: 0,
      smoothness: 0,
      reactionTimeMs: null,
      pathError: null,
      completionRate: 0,
      successRate: 0,
      trackingQuality: null,
      level: difficulty === "advanced" ? 3 : difficulty === "standard" ? 2 : 1,
      clinicalFocus: games[selectedGame].focus,
      createdAt: new Date().toISOString(),
      date: new Date().toLocaleString(),
      samples: [],
      live: true,
    });
    setSessionSaved(false);
    setStep(1);
  };

  const saveSession = async () => {
    if (!activeSession) return;
    const saved = await onSaveRehabilitationSession(activeSession);
    setActiveSession(saved ? { ...activeSession, ...saved } : activeSession);
    setSessionSaved(true);
  };

  const handleSelectPatient = (id) => {
    setPatientId(id);
    setActiveSession(null);
    setSessionSaved(false);
    setStep(0);
    setSetupSubStep(0);
  };

  return (
    <div className="space-y-5">
      {step !== 1 ? <RehabStepBar activeStage={activeStage} t={t} /> : null}

      {step === 0 ? (
        <RehabSetupStep
          patients={patients}
          allAssessments={sessions}
          allRehabilitationSessions={rehabilitationSessions}
          patientId={patientId}
          selectedPatient={selectedPatient}
          latestAssessment={latestAssessment}
          analytics={patientAnalytics}
          profile={assessmentProfile}
          selectedGame={selectedGame}
          difficulty={difficulty}
          durationSeconds={durationSeconds}
          suggestions={suggestions}
          assessmentProfile={assessmentProfile}
          games={games}
          t={t}
          subStep={setupSubStep}
          onSelectPatient={handleSelectPatient}
          onOpenProfile={() => onOpenPatientRehabilitation?.(patientId)}
          onSelectGame={setSelectedGame}
          onSetDifficulty={setDifficulty}
          onSetDuration={setDurationSeconds}
          onNextSubStep={() => setSetupSubStep((s) => Math.min(s + 1, 2))}
          onPrevSubStep={() => setSetupSubStep((s) => Math.max(s - 1, 0))}
          onStart={runSession}
        />
      ) : null}

      {step === 1 && activeSession ? (
        <RehabTrainingStep
          currentStepLabel={currentStepLabel}
          session={activeSession}
          selectedGame={selectedGame}
          games={games}
          onBack={() => { setStep(0); setSetupSubStep(2); }}
          onRestart={runSession}
          t={t}
          onComplete={(completedSession) => {
            setActiveSession(completedSession);
            setStep(2);
          }}
        />
      ) : null}

      {step === 2 && activeSession ? (
        <RehabReviewStep
          selectedPatient={selectedPatient}
          session={activeSession}
          patientSessions={patientRehabSessions}
          analytics={patientAnalytics}
          games={games}
          t={t}
          saved={sessionSaved}
          onSave={saveSession}
          onNewSession={() => {
            setActiveSession(null);
            setSessionSaved(false);
            setStep(0);
            setSetupSubStep(0);
          }}
          onRepeat={runSession}
          onOpenProfile={() => onOpenPatientRehabilitation?.(patientId)}
        />
      ) : null}
    </div>
  );
}

function SetupPatientRow({ patients, patientId, selectedPatient, latestAssessment, analytics, profile, onSelectPatient, onOpenProfile }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF7F4]">
          <User size={14} className="text-[#43AA8B]" />
        </span>
        <select
          value={patientId ?? ""}
          onChange={(e) => onSelectPatient(Number(e.target.value))}
          className="rounded-lg border border-rehab-line bg-white px-2.5 py-1.5 text-sm font-bold text-rehab-ink outline-none focus:border-rehab-teal"
        >
          {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
        </select>
      </div>
      {selectedPatient && (
        <>
          <div className="hidden h-5 w-px bg-slate-200 sm:block" />
          <PatientPill label="Condition" value={selectedPatient.medicalReason ?? selectedPatient.pathology ?? "—"} />
          <PatientPill
            label="Balance"
            value={latestAssessment?.totalScore != null ? `${latestAssessment.totalScore}/100` : "No assessment"}
            highlight
          />
          <PatientPill label="Risk" value={profile.riskLevel} accent={profile.riskColor} />
        </>
      )}
      <button
        type="button"
        onClick={onOpenProfile}
        className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-rehab-ink transition hover:border-rehab-teal hover:text-rehab-teal"
      >
        Profile <ChevronRight size={13} />
      </button>
    </div>
  );
}

function PatientPill({ label, value, highlight, accent }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-rehab-muted">{label}</p>
      <p
        className={`mt-0.5 text-xs font-semibold ${highlight ? "text-[#43AA8B]" : "text-rehab-ink"}`}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function PatientSelectionRow({ item, selected, onSelect }) {
  const { patient, identifier, condition, score, lastSessionLabel, statusLabel, statusTone } = item;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid w-full grid-cols-[auto_minmax(12rem,1.5fr)_minmax(10rem,1fr)_7rem_9rem_8rem] items-center gap-3 px-4 py-2 text-left transition ${
        selected ? "bg-[#EEF7F4] ring-1 ring-inset ring-rehab-teal/35" : "bg-white hover:bg-slate-50"
      }`}
    >
      <span className={`grid h-9 w-9 place-items-center rounded-lg text-sm font-semibold ${selected ? "bg-rehab-teal text-white" : "bg-slate-100 text-rehab-muted"}`}>
        {patient.fullName?.[0] ?? "?"}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-rehab-ink">{patient.fullName}</span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-rehab-muted">{identifier}</span>
      </span>
      <span className="truncate text-xs text-rehab-muted">{condition}</span>
      <span>
        <span className="text-sm font-semibold" style={{ color: scoreColor(score) }}>{score != null ? `${score}/100` : "—"}</span>
        <span className="mt-1 block h-1.5 rounded-full bg-slate-100">
          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, score ?? 0))}%`, backgroundColor: scoreColor(score) }} />
        </span>
      </span>
      <span className="text-xs text-rehab-muted">{lastSessionLabel}</span>
      <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
    </button>
  );
}

function buildRehabPatientRows(patients, assessments, rehabSessions) {
  return patients.map((patient) => {
    const patientAssessments = assessments
      .filter((session) => session.patientId === patient.id)
      .sort((a, b) => new Date(b.createdAt ?? b.date ?? 0) - new Date(a.createdAt ?? a.date ?? 0));
    const patientRehab = rehabSessions
      .filter((session) => session.patientId === patient.id)
      .sort((a, b) => new Date(b.createdAt ?? b.date ?? 0) - new Date(a.createdAt ?? a.date ?? 0));
    const latestAssessment = patientAssessments[0];
    const latestRehab = patientRehab[0];
    const score = latestAssessment?.totalScore ?? patient.latestScore ?? null;
    const lastSessionTime = latestRehab ? new Date(latestRehab.createdAt ?? latestRehab.date).getTime() : null;
    const daysSinceLastSession = lastSessionTime ? Math.floor((Date.now() - lastSessionTime) / 86400000) : null;
    const status = rehabPatientStatus(patient, score, patientRehab);
    return {
      patient,
      identifier: patient.patientCode ?? patient.patientId ?? `#${patient.id}`,
      condition: patient.medicalReason ?? patient.pathology ?? "—",
      score,
      lastSessionTime,
      daysSinceLastSession,
      lastSessionLabel: relativeDaysLabel(daysSinceLastSession),
      ...status,
    };
  });
}

function rehabPatientStatus(patient, score, rehabSessions) {
  const rawStatus = String(patient.status ?? "").toLowerCase();
  const sorted = rehabSessions.slice().sort((a, b) => new Date(a.createdAt ?? a.date ?? 0) - new Date(b.createdAt ?? b.date ?? 0));
  const delta = sorted.length > 1 ? Number(sorted.at(-1).score ?? 0) - Number(sorted.at(-2).score ?? 0) : 0;
  if (rawStatus.includes("declin") || rawStatus.includes("régression") || delta < -3) {
    return { statusKey: "declining", statusLabel: "En régression", statusTone: "danger" };
  }
  if (Number(score) < 60 || rawStatus.includes("follow")) {
    return { statusKey: "followup", statusLabel: "À suivre", statusTone: "warning" };
  }
  if (delta > 3 || rawStatus.includes("improv")) {
    return { statusKey: "improving", statusLabel: "En amélioration", statusTone: "connected" };
  }
  return { statusKey: "stable", statusLabel: "Stable", statusTone: "neutral" };
}

function relativeDaysLabel(days) {
  if (days == null) return "Aucune séance";
  if (days <= 0) return "aujourd’hui";
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
}

function scoreColor(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "#94A3B8";
  if (value < 60) return "#F94144";
  if (value < 75) return "#F8961E";
  return "#43AA8B";
}

function difficultyGuidance(difficulty, copy) {
  const guidance = copy.difficultyGuidance ?? {};
  return guidance[difficulty] ?? {
    intro: "Initiation : recommandé pour première session ou score < 50",
    standard: "Standard : score entre 50-75, progression normale",
    advanced: "Avancé : score > 75, patient stable",
  }[difficulty] ?? "";
}

function CompactGameTile({ game, selected, onClick }) {
  const Icon = game.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[90px] flex-col items-center gap-2.5 rounded-xl border p-3 text-center transition ${
        selected
          ? "border-[#43AA8B] bg-[#F2FBF8] ring-2 ring-[#43AA8B]/15 shadow-sm"
          : "border-rehab-line bg-white hover:border-[#43AA8B]/50 hover:bg-slate-50"
      }`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg text-white" style={{ backgroundColor: game.color }}>
        <Icon size={16} />
      </span>
      <span className="text-[12px] font-semibold leading-tight text-rehab-ink">{game.title}</span>
    </button>
  );
}

function RehabSetupStep({
  patients,
  allAssessments = [],
  allRehabilitationSessions = [],
  patientId,
  selectedPatient,
  latestAssessment,
  analytics,
  profile,
  selectedGame,
  difficulty,
  durationSeconds,
  suggestions,
  assessmentProfile,
  games,
  t,
  subStep,
  onSelectPatient,
  onOpenProfile,
  onSelectGame,
  onSetDifficulty,
  onSetDuration,
  onNextSubStep,
  onPrevSubStep,
  onStart,
}) {
  const copy = t.rehabilitationWorkspace;
  const selectedGameInfo = games[selectedGame];
  const Icon = selectedGameInfo.icon;
  const [planOpen, setPlanOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientFilter, setPatientFilter] = useState("all");

  // ── Sub-step 0: Patient selection ─────────────────────────────────────────
  if (subStep === 0) {
    const enrichedPatients = buildRehabPatientRows(patients, allAssessments, allRehabilitationSessions);
    const query = patientSearch.trim().toLowerCase();
    const filteredPatients = enrichedPatients
      .filter((item) => {
        const matchesSearch = !query || [item.patient.fullName, item.identifier, item.condition]
          .some((value) => String(value ?? "").toLowerCase().includes(query));
        if (!matchesSearch) return false;
        if (patientFilter === "recent") return item.daysSinceLastSession != null && item.daysSinceLastSession <= 7;
        if (patientFilter === "risk") return item.score < 60 || item.statusKey === "declining";
        if (patientFilter === "stale") return item.daysSinceLastSession == null || item.daysSinceLastSession > 30;
        return true;
      })
      .sort((a, b) => (patientFilter === "recent"
        ? (a.daysSinceLastSession ?? 9999) - (b.daysSinceLastSession ?? 9999)
        : (b.lastSessionTime ?? 0) - (a.lastSessionTime ?? 0)));
    const visiblePatients = patientFilter === "all" && !query ? filteredPatients.slice(0, 10) : filteredPatients;
    const selectedRow = enrichedPatients.find((item) => item.patient.id === patientId);
    const filterOptions = [
      ["all", copy.filterAll ?? "Tous"],
      ["recent", copy.filterRecent ?? "Récents"],
      ["risk", copy.filterRisk ?? "À risque"],
      ["stale", copy.filterStale ?? "Sans séance récente"],
    ];

    return (
      <div className="space-y-4">
        <ClinicalCard className="p-4">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-rehab-muted">{copy.selectPatient ?? "Select Patient"}</p>
          <p className="mb-3 text-xs text-rehab-muted">{copy.choosePatientToContinue ?? "Choose the patient for this rehabilitation session."}</p>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-rehab-muted" />
            <input
              value={patientSearch}
              onChange={(event) => setPatientSearch(event.target.value)}
              placeholder={copy.patientSearchPlaceholder ?? "Rechercher un patient par nom, ID ou pathologie..."}
              className="w-full rounded-lg border border-rehab-line bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-rehab-muted focus:border-rehab-teal focus:ring-2 focus:ring-rehab-teal/10"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {filterOptions.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPatientFilter(value)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  patientFilter === value
                    ? "border-rehab-teal bg-[#EEF7F4] text-rehab-teal"
                    : "border-slate-200 bg-white text-rehab-muted hover:border-rehab-teal/50 hover:text-rehab-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-rehab-line bg-white">
            {visiblePatients.length ? (
              <div className="max-h-[250px] divide-y divide-rehab-line overflow-y-auto">
                {visiblePatients.map((item) => (
                  <PatientSelectionRow
                    key={item.patient.id}
                    item={item}
                    selected={patientId === item.patient.id}
                    onSelect={() => onSelectPatient(item.patient.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="text-sm font-semibold text-rehab-ink">
                  {(copy.noPatientFoundFor ?? "Aucun patient trouvé pour '{term}'").replace("{term}", patientSearch)}
                </p>
                <button
                  type="button"
                  onClick={() => { setPatientSearch(""); setPatientFilter("all"); }}
                  className="mt-3 text-sm font-semibold text-rehab-teal hover:underline"
                >
                  {copy.clearSearch ?? "Vider la recherche"}
                </button>
              </div>
            )}
          </div>
        </ClinicalCard>

        {selectedPatient && selectedRow ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF7F4]">
                <User size={14} className="text-[#43AA8B]" />
              </span>
              <span className="text-sm font-semibold text-rehab-ink">{selectedPatient.fullName}</span>
            </div>
            <div className="hidden h-5 w-px bg-slate-200 sm:block" />
            <PatientPill label={copy.condition ?? t.pathology ?? "Condition"} value={selectedRow.condition} />
            <div className="min-w-[9rem]">
              <PatientPill label={t.balanceScore ?? "Balance"} value={selectedRow.score != null ? `${selectedRow.score}/100` : (copy.noAssessment ?? t.noAssessmentsYet ?? "No assessment")} highlight />
              <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, selectedRow.score ?? 0))}%`, backgroundColor: scoreColor(selectedRow.score) }} />
              </div>
            </div>
            <PatientPill label={t.riskShort ?? "Risk"} value={profile.riskLevel} accent={profile.riskColor} />
            <button type="button" onClick={onOpenProfile} className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-rehab-ink transition hover:border-rehab-teal hover:text-rehab-teal">
              {copy.profile ?? t.profile ?? "Profile"} <ChevronRight size={13} />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onNextSubStep}
          disabled={!selectedPatient}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#43AA8B] px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#3b9a7e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copy.chooseExercise ?? "Choose Exercise"} <ChevronRight size={18} />
        </button>
      </div>
    );
  }

  if (false && subStep === 0) {
    return (
      <div className="space-y-4">
        <ClinicalCard className="p-5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-rehab-muted">{copy.selectPatient ?? "Select Patient"}</p>
          <p className="mb-4 text-xs text-rehab-muted">{copy.choosePatientToContinue ?? "Choose the patient for this rehabilitation session."}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {patients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPatient(p.id)}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                  patientId === p.id
                    ? "border-rehab-teal bg-[#F2FBF8] ring-2 ring-rehab-teal/15 shadow-sm"
                    : "border-rehab-line bg-white hover:border-rehab-teal/40 hover:bg-slate-50"
                }`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold ${
                  patientId === p.id ? "bg-rehab-teal text-white" : "bg-slate-100 text-rehab-muted"
                }`}>
                  {p.fullName?.[0] ?? "?"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-rehab-ink">{p.fullName}</span>
                  <span className="mt-0.5 block text-[10px] text-rehab-muted">{p.patientCode ?? p.patientId ?? ""}</span>
                  {p.medicalReason || p.pathology ? (
                    <span className="mt-1 block truncate text-[10px] font-semibold text-rehab-muted">{p.medicalReason ?? p.pathology}</span>
                  ) : null}
                </span>
                {patientId === p.id ? (
                  <CheckCircle2 size={16} className="ml-auto shrink-0 text-rehab-teal" />
                ) : null}
              </button>
            ))}
          </div>
        </ClinicalCard>

        {selectedPatient ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF7F4]">
                <User size={14} className="text-[#43AA8B]" />
              </span>
              <span className="text-sm font-bold text-rehab-ink">{selectedPatient.fullName}</span>
            </div>
            <div className="hidden h-5 w-px bg-slate-200 sm:block" />
            <PatientPill label={copy.condition ?? t.pathology ?? "Condition"} value={selectedPatient.medicalReason ?? selectedPatient.pathology ?? "—"} />
            <PatientPill label={t.balanceScore ?? "Balance"} value={latestAssessment?.totalScore != null ? `${latestAssessment.totalScore}/100` : (copy.noAssessment ?? t.noAssessmentsYet ?? "No assessment")} highlight />
            <PatientPill label={t.riskShort ?? "Risk"} value={profile.riskLevel} accent={profile.riskColor} />
            <button type="button" onClick={onOpenProfile} className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-rehab-ink transition hover:border-rehab-teal hover:text-rehab-teal">
              {copy.profile ?? t.profile ?? "Profile"} <ChevronRight size={13} />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onNextSubStep}
          disabled={!selectedPatient}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#43AA8B] px-8 py-4 text-base font-bold text-white shadow-md transition hover:bg-[#3b9a7e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copy.chooseExercise ?? "Choose Exercise"} <ChevronRight size={18} />
        </button>
      </div>
    );
  }

  // ── Sub-step 1: Exercise selection + configuration ─────────────────────────
  if (subStep === 1) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <ClinicalCard className="p-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-rehab-muted">{copy.exerciseLibrary}</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(games).map(([key, game]) => (
                <CompactGameTile key={key} game={game} selected={selectedGame === key} onClick={() => onSelectGame(key)} />
              ))}
            </div>
          </ClinicalCard>

          <ClinicalCard className="flex flex-col p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ backgroundColor: selectedGameInfo.color }}>
                <Icon size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold leading-tight text-rehab-ink">{selectedGameInfo.title}</h3>
                <p className="mt-0.5 text-xs text-rehab-muted">{selectedGameInfo.primaryGoal}</p>
              </div>
              <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-rehab-muted">{selectedGameInfo.difficulty}</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-rehab-muted">{selectedGameInfo.description}</p>
            {selectedGameInfo.objectives?.length ? (
              <ul className="mt-4 space-y-1.5">
                {selectedGameInfo.objectives.slice(0, 3).map((obj) => (
                  <li key={obj} className="flex items-start gap-2 text-xs font-medium text-rehab-ink">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rehab-teal" />
                    {obj}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-auto grid gap-3 pt-5">
              <ConfigurationSelect
                label={copy.difficulty}
                value={difficulty}
                onChange={onSetDifficulty}
                options={[
                  ["intro", copy.difficultyLabels.intro],
                  ["standard", copy.difficultyLabels.standard],
                  ["advanced", copy.difficultyLabels.advanced],
                ]}
              />
              <ConfigurationSelect
                label={copy.duration}
                value={durationSeconds}
                onChange={(value) => onSetDuration(Number(value))}
                options={[
                  [30, `30 ${copy.seconds}`],
                  [45, `45 ${copy.seconds}`],
                  [60, `60 ${copy.seconds}`],
                  [90, `90 ${copy.seconds}`],
                  [120, `2 ${copy.minutes ?? "minutes"}`],
                ]}
              />
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-rehab-muted">
                {difficultyGuidance(difficulty, copy)}
              </p>
              <div className="rounded-xl border border-rehab-line bg-white p-3">
                <p className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-rehab-muted">
                  <BrainCircuit size={13} className="text-rehab-teal" />
                  {copy.recommendedPlan}
                </p>
                <div className="space-y-2">
                  {suggestions.slice(0, 3).map((item, index) => {
                    const game = games[item.gameType];
                    const ItemIcon = game.icon;
                    return (
                      <button
                        key={item.gameType}
                        type="button"
                        onClick={() => { onSelectGame(item.gameType); onSetDifficulty(item.difficulty); }}
                        className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                          selectedGame === item.gameType
                            ? "border-rehab-teal bg-[#EEF7F4]"
                            : "border-slate-200 hover:border-rehab-teal/50"
                        }`}
                      >
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-white" style={{ backgroundColor: game.color }}>
                          <ItemIcon size={13} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-rehab-ink">{index + 1}. {game.title}</span>
                          <span className="block truncate text-[10px] font-semibold text-rehab-muted">{item.reason}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </ClinicalCard>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onPrevSubStep}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-rehab-ink shadow-sm transition hover:border-rehab-teal hover:text-rehab-teal"
          >
            <ChevronRight size={16} className="rotate-180" /> Patient
          </button>
          <button
            type="button"
            onClick={onNextSubStep}
            className="flex flex-1 items-center justify-center gap-3 rounded-2xl bg-[#43AA8B] px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#3b9a7e]"
          >
            {copy.previewExercise ?? "Preview Exercise"} <ChevronRight size={18} />
          </button>
        </div>

        <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setPlanOpen((prev) => !prev)}
            className="flex w-full items-center justify-between px-5 py-4 text-sm font-semibold text-rehab-ink"
          >
            <span className="flex items-center gap-2">
              <BrainCircuit size={15} className="text-rehab-muted" />
              {copy.recommendedPlan}
            </span>
            <ChevronRight size={16} className={`shrink-0 text-rehab-muted transition-transform duration-200 ${planOpen ? "rotate-90" : ""}`} />
          </button>
          {planOpen ? (
            <div className="border-t border-slate-200 px-5 py-4">
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-800">{copy.assessmentFindings}</p>
                <div className="mt-3 space-y-2">
                  {assessmentProfile.findings.map((finding) => (
                    <div key={finding} className="flex items-start gap-2 text-sm font-semibold text-amber-950">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#F8961E]" />
                      {finding}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {suggestions.slice(0, 3).map((item, index) => {
                  const game = games[item.gameType];
                  const ItemIcon = game.icon;
                  return (
                    <button
                      key={item.gameType}
                      type="button"
                      onClick={() => { onSelectGame(item.gameType); onSetDifficulty(item.difficulty); }}
                      className={`flex min-h-16 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                        selectedGame === item.gameType
                          ? "border-rehab-teal bg-emerald-50 ring-2 ring-rehab-teal/10"
                          : "border-slate-200 bg-white hover:border-rehab-teal/50"
                      }`}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ backgroundColor: game.color }}>
                        <ItemIcon size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-rehab-muted">{copy.program} {index + 1}</span>
                        <span className="mt-0.5 block text-sm font-bold text-rehab-ink">{game.title}</span>
                        <span className="mt-0.5 block text-xs text-rehab-muted">{item.reason}</span>
                      </span>
                      <ChevronRight size={14} className="ml-auto shrink-0 text-rehab-muted" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Sub-step 2: Preview + calibration ─────────────────────────────────────
  const CALIBRATION_ITEMS = copy.calibrationItems ?? [
    "Full body visible in camera — head to feet",
    "Stand 2 – 3 m from the camera",
    "Good ambient lighting, avoid strong backlighting",
    "Feet shoulder-width apart, arms free to move",
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        {/* Exercise preview */}
        <ClinicalCard className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ backgroundColor: selectedGameInfo.color }}>
              <Icon size={22} />
            </span>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-rehab-muted">{copy.therapeuticPreview}</p>
              <h2 className="text-xl font-semibold leading-tight text-rehab-ink">{selectedGameInfo.title}</h2>
              <p className="text-xs text-rehab-muted">{selectedGameInfo.primaryGoal}</p>
            </div>
          </div>

          {selectedGameInfo.focus ? (
            <div className="mb-4 rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-rehab-muted">{copy.movementFocus}</p>
              <p className="mt-1 text-sm font-semibold text-rehab-ink">{selectedGameInfo.focus}</p>
            </div>
          ) : null}

          <p className="text-sm leading-6 text-rehab-muted">{selectedGameInfo.description}</p>

          {selectedGameInfo.objectives?.length ? (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-rehab-muted">{copy.therapeuticObjectives}</p>
              <ul className="space-y-2">
                {selectedGameInfo.objectives.map((obj) => (
                  <li key={obj} className="flex items-start gap-2.5 text-sm text-rehab-ink">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-rehab-teal" />
                    {obj}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {selectedGameInfo.bodyParts?.length ? (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-rehab-muted">{copy.bodyPartsInvolved}</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedGameInfo.bodyParts.map((part) => (
                  <span key={part} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-rehab-ink">
                    {part}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </ClinicalCard>

        {/* Calibration checklist */}
        <div className="flex flex-col gap-4">
          <ClinicalCard className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck size={16} className="text-rehab-teal" />
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-rehab-muted">{copy.cameraSetup ?? "Camera setup"}</p>
            </div>
            <ul className="space-y-3">
              {CALIBRATION_ITEMS.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#EEF7F4]">
                    <CheckCircle2 size={13} className="text-rehab-teal" />
                  </span>
                  <span className="text-sm text-rehab-ink">{item}</span>
                </li>
              ))}
            </ul>
          </ClinicalCard>

          <ClinicalCard className="p-5">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-rehab-muted">{copy.sessionSettings ?? "Session settings"}</p>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-rehab-muted">{copy.difficulty}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-rehab-ink">{copy.difficultyLabels?.[difficulty] ?? difficulty}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-rehab-muted">{copy.duration}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-rehab-ink">{durationSeconds}s</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-rehab-muted">{t.patient ?? "Patient"}</span>
                <span className="truncate max-w-[120px] rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-rehab-ink">{selectedPatient?.fullName ?? "—"}</span>
              </div>
            </div>
          </ClinicalCard>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onPrevSubStep}
          className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-rehab-ink shadow-sm transition hover:border-rehab-teal hover:text-rehab-teal"
        >
          <ChevronRight size={16} className="rotate-180" /> {copy.exerciseBack ?? copy.workflowSteps?.[1] ?? "Exercise"}
        </button>
        <button
          type="button"
          onClick={onStart}
          className="flex flex-1 items-center justify-center gap-3 rounded-2xl bg-[#43AA8B] px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#3b9a7e]"
        >
          <Play size={20} /> {copy.beginTraining ?? copy.startTraining ?? "Begin Training"} <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

function RehabTrainingStep({ currentStepLabel, session, selectedGame, games, onBack, onRestart, onComplete, t }) {
  const copy = t.rehabilitationWorkspace;
  const game = games[session?.gameType ?? selectedGame];
  const Icon = game.icon;
  const [finishSignal, setFinishSignal] = useState(0);
  const [liveSummary, setLiveSummary] = useState({
    elapsedSeconds: 0,
    accuracy: 0,
    stability: 0,
    smoothness: 0,
    successRate: 0,
    sampleCount: 0,
    feedback: copy.waitingTracking,
  });
  const [paused, setPaused] = useState(false);

  if (session?.gameType === "obstacle_avoidance") {
    return (
      <ObstacleAvoidanceArena
        session={session}
        games={games}
        onBack={onBack}
        onRestart={onRestart}
        onComplete={onComplete}
        t={t}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-rehab-ink">
      <section className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_17rem]">
        <main className="relative min-h-screen overflow-hidden bg-slate-950">
          <div className="absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-lg border border-white/50 bg-white/90 px-2.5 py-1.5 shadow-sm backdrop-blur-md">
            <button type="button" onClick={onBack} className="rounded-md px-2.5 py-1 text-xs font-semibold text-rehab-ink transition hover:bg-slate-100">
              {copy.backToSetup}
            </button>
            <span className="h-3.5 w-px bg-slate-300" />
            <button type="button" onClick={onRestart} className="rounded-md px-2.5 py-1 text-xs font-semibold text-rehab-ink transition hover:bg-slate-100">
              {copy.restart}
            </button>
            <span className="h-3.5 w-px bg-slate-300" />
            <button type="button" onClick={() => setFinishSignal((value) => value + 1)} className="rounded-md bg-rehab-blue px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90">
              {copy.endTraining}
            </button>
            <span className="h-3.5 w-px bg-slate-300" />
            <span className="text-xs font-semibold tabular-nums text-rehab-muted">
              {Math.round(liveSummary.elapsedSeconds)}s / {session.durationSeconds}s
            </span>
          </div>

          <div className="h-screen">
            <MotionRehabArena
              session={session}
              game={game}
              t={t}
              onLiveSummary={setLiveSummary}
              onComplete={onComplete}
              finishSignal={finishSignal}
              paused={paused}
            />
          </div>
        </main>
        <aside className="flex max-h-screen min-h-screen flex-col gap-3 overflow-y-auto border-l border-rehab-line bg-white p-3 text-rehab-ink">
          <div className="flex items-center gap-2 rounded-lg border border-rehab-line bg-rehab-surface px-3 py-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white" style={{ backgroundColor: game.color }}>
              <Icon size={13} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-rehab-ink">{game.title}</p>
              <p className="text-[10px] font-semibold text-rehab-muted">{currentStepLabel}</p>
            </div>
          </div>

          <LiveMotionPanel game={game} summary={liveSummary} copy={copy} elapsedSeconds={liveSummary.elapsedSeconds} durationSeconds={session.durationSeconds} />

          <div className="mt-auto flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              className="rounded-lg border border-rehab-line bg-white px-3 py-1.5 text-xs font-semibold text-rehab-ink transition hover:border-[#43AA8B]"
            >
              {paused ? copy.resume : copy.pause}
            </button>
            <Button onClick={() => setFinishSignal((value) => value + 1)} className="w-full py-2 text-xs">
              {copy.end}
            </Button>
          </div>
        </aside>
      </section>
    </div>
  );
}

// ─── Obstacle Avoidance Arena ─────────────────────────────────────────────────

function ObstacleAvoidanceArena({ session, games, onBack, onRestart, onComplete, t }) {
  const copy = t.rehabilitationWorkspace;
  const game = games["obstacle_avoidance"] ?? games.stability_challenge;
  const Icon = game.icon;
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const streamRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: webcamVideoConstraints, audio: false });
        streamRef.current = s;
        if (!cancelled) setStream(s);
      } catch (err) {
        if (!cancelled) setCameraError(err.message || copy.webcamAccessFailed || "Camera unavailable");
      }
    }
    startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks?.().forEach((track) => track.stop());
    };
  }, []);

  const handleComplete = useCallback((result) => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    onComplete({ ...session, ...result });
  }, [onComplete, session]);

  const handleBack = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    onBack();
  }, [onBack]);

  if (cameraError && !demoMode) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-slate-950 p-8 text-center text-white">
        <Webcam size={38} className="text-slate-400" />
        <p className="text-xl font-semibold">{copy.webcamUnavailable}</p>
        <p className="max-w-sm text-sm text-white/60">{cameraError}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setDemoMode(true)}
            className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-900"
          >
            {copy.useDemoSimulation}
          </button>
          <button
            type="button"
            onClick={handleBack}
            className="rounded-xl border border-white/25 px-6 py-3 text-sm font-semibold text-white"
          >
            {copy.backToSetup}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div className="absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-lg border border-white/50 bg-white/90 px-2.5 py-1.5 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-1.5 pr-1">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white" style={{ backgroundColor: game.color }}>
            <Icon size={11} />
          </span>
          <span className="text-xs font-semibold text-rehab-ink">{game.title}</span>
        </div>
        <span className="h-3.5 w-px bg-slate-300" />
        <button type="button" onClick={handleBack} className="rounded-md px-2.5 py-1 text-xs font-semibold text-rehab-ink transition hover:bg-slate-100">
          {copy.backToSetup}
        </button>
        <span className="h-3.5 w-px bg-slate-300" />
        <button type="button" onClick={onRestart} className="rounded-md px-2.5 py-1 text-xs font-semibold text-rehab-ink transition hover:bg-slate-100">
          {copy.restart}
        </button>
      </div>
      <div className="h-screen">
        <ObstacleAvoidanceGame
          stream={demoMode ? null : stream}
          patient={session}
          difficulty={session.difficulty === "advanced" ? "advanced" : session.difficulty === "intro" ? "intro" : "standard"}
          durationSeconds={session.durationSeconds ?? 60}
          onComplete={handleComplete}
          onCancel={handleBack}
          copy={copy}
        />
      </div>
    </div>
  );
}

function MotionRehabArena({ session, game, t, onLiveSummary, onComplete, finishSignal, paused = false }) {
  const copy = t.rehabilitationWorkspace;
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const samplesRef = useRef([]);
  const lastSampleAtRef = useRef(0);
  const startedAtRef = useRef(0);
  const completedRef = useRef(false);
  const demoTimerRef = useRef(null);
  const [streamReady, setStreamReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [frame, setFrame] = useState(null);
  const [countdown, setCountdown] = useState(3);
  const [demoMode, setDemoMode] = useState(false);

  const finishSession = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    const completed = buildMotionSessionFromSamples(session, samplesRef.current, demoMode ? "demo" : "webcam_mediapipe");
    videoRef.current?.srcObject?.getTracks?.().forEach((track) => track.stop());
    onComplete(completed);
  }, [demoMode, onComplete, session]);

  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: webcamVideoConstraints,
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        startedAtRef.current = 0;
        samplesRef.current = [];
        setStreamReady(true);
        setCountdown(3);
      } catch (error) {
        setCameraError(error.message || copy.webcamAccessFailed);
      }
    }
    startCamera();
    return () => {
      cancelled = true;
      videoRef.current?.srcObject?.getTracks?.().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if ((!streamReady && !demoMode) || completedRef.current) return undefined;
    setCountdown(3);
    const timer = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          startedAtRef.current = performance.now();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [streamReady, demoMode]);

  useEffect(() => {
    if (finishSignal > 0) finishSession();
  }, [finishSignal, finishSession]);

  useEffect(() => {
    if (!demoMode || countdown > 0 || paused || completedRef.current) return undefined;
    demoTimerRef.current = window.setInterval(() => {
      const now = performance.now();
      if (!startedAtRef.current) startedAtRef.current = now;
      const elapsedSeconds = (now - startedAtRef.current) / 1000;
      if (elapsedSeconds >= session.durationSeconds) {
        window.clearInterval(demoTimerRef.current);
        finishSession();
        return;
      }
      const nextFrame = buildDemoMotionFrame({
        gameType: session.gameType,
        elapsedSeconds,
        durationSeconds: session.durationSeconds,
        difficulty: session.difficulty,
        previousSamples: samplesRef.current,
      });
      samplesRef.current = [...samplesRef.current, nextFrame.sample].slice(-1200);
      const summary = summarizeMotionSamples(samplesRef.current, session.durationSeconds, elapsedSeconds, session.gameType);
      setFrame(nextFrame);
      onLiveSummary({ ...summary, elapsedSeconds, sampleCount: samplesRef.current.length, feedback: nextFrame.feedback, tracking: { demo: true } });
    }, 120);
    return () => {
      if (demoTimerRef.current) window.clearInterval(demoTimerRef.current);
    };
  }, [countdown, demoMode, finishSession, onLiveSummary, paused, session]);

  useMediaPipePose({
    videoRef,
    canvasRef,
    active: streamReady && !demoMode && !completedRef.current,
    t,
    onMetrics: (metrics) => {
      if (paused || countdown > 0) return;
      const now = performance.now();
      if (!startedAtRef.current) startedAtRef.current = now;
      const elapsedSeconds = (now - startedAtRef.current) / 1000;
      if (elapsedSeconds >= session.durationSeconds) {
        finishSession();
        return;
      }
      if (now - lastSampleAtRef.current < 120) return;
      lastSampleAtRef.current = now;

      const nextFrame = buildMotionGameFrame({
        gameType: session.gameType,
        metrics,
        elapsedSeconds,
        durationSeconds: session.durationSeconds,
        difficulty: session.difficulty,
        previousSamples: samplesRef.current,
      });
      samplesRef.current = [...samplesRef.current, nextFrame.sample].slice(-1200);
      const summary = summarizeMotionSamples(samplesRef.current, session.durationSeconds, elapsedSeconds, session.gameType);
      setFrame(nextFrame);
      onLiveSummary({
        ...summary,
        elapsedSeconds,
        sampleCount: samplesRef.current.length,
        feedback: nextFrame.feedback,
        tracking: metrics.engines,
      });
    },
  });

  const elapsed = frame?.sample?.t ?? 0;
  const progress = Math.min(100, (elapsed / session.durationSeconds) * 100);

  return (
    <div className="relative h-full min-h-screen overflow-hidden bg-slate-950">
      <video
        ref={videoRef}
        muted
        playsInline
        className="absolute inset-0 h-full w-full scale-x-[-1] object-cover opacity-80"
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full scale-x-[-1]" />
      <MotionGameOverlay
        frame={frame}
        game={game}
        cameraError={cameraError}
        streamReady={streamReady || demoMode}
        countdown={countdown}
        paused={paused}
        demoMode={demoMode}
        onStartDemo={() => {
          videoRef.current?.srcObject?.getTracks?.().forEach((track) => track.stop());
          samplesRef.current = [];
          setDemoMode(true);
          setCameraError("");
          setStreamReady(false);
        }}
        copy={copy}
      />
      <div className="absolute left-5 right-5 top-5 flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-xl bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{copy.mediaPipeControl}</p>
          <p className="text-sm font-semibold text-rehab-ink">{game.control ?? copy.fullBodyLandmarks}</p>
        </div>
        <div className="rounded-xl bg-white/90 px-4 py-3 text-right shadow-sm backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{copy.timer}</p>
          <p className="text-sm font-semibold text-rehab-ink">{Math.round(elapsed)}s / {session.durationSeconds}s</p>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-white/25">
        <div className="h-full bg-[#43AA8B]" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function MotionGameOverlay({ frame, game, cameraError, streamReady, countdown = 0, paused = false, demoMode = false, onStartDemo, copy }) {
  if (cameraError) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-slate-950/80 p-8 text-center text-white">
        <div>
          <Webcam className="mx-auto mb-4" size={34} />
          <p className="text-xl font-semibold">{copy.webcamUnavailable}</p>
          <p className="mt-2 max-w-md text-sm text-white/75">{cameraError}</p>
          <button
            type="button"
            onClick={onStartDemo}
            className="mt-5 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-rehab-ink"
          >
            {copy.useDemoSimulation}
          </button>
        </div>
      </div>
    );
  }
  if (countdown > 0 && streamReady) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-slate-950/35 p-8 text-center text-white">
        <div className="rounded-2xl bg-white/92 px-10 py-8 text-rehab-ink shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-rehab-muted">{copy.getReady}</p>
          <p className="mt-2 text-7xl font-semibold" style={{ color: game.color }}>{countdown}</p>
          <p className="mt-2 text-sm font-semibold">{copy.standTall}</p>
        </div>
      </div>
    );
  }
  if (!streamReady || !frame) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-slate-950/55 p-8 text-center text-white">
        <div>
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-white/10">
            <Webcam size={25} />
          </div>
          <p className="text-xl font-semibold">{copy.standInView}</p>
          <p className="mt-2 max-w-md text-sm text-white/75">{copy.trackingInstruction}</p>
          <span className="mx-auto mt-4 block h-6 w-6 animate-spin rounded-full border-2 border-white/25 border-t-[#43AA8B]" aria-hidden="true" />
        </div>
      </div>
    );
  }

  const marker = toPercentPoint(frame.marker);
  const target = toPercentPoint(frame.target);
  const hand = frame.hand ? toPercentPoint(frame.hand) : null;
  const obstacles = frame.obstacles ?? [];
  const gameType = frame.sample?.gameType;
  const instruction = frame.instruction ?? frame.feedback;

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <radialGradient id="targetGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={game.color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={game.color} stopOpacity="0.02" />
        </radialGradient>
      </defs>
      <rect x="4" y="6" width="92" height="88" rx="4" fill="rgba(15,23,42,0.16)" stroke="rgba(255,255,255,0.24)" />
      <line x1="50" x2="50" y1="8" y2="92" stroke="rgba(255,255,255,0.32)" strokeDasharray="2 2" />
      <line x1="8" x2="92" y1="50" y2="50" stroke="rgba(255,255,255,0.32)" strokeDasharray="2 2" />
      {frame.path?.map((point, index) => {
        if (index === 0) return null;
        const prev = toPercentPoint(frame.path[index - 1]);
        const current = toPercentPoint(point);
        return <line key={index} x1={prev.x} y1={prev.y} x2={current.x} y2={current.y} stroke="#F9C74F" strokeWidth="0.7" opacity="0.75" />;
      })}
      {obstacles.map((obstacle, index) => {
        const point = toPercentPoint(obstacle);
        return <circle key={index} cx={point.x} cy={point.y} r={obstacle.r ?? 4} fill="#F94144" opacity="0.75" />;
      })}
      {gameType === "stability_challenge" ? (
        <circle cx={50} cy={50} r={frame.targetRadius ?? 10} fill="rgba(67,170,139,0.20)" stroke="#43AA8B" strokeWidth="1.2" />
      ) : (
        <circle cx={target.x} cy={target.y} r={frame.targetRadius ?? 8} fill="url(#targetGlow)" stroke={game.color} strokeWidth="1.2" className="animate-pulse" />
      )}
      {hand ? <circle cx={hand.x} cy={hand.y} r="3.2" fill="#F9C74F" stroke="white" strokeWidth="1" /> : null}
      <circle cx={marker.x} cy={marker.y} r={gameUsesHands(gameType) ? 3.1 : 4.2} fill={frame.success ? "#43AA8B" : "#F94144"} stroke="white" strokeWidth="1.2" />
      <rect x="6" y="84.5" width="88" height="8.5" rx="2.5" fill="rgba(255,255,255,0.90)" />
      <text x="50" y="90.2" textAnchor="middle" fill="#14213D" fontSize="3.2" fontWeight="800">{paused ? copy.paused : instruction}</text>
      {demoMode ? <text x="94" y="11" textAnchor="end" fill="#F9C74F" fontSize="2.6" fontWeight="800">{copy.demo}</text> : null}
    </svg>
  );
}

function LiveMotionPanel({ game, summary, copy, dark = false, elapsedSeconds, durationSeconds }) {
  const hasTrackingData = Number(summary.sampleCount ?? 0) > 0 || Number(elapsedSeconds ?? 0) > 0.2;
  const metrics = [
    { label: copy.accuracy, value: summary.accuracy, color: "#90BE6D" },
    { label: copy.stability, value: summary.stability, color: "#43AA8B" },
    { label: copy.success ?? copy.successRate, value: summary.successRate, color: "#F8961E" },
  ];
  const progress = durationSeconds > 0 ? Math.min(100, ((elapsedSeconds ?? 0) / durationSeconds) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {durationSeconds > 0 ? (
        <div>
          <div className="mb-1 flex justify-between text-xs font-semibold text-rehab-muted">
            <span>{copy.time ?? "Time"}</span>
            <span className="tabular-nums">{Math.round(elapsedSeconds ?? 0)}s / {durationSeconds}s</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#577590] transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      <p className={`text-xs font-semibold leading-5 ${dark ? "text-cyan-100/70" : "text-rehab-muted"}`}>{summary.feedback}</p>

      <div className="space-y-3">
        {metrics.map(({ label, value, color }) => (
          <div key={label}>
            <div className={`flex justify-between text-xs font-semibold ${dark ? "text-white" : "text-rehab-ink"}`}>
              <span>{label}</span>
              <span style={{ color: hasTrackingData ? color : "#94A3B8" }}>{hasTrackingData ? `${formatValue(value)}%` : "—"}</span>
            </div>
            <div className={`mt-1 h-1.5 rounded-full ${dark ? "bg-white/15" : "bg-slate-200"}`}>
              <div className="h-full rounded-full transition-all" style={{ width: hasTrackingData ? `${Math.min(100, Number(value) || 0)}%` : "0%", backgroundColor: hasTrackingData ? color : "#CBD5E1" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Workflow step bar ────────────────────────────────────────────────────────

const REHAB_WORKFLOW_STEP_ICONS = [User, Activity, Lightbulb, Play, CheckCircle2];

function RehabStepBar({ activeStage, t }) {
  const labels = t?.rehabilitationWorkspace?.workflowSteps ?? ["Patient", "Exercise", "Preview", "Training", "Review"];
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-clinical">
      <div className="grid grid-cols-5">
        {REHAB_WORKFLOW_STEP_ICONS.map((Icon, index) => {
          const label = labels[index] ?? String(index + 1);
          return <div
            key={label}
            className={`flex items-center gap-2 px-3 py-3 text-xs font-semibold sm:px-4 sm:text-sm ${
              index === activeStage
                ? "bg-rehab-teal text-white"
                : index < activeStage
                ? "bg-[#EEF7F4] text-[#43AA8B]"
                : "bg-slate-50 text-rehab-muted"
            } ${index > 0 ? "border-l border-slate-200" : ""}`}
          >
            <span
              className={`inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold sm:h-6 sm:w-6 sm:text-[11px] ${
                index === activeStage
                  ? "bg-white/20 text-white"
                  : index < activeStage
                  ? "bg-[#43AA8B] text-white"
                  : "border border-slate-200 bg-white text-rehab-muted"
              }`}
            >
              {index < activeStage ? "✓" : index + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
            <Icon size={14} className="sm:hidden" />
          </div>;
        })}
      </div>
    </div>
  );
}

// ─── Session medal ────────────────────────────────────────────────────────────

function getMedalTiers(copy) {
  return [
    { min: 85, label: copy?.medalGold ?? "Gold", color: "#B5860D", bg: "#FFFBEB", border: "#F9C74F", Icon: Trophy },
    { min: 70, label: copy?.medalSilver ?? "Silver", color: "#64748B", bg: "#F8FAFC", border: "#94A3B8", Icon: Award },
    { min: 55, label: copy?.medalBronze ?? "Bronze", color: "#C05621", bg: "#FFF7ED", border: "#F8961E", Icon: Star },
    { min: 0,  label: copy?.medalParticipation ?? "Participation", color: "#577590", bg: "#F8FAFC", border: "#CBD5E1", Icon: Activity },
  ];
}

function SessionMedal({ score, t }) {
  const tiers = getMedalTiers(t?.rehabilitationWorkspace);
  const tier = tiers.find((m) => score >= m.min) ?? tiers[tiers.length - 1];
  const { label, color, bg, border, Icon } = tier;
  return (
    <div
      className="flex items-center gap-1.5 rounded-full border px-3 py-1"
      style={{ backgroundColor: bg, borderColor: border }}
    >
      <Icon size={13} style={{ color }} />
      <span className="text-xs font-bold" style={{ color }}>{label}</span>
    </div>
  );
}

// ─── Performance radar ────────────────────────────────────────────────────────

function PerformanceRadar({ session, t, unmeasured = false }) {
  const copy = t?.rehabilitationWorkspace;
  if (unmeasured) {
    return (
      <div className="grid min-h-[280px] place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
        <p className="max-w-xs text-sm font-semibold leading-6 text-rehab-muted">
          {copy?.noMeasuredDataMessage ?? "No measured data is available for this session."}
        </p>
      </div>
    );
  }
  const reactionScore = session.reactionTimeMs != null
    ? clamp(100 - session.reactionTimeMs / 12, 0, 100)
    : 70;
  const data = [
    { axis: copy?.accuracy ?? "Accuracy", value: Math.round(session.accuracy ?? 0) },
    { axis: copy?.stability ?? "Stability", value: Math.round(session.stability ?? 0) },
    { axis: copy?.smoothness ?? "Smoothness", value: Math.round(session.smoothness ?? 0) },
    { axis: copy?.success ?? "Success", value: Math.round(session.successRate ?? session.completionRate ?? 0) },
    { axis: copy?.reaction ?? "Reaction", value: Math.round(reactionScore) },
  ];
  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#E2E8F0" />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 13, fill: "#64748B", fontWeight: 700 }} />
          <Radar
            dataKey="value"
            stroke="#43AA8B"
            fill="#43AA8B"
            fillOpacity={0.18}
            strokeWidth={2}
            dot={{ r: 3, fill: "#43AA8B" }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Clinical recommendations ─────────────────────────────────────────────────

function buildRecommendations(session, copy = {}) {
  const recs = [];
  const acc = Number(session.accuracy ?? 0);
  const stab = Number(session.stability ?? 0);
  const sr = Number(session.successRate ?? session.completionRate ?? 0);
  const rt = session.reactionTimeMs;
  const score = Number(session.score ?? 0);
  const recommendationCopy = copy.recommendationMessages ?? {};

  if (score >= 85) {
    recs.push(recommendationCopy.excellent ?? "Excellent performance — consider advancing to a higher difficulty level next session.");
  } else if (score >= 70) {
    recs.push(recommendationCopy.good ?? "Good performance. Maintain this consistency and target 85+ over the next sessions.");
  }

  if (acc < 60) {
    recs.push(recommendationCopy.accuracyLow ?? "Accuracy is below target — try reducing difficulty to build precise body control.");
  } else if (acc >= 85 && recs.length < 2) {
    recs.push(recommendationCopy.accuracyHigh ?? "High accuracy achieved — extend session duration to build endurance.");
  }

  if (stab < 55) {
    recs.push(recommendationCopy.stabilityLow ?? "Stability needs work — focus on slow, controlled holds before dynamic movement.");
  } else if (stab >= 80 && recs.length < 2) {
    recs.push(recommendationCopy.stabilityHigh ?? "Strong stability — progress to path-following or obstacle-avoidance games.");
  }

  if (sr < 50 && recs.length < 3) {
    recs.push(recommendationCopy.successLow ?? "Success rate is low — slower, more deliberate movement patterns will help.");
  }

  if (rt != null && rt > 1200 && recs.length < 3) {
    recs.push(recommendationCopy.reactionSlow ?? "Reaction time is elevated — Weight Shift Trainer and Balloon Pop can improve responsiveness.");
  }

  if (recs.length === 0) {
    recs.push(recommendationCopy.default ?? "Well-rounded session. Gradually increase challenge by adding duration or difficulty.");
  }

  return recs.slice(0, 3);
}

function RecommendationsCard({ session, t }) {
  const recs = buildRecommendations(session, t?.rehabilitationWorkspace);
  return (
    <ClinicalCard className="p-5">
      <div className="flex items-center gap-2.5 border-b border-rehab-line pb-4">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF7F4]">
          <Lightbulb size={15} className="text-[#43AA8B]" />
        </span>
        <div>
          <p className="text-sm font-bold text-rehab-ink">{t?.recommendations ?? "Clinical Recommendations"}</p>
          <p className="text-xs text-rehab-muted">{t?.recommendationsDesc ?? "Personalised guidance based on this session"}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-3">
        {recs.map((rec, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#EEF7F4] text-[10px] font-bold text-[#43AA8B]">
              {i + 1}
            </span>
            <p className="text-sm leading-5 text-rehab-ink">{rec}</p>
          </li>
        ))}
      </ul>
    </ClinicalCard>
  );
}

// ─── Review step ──────────────────────────────────────────────────────────────

function getTrackingEffectiveSeconds(session) {
  const explicit = Number(
    session?.tracking_time_effective ??
      session?.trackingTimeEffective ??
      session?.trackingEffectiveSeconds ??
      session?.trackingQuality?.effectiveSeconds,
  );
  if (Number.isFinite(explicit)) return explicit;
  const samples = Array.isArray(session?.samples) ? session.samples : [];
  const sampleTimes = samples.map((sample) => Number(sample.t)).filter(Number.isFinite);
  if (sampleTimes.length) return Math.max(...sampleTimes);
  return 0;
}

function isUnmeasuredSession(session) {
  const effectiveSeconds = getTrackingEffectiveSeconds(session);
  const score = Number(session?.score ?? 0);
  const accuracy = Number(session?.accuracy ?? 0);
  const stability = Number(session?.stability ?? 0);
  return effectiveSeconds < 3 || (score === 0 && accuracy === 0 && stability === 0);
}

function getAcquisitionLabel(mode, copy = {}) {
  const labels = copy.acquisitionLabels ?? {};
  return labels[mode] ?? {
    webcam_mediapipe: "Webcam · MediaPipe",
    webcam: "Webcam · MediaPipe",
    esp32_ultrasonic: "Capteurs ultrasoniques",
    demo: "Mode démonstration",
    simulation: "Simulation",
  }[mode] ?? mode ?? "—";
}

function RehabReviewStep({ selectedPatient, session, patientSessions, analytics, games, t, saved, onSave, onNewSession, onRepeat, onOpenProfile }) {
  const copy = t.rehabilitationWorkspace;
  const game = games[session.gameType] ?? games.stability_challenge;
  const unmeasured = isUnmeasuredSession(session);
  const combinedSessions = saved || unmeasured ? patientSessions : [session, ...patientSessions];

  return (
    <div className="space-y-5">
      <ClinicalCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#43AA8B]">
              {copy.trainingReview}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-rehab-ink">
              {game.title} {copy.completed}
            </h2>
            <p className="mt-1 text-sm font-medium text-rehab-muted">
              {selectedPatient?.fullName ?? t.patient} - {copy.estimatedIndicators}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {!unmeasured ? <SessionMedal score={session.score} t={t} /> : null}
            <p className="text-3xl font-semibold text-rehab-ink">
              {unmeasured ? "—" : Math.round(session.score)}
              {!unmeasured ? <span className="text-base text-rehab-muted">/100</span> : null}
            </p>
            {!unmeasured ? (
              <StatusBadge tone={session.score >= 75 ? "connected" : session.score >= 55 ? "warning" : "danger"}>
                {session.score >= 75 ? copy.controlled : session.score >= 55 ? copy.needsPractice : copy.highSupport}
              </StatusBadge>
            ) : null}
          </div>
        </div>
      </ClinicalCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {unmeasured ? (
          <ClinicalCard className="p-5">
            <SectionHeader title={copy.sessionNotRecorded ?? "Session not recorded"} description={copy.noMeasuredDataTitle ?? "No measured tracking data"} />
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm font-semibold leading-6 text-rehab-muted">
              {copy.sessionNotRecordedMessage ?? "The session ended before enough body-tracking data was collected. No clinical interpretation or trajectory chart is shown."}
            </div>
          </ClinicalCard>
        ) : (
          <ClinicalCard className="p-5">
            <SectionHeader title={copy.trajectoryControl} description={copy.trajectoryControlDescription} />
            <div className="mt-4">
              <ClinicalGameCanvas session={session} game={game} />
            </div>
          </ClinicalCard>
        )}
        <ClinicalCard className="p-5">
          <SectionHeader title={copy.sessionScores} description={copy.clinicalTrainingIndicators} />
          <ScorePanel session={session} copy={copy} unmeasured={unmeasured} />
          <div className="mt-5 grid gap-2">
            <Button onClick={onSave} disabled={saved || unmeasured} title={unmeasured ? copy.noDataToSave ?? "No data to save" : undefined} className="w-full justify-center py-3">
              <Save size={15} /> {saved ? copy.sessionSaved : copy.saveSession}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onRepeat} className="rounded-xl border border-rehab-line bg-white px-3 py-2.5 text-sm font-semibold text-rehab-ink transition hover:border-[#43AA8B]">
                {copy.repeatExercise}
              </button>
              <button type="button" onClick={onNewSession} className="rounded-xl border border-rehab-line bg-white px-3 py-2.5 text-sm font-semibold text-rehab-ink transition hover:border-[#577590]">
                {copy.newSetup}
              </button>
            </div>
            <button type="button" onClick={onOpenProfile} className="px-2 py-1.5 text-center text-xs font-semibold text-rehab-muted transition hover:text-rehab-teal hover:underline">
              {copy.openPatientRehab}
            </button>
          </div>
        </ClinicalCard>
      </div>

      <ClinicalCard className="p-5">
        <SectionHeader title={copy.sessionHistory} description={copy.sessionHistoryDescription} />
        <SessionHistoryTable sessions={patientSessions} games={games} copy={copy} />
      </ClinicalCard>

      {!unmeasured ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <ClinicalCard className="p-5">
            <SectionHeader title={copy.performanceProfile ?? "Performance Profile"} description={copy.performanceProfileDesc ?? "Multi-axis analysis of this session's key metrics"} />
            <div className="mt-4"><PerformanceRadar session={session} t={t} unmeasured={unmeasured} /></div>
          </ClinicalCard>
          <RecommendationsCard session={session} t={t} />
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <ClinicalCard className="p-5">
          <SectionHeader title={copy.progressTrend} description={copy.progressTrendDescription} />
          <ProgressChart sessions={combinedSessions} analytics={analytics} copy={copy} />
        </ClinicalCard>
        <ClinicalCard className="p-5">
          <SectionHeader title={copy.performanceSummary} description={copy.patientHistory} />
          <PerformanceSummary analytics={analytics} copy={copy} games={games} />
        </ClinicalCard>
      </div>

    </div>
  );
}

function LiveMetric({ label, value, color }) {
  return (
    <div className="rounded-xl border border-white/70 bg-white p-3 shadow-sm">
      <span className="block h-1 w-9 rounded-full" style={{ backgroundColor: color }} />
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-rehab-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-rehab-ink">{value}</p>
    </div>
  );
}

function PatientSnapshot({ patients, patientId, selectedPatient, latestAssessment, profile, games, t, onSelectPatient, onOpenProfile }) {
  const copy = t.rehabilitationWorkspace;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-clinical">
      <div className="border-b border-slate-200 bg-[#f7fbfa] px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-rehab-teal">{copy.patientSnapshot}</p>
            <p className="mt-1 text-sm font-medium text-rehab-muted">{copy.snapshotDescription}</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={patientId ?? ""} onChange={(event) => onSelectPatient(Number(event.target.value))} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-rehab-ink outline-none focus:border-rehab-teal">
              {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.fullName}</option>)}
            </select>
            <button type="button" onClick={onOpenProfile} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-rehab-ink transition hover:border-rehab-teal hover:text-rehab-teal">
              {copy.openProfile}
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-6">
        <SnapshotDatum icon={User} label={t.patient} value={selectedPatient?.fullName ?? "-"} />
        <SnapshotDatum icon={Activity} label={t.pathology} value={t.clinicalTerms?.pathologies?.[selectedPatient?.pathology] ?? selectedPatient?.pathology ?? selectedPatient?.medicalReason ?? "-"} />
        <SnapshotDatum icon={Gauge} label={copy.lastBalanceScore} value={latestAssessment?.totalScore != null ? `${latestAssessment.totalScore}/100` : selectedPatient?.latestScore != null ? `${selectedPatient.latestScore}/100` : copy.noAssessment} />
        <SnapshotDatum icon={ShieldCheck} label={copy.riskLevel} value={profile.riskLevel} accent={profile.riskColor} />
        <SnapshotDatum icon={Target} label={copy.mainDeficit} value={profile.mainDeficit} />
        <SnapshotDatum icon={Play} label={copy.recommendedExercise} value={games[profile.recommendedGame]?.title ?? games.stability_challenge.title} accent="#43AA8B" />
      </div>
    </section>
  );
}

function SnapshotDatum({ icon: Icon, label, value, accent = "#577590" }) {
  return (
    <div className="min-h-24 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ color: accent, backgroundColor: `${accent}16` }}><Icon size={14} /></span>
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-rehab-muted">{label}</p>
      </div>
      <p className="mt-3 text-sm font-bold leading-5 text-rehab-ink">{value}</p>
    </div>
  );
}

function ExercisePreview({ game, copy }) {
  const details = game;
  const Icon = game.icon;
  return (
    <div className="relative min-h-[23rem] overflow-hidden bg-[linear-gradient(145deg,#102b31,#163f3d)] p-6 text-white">
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full border border-white/10" />
      <div className="absolute -bottom-20 -left-16 h-64 w-64 rounded-full border border-white/10" />
      <div className="relative flex h-full min-h-[20rem] flex-col">
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-white/72">{copy.therapeuticPreview}</span>
          <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ backgroundColor: game.color }}><Icon size={19} /></span>
        </div>
        <div className="grid flex-1 place-items-center">
          <ExerciseMotionGraphic type={details.visual} color={game.color} />
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/55">{copy.movementFocus}</p>
          <p className="mt-1 text-lg font-semibold">{game.control ?? copy.fullBodyControl}</p>
        </div>
      </div>
    </div>
  );
}

function ExerciseMotionGraphic({ type, color }) {
  const isReach = type === "reach" || type === "balloon";
  const isLower = type === "squat" || type === "single";
  return (
    <div className="relative h-48 w-64" aria-label={`${type} exercise illustration`} role="img">
      <div className="absolute left-1/2 top-5 h-9 w-9 -translate-x-1/2 rounded-full border-2 border-white/80" />
      <div className={`absolute left-1/2 top-14 h-20 w-0.5 -translate-x-1/2 bg-white/75 ${type === "squat" ? "rotate-6" : ""}`} />
      <div className={`absolute left-1/2 top-20 h-0.5 w-24 -translate-x-1/2 bg-white/75 ${isReach ? "-rotate-12" : ""}`} />
      <div className={`absolute left-[7.1rem] top-[8.2rem] h-0.5 w-16 origin-left bg-white/75 ${isLower ? "rotate-[120deg]" : "rotate-[62deg]"}`} />
      <div className={`absolute left-[8rem] top-[8.2rem] h-0.5 w-16 origin-left bg-white/75 ${isLower ? "rotate-[60deg]" : "rotate-[118deg]"}`} />
      <div className="absolute bottom-4 left-1/2 h-20 w-40 -translate-x-1/2 rounded-[50%] border border-white/15" />
      <div className="absolute bottom-11 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full shadow-[0_0_0_10px_rgba(255,255,255,0.06)]" style={{ backgroundColor: color }} />
      {type === "shift" || type === "path" || type === "maze" || type === "avoid" ? (
        <>
          <Move className="absolute bottom-8 left-5 text-white/45" size={24} />
          <Route className="absolute bottom-8 right-5 text-white/45" size={24} />
        </>
      ) : null}
      {isReach ? <Hand className="absolute right-7 top-12" size={25} style={{ color }} /> : null}
      {isLower ? <Footprints className="absolute bottom-2 right-8 text-white/45" size={24} /> : null}
    </div>
  );
}

function TherapyList({ title, items }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-rehab-muted">{title}</p>
      <ul className="mt-2 space-y-2">
        {items.map((item) => <li key={item} className="flex items-start gap-2 text-sm font-semibold text-rehab-ink"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-rehab-teal" />{item}</li>)}
      </ul>
    </div>
  );
}

function ConfigurationSelect({ label, value, onChange, options }) {
  return (
    <label className="text-[11px] font-medium uppercase tracking-[0.06em] text-rehab-muted">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-rehab-ink outline-none focus:border-rehab-teal">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function PatientContextBar({
  patients,
  patientId,
  selectedPatient,
  latestAssessment,
  analytics,
  onSelectPatient,
  onOpenProfile,
}) {
  const lastSessionDate = analytics.lastSessionDate;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF7F4]">
          <User size={18} className="text-[#43AA8B]" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">
            Patient
          </p>
          <select
            value={patientId ?? ""}
            onChange={(e) => onSelectPatient(Number(e.target.value))}
            className="mt-0.5 rounded-lg border border-rehab-line bg-white px-2 py-1.5 text-sm font-semibold text-rehab-ink"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedPatient && (
        <>
          <div className="h-8 w-px bg-rehab-line" />
          <ContextPill label="Pathology" value={selectedPatient.medicalReason ?? selectedPatient.pathology ?? "—"} />
          <ContextPill
            label="Balance score"
            value={
              latestAssessment?.totalScore != null
                ? `${latestAssessment.totalScore}/100`
                : selectedPatient.latestScore != null
                ? `${selectedPatient.latestScore}/100`
                : "No assessment"
            }
            highlight
          />
          <ContextPill
            label="Rehab sessions"
            value={analytics.count > 0 ? `${analytics.count} done` : "None yet"}
          />
          {lastSessionDate && (
            <ContextPill label="Last session" value={lastSessionDate} />
          )}
          <div className="ml-auto">
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex items-center gap-1.5 rounded-lg border border-rehab-line px-3 py-1.5 text-xs font-semibold text-rehab-ink transition hover:border-[#43AA8B] hover:text-[#43AA8B]"
            >
              Open profile <ChevronRight size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ContextPill({ label, value, highlight }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-rehab-muted">
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm font-semibold ${highlight ? "text-[#43AA8B]" : "text-rehab-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Game card ────────────────────────────────────────────────────────────────

function GameCard({ game, copy, selected, onClick }) {
  const Icon = game.icon;
  const details = game;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex min-h-44 w-full flex-col rounded-xl border p-4 text-left transition ${
        selected
          ? "border-[#43AA8B] bg-[#F2FBF8] shadow-md ring-2 ring-[#43AA8B]/15"
          : "border-rehab-line bg-white hover:-translate-y-0.5 hover:border-[#43AA8B]/50 hover:shadow-sm"
      }`}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ backgroundColor: game.color }}><Icon size={18} /></span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rehab-muted">{details.difficulty}</span>
      </div>
      <p className="mt-4 text-sm font-bold text-rehab-ink">{game.title}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-rehab-muted">{details.description}</p>
      <div className="mt-auto flex w-full items-end justify-between gap-3 pt-4">
        <div><p className="text-[10px] font-medium uppercase tracking-[0.06em] text-rehab-muted">{copy.primaryGoal}</p><p className="mt-0.5 text-xs font-semibold text-rehab-ink">{details.primaryGoal}</p></div>
        <span className="shrink-0 text-[10px] font-bold text-rehab-muted">{details.duration}</span>
      </div>
      {selected ? <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-rehab-teal ring-4 ring-rehab-teal/15" /> : null}
    </button>
  );
}

// ─── Arena panel ──────────────────────────────────────────────────────────────

function ArenaPanel({ session, selectedGame, onSave, saved, disabled }) {
  const game = GAME_META[session?.gameType ?? selectedGame];
  const Icon = game.icon;

  return (
    <div className="flex h-full min-h-[36rem] flex-col">
      {/* Arena header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rehab-line bg-[#F8FBFA] px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-xl text-white"
            style={{ backgroundColor: game.color }}
          >
            <Icon size={18} />
          </span>
          <div>
            <p className="font-semibold text-rehab-ink">{game.title}</p>
            <p className="text-xs font-semibold text-rehab-muted">{game.focus}</p>
          </div>
        </div>
        {session && (
          <button
            type="button"
            onClick={onSave}
            disabled={saved}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              saved
                ? "bg-slate-100 text-rehab-muted cursor-not-allowed"
                : "bg-[#43AA8B] text-white hover:bg-[#3b9a7e]"
            }`}
          >
            <Save size={15} />
            {saved ? "Session saved" : "Save session"}
          </button>
        )}
      </div>

      {/* Arena body */}
      {session ? (
        <div className="grid flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="p-5">
            <ClinicalGameCanvas session={session} game={game} />
          </div>
          <div className="border-t border-rehab-line bg-slate-50 p-5 xl:border-l xl:border-t-0">
            <ScorePanel session={session} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <div className="max-w-sm">
            <span
              className="mx-auto grid h-16 w-16 place-items-center rounded-xl text-white"
              style={{ backgroundColor: game.color }}
            >
              <Icon size={30} />
            </span>
            <p className="mt-5 text-xl font-semibold text-rehab-ink">{game.title}</p>
            <p className="mt-2 text-sm leading-6 text-rehab-muted">
              {game.description}
            </p>
            <p className="mt-5 rounded-xl border border-rehab-line bg-slate-50 px-4 py-3 text-xs font-semibold text-rehab-muted">
              {disabled
                ? "Select a patient from the context bar above, then click Run simulation."
                : "Configure difficulty and duration, then click Run simulation to generate a clinical session."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Clinical game canvas ─────────────────────────────────────────────────────

function ClinicalGameCanvas({ session, game }) {
  const width = 620;
  const height = 400;
  const cx = width / 2;
  const cy = height / 2;
  const points = session.samples.map((s) => ({
    x: cx + (s.markerX ?? 0) * 110,
    y: cy - (s.markerY ?? 0) * 110,
    tx: cx + (s.targetX ?? 0) * 110,
    ty: cy - (s.targetY ?? 0) * 110,
  }));
  const path = points
    .map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const targetPath = points
    .map((p, i) => `${i ? "L" : "M"} ${p.tx.toFixed(1)} ${p.ty.toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full rounded-xl border border-rehab-line bg-white"
      role="img"
      aria-label={`${game.title} clinical training field`}
    >
      <defs>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#E2E8F0" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="12" y="12" width={width - 24} height={height - 24} rx="14" fill="url(#grid)" stroke="#CBD5E1" />
      <line x1={cx} x2={cx} y1="28" y2={height - 28} stroke="#94A3B8" strokeDasharray="5 5" strokeWidth="1" />
      <line x1="28" x2={width - 28} y1={cy} y2={cy} stroke="#94A3B8" strokeDasharray="5 5" strokeWidth="1" />
      {session.gameType === "stability_challenge" && (
        <circle cx={cx} cy={cy} r="60" fill="#90BE6D" opacity="0.12" stroke="#43AA8B" strokeWidth="2" />
      )}
      {session.gameType === "balance_maze" && <MazeWalls />}
      {targetPath && (
        <path d={targetPath} fill="none" stroke="#F9C74F" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      )}
      {path && (
        <path d={path} fill="none" stroke={game.color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {points.slice(0, 12).map((p, i) => (
        <circle key={i} cx={p.tx} cy={p.ty} r="4" fill="#F8961E" opacity="0.45" />
      ))}
      <circle cx={cx} cy={cy} r="4" fill="#264653" />
      {last && (
        <circle cx={last.x} cy={last.y} r="11" fill={game.color} stroke="#fff" strokeWidth="3.5" />
      )}
      <text x="28" y="46" fill="#94A3B8" fontSize="11" fontWeight="700">
        Estimated balance control field
      </text>
    </svg>
  );
}

function MazeWalls() {
  return (
    <g stroke="#264653" strokeWidth="8" strokeLinecap="round" opacity="0.55">
      <path d="M120 110 H300" />
      <path d="M390 110 H520" />
      <path d="M120 210 H230" />
      <path d="M300 210 H500" />
      <path d="M160 310 H360" />
      <path d="M230 110 V210" />
      <path d="M420 210 V330" />
    </g>
  );
}

// ─── Score panel ──────────────────────────────────────────────────────────────

function ScorePanel({ session, copy, unmeasured = false }) {
  const metrics = [
    { label: copy.accuracy, value: session.accuracy, unit: "%", color: "#90BE6D" },
    { label: copy.stability, value: session.stability, unit: "%", color: "#577590" },
    { label: copy.smoothness, value: session.smoothness, unit: "%", color: "#F8961E" },
    { label: copy.success, value: session.successRate ?? session.completionRate, unit: "%", color: "#43AA8B" },
  ];
  const extra = [
    session.reactionTimeMs != null ? [copy.reaction, `${session.reactionTimeMs} ms`] : null,
    session.trackingQuality != null ? [copy.tracking, `${formatValue(session.trackingQuality)}%`] : null,
    session.exits != null ? [copy.zoneExits, session.exits] : null,
    session.targetsHit != null ? [copy.targetsHit, session.targetsHit] : null,
    session.touches != null ? [copy.touches, session.touches] : null,
    (session.targetsMissed ?? session.missedTargets) != null ? [copy.missed, session.targetsMissed ?? session.missedTargets] : null,
    session.pathLength != null ? [copy.trajectory, formatValue(session.pathLength)] : null,
  ].filter(Boolean);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">
        {copy.clinicalScore}
      </p>
      <p className="mt-2 text-3xl font-semibold text-rehab-ink">
        {unmeasured ? "—" : Math.round(session.score)}
        {!unmeasured ? <span className="text-base font-semibold text-rehab-muted">/100</span> : null}
      </p>
      <p className="mt-1 text-xs text-rehab-muted">
        {copy.difficultyLabels?.[session.difficulty] ?? session.difficulty} · {session.durationSeconds}s · {getAcquisitionLabel(session.acquisitionMode, copy)}
      </p>

      {unmeasured ? (
        <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-rehab-muted">
          {copy.sessionNotRecordedMessage ?? "The session ended before enough body-tracking data was collected. No clinical interpretation is shown."}
        </p>
      ) : null}

      {!unmeasured ? <div className="mt-5 space-y-3.5">
        {metrics.map(({ label, value, unit, color }) => (
          <div key={label}>
            <div className="flex justify-between text-sm font-semibold text-rehab-ink">
              <span>{label}</span>
              <span style={{ color }}>
                {formatValue(value)}
                {unit}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-slate-200">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Number(value) || 0)}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        ))}
      </div> : null}

      {!unmeasured && extra.length ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {extra.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-rehab-muted">{label}</p>
              <p className="mt-0.5 text-sm font-semibold text-rehab-ink">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {!unmeasured ? <p className="mt-5 rounded-xl bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-800">
        {copy.diagnosticLimit}
      </p> : null}
    </div>
  );
}

// ─── Progress chart ───────────────────────────────────────────────────────────

function ProgressChart({ sessions, analytics, copy }) {
  const trend = sessions
    .slice()
    .reverse()
    .map((s, i) => ({ label: `R${i + 1}`, score: s.score, accuracy: s.accuracy }));

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap gap-4 text-xs font-semibold text-rehab-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#43AA8B]" />
          <span className="inline-block h-2 w-5 rounded-full bg-[#43AA8B]" /> {copy.score}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#577590]" />
          <span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-[#577590]" /> {copy.accuracy}
        </span>
      </div>
      <div className="h-52 rounded-xl border border-rehab-line bg-white p-4">
        {trend.length < 2 ? (
          <div className="grid h-full place-items-center text-center">
            <p className="max-w-xs text-sm font-semibold leading-6 text-rehab-muted">
              {copy.notEnoughProgressData ?? "Not enough data to display progression."}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ReLineChart data={trend}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke="#94A3B8" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} stroke="#94A3B8" tick={{ fontSize: 11 }} />
              <Line dataKey="score" stroke="#43AA8B" strokeWidth={3} dot={false} isAnimationActive={false} />
              <Line dataKey="accuracy" stroke="#577590" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
            </ReLineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── Performance summary ──────────────────────────────────────────────────────

function PerformanceSummary({ analytics, copy, games }) {
  const items = [
    { label: copy.sessionsDone, value: analytics.count, color: "#43AA8B" },
    { label: copy.averageScore, value: analytics.averageScore ? `${analytics.averageScore}/100` : "—", color: "#577590" },
    { label: copy.averageAccuracy, value: analytics.averageAccuracy ? `${analytics.averageAccuracy}%` : "—", color: "#90BE6D" },
    { label: copy.averageStability, value: analytics.averageStability ? `${analytics.averageStability}%` : "—", color: "#577590" },
    { label: copy.improvement, value: analytics.scoreChange == null ? "—" : `${analytics.scoreChange > 0 ? "+" : ""}${analytics.scoreChange} pts`, color: analytics.scoreChange > 0 ? "#43AA8B" : "#F94144" },
    { label: copy.mostTrained, value: games?.[analytics.mostTrainedGame]?.title ?? "—", color: "#F8961E" },
  ];

  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      {items.map(({ label, value, color }) => (
        <div key={label} className="rounded-xl border border-rehab-line bg-white p-3">
          <span className="block h-1 w-8 rounded-full" style={{ backgroundColor: color }} />
          <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-wide text-rehab-muted">
            {label}
          </p>
          <p className="mt-1 text-lg font-semibold text-rehab-ink">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Session history table ────────────────────────────────────────────────────

function SessionHistoryTable({ sessions, games, copy }) {
  if (!sessions.length) {
    return (
      <div className="mt-4">
        <EmptyState
          title={copy.noSavedSessions}
          description={copy.noSavedSessionsDescription}
        />
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-rehab-line">
            {[copy.date, copy.exercise, copy.difficulty, copy.duration, copy.score, copy.accuracy, copy.stability, copy.smoothness].map(
              (h) => (
                <th key={h} className="pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-rehab-muted last:pr-0">
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-rehab-line">
          {sessions.map((s, i) => {
            const game = games[s.gameType] ?? games.stability_challenge;
            const Icon = game.icon;
            return (
              <tr key={s.id ?? i} className="hover:bg-slate-50">
                <td className="py-3 pr-4 font-semibold text-rehab-muted">
                  {formatDate(s.createdAt ?? s.date)}
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white"
                      style={{ backgroundColor: game.color }}
                    >
                      <Icon size={12} />
                    </span>
                    <span className="font-semibold text-rehab-ink">{game.title}</span>
                  </div>
                </td>
                <td className="py-3 pr-4 text-rehab-muted">{copy.difficultyLabels?.[s.difficulty] ?? s.difficulty ?? "—"}</td>
                <td className="py-3 pr-4 text-rehab-muted">{s.durationSeconds ? `${s.durationSeconds}s` : "—"}</td>
                <td className="py-3 pr-4">
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: game.color }}>
                    {Math.round(s.score ?? 0)}/100
                  </span>
                </td>
                <td className="py-3 pr-4 font-semibold text-rehab-ink">{formatValue(s.accuracy)}%</td>
                <td className="py-3 pr-4 font-semibold text-rehab-ink">{formatValue(s.stability)}%</td>
                <td className="py-3 font-semibold text-rehab-ink">{formatValue(s.smoothness)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({ label, value, color, icon: Icon }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <Icon size={18} style={{ color }} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-rehab-muted">{label}</p>
        <p className="mt-0.5 text-xl font-semibold text-rehab-ink">{value}</p>
      </div>
    </div>
  );
}

// ─── Patient rehabilitation panel (used in patient profile tab) ───────────────

export function PatientRehabilitationPanel({ t, patient, sessions = [], assessments = [], onStartRehabilitation }) {
  const games = localizedGames(t);
  const copy = t.rehabilitationWorkspace;
  const analytics = buildRehabAnalytics(sessions);
  const latestAssessment = assessments[0];
  const suggestions = buildGameSuggestions(latestAssessment, copy).filter((item) => PLAYABLE_GAME_TYPES.has(item.gameType));

  return (
    <ClinicalCard className="p-5">
      <SectionHeader
        title={t.rehabilitation ?? "Rehabilitation"}
        description={copy.exerciseLibraryDescription}
      />
      <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        {[
          { label: copy.sessionsDone, value: sessions.length, color: "#43AA8B" },
          { label: copy.averageScore, value: analytics.averageScore ? `${analytics.averageScore}/100` : "—", color: "#577590" },
          { label: copy.averageAccuracy, value: analytics.averageAccuracy ? `${analytics.averageAccuracy}%` : "—", color: "#90BE6D" },
          { label: copy.improvement, value: analytics.scoreChange == null ? "—" : `${analytics.scoreChange > 0 ? "+" : ""}${analytics.scoreChange} pts`, color: "#F8961E" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-rehab-line bg-white p-4">
            <span className="block h-1 w-8 rounded-full" style={{ backgroundColor: color }} />
            <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-wide text-rehab-muted">{label}</p>
            <p className="mt-1 text-xl font-semibold text-rehab-ink">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-xl border border-rehab-line bg-white p-4">
          <p className="font-semibold text-rehab-ink">{copy.savedSessions}</p>
          {sessions.length ? (
            <div className="mt-3 space-y-2">
              {sessions.slice(0, 6).map((s) => {
                const game = games[s.gameType] ?? games.stability_challenge;
                const Icon = game.icon;
                return (
                  <div key={s.id ?? s.createdAt} className="flex items-center justify-between gap-3 rounded-lg border border-rehab-line px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-md text-white" style={{ backgroundColor: game.color }}>
                        <Icon size={12} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-rehab-ink">{game.title}</p>
                        <p className="text-[10px] text-rehab-muted">{s.date ?? formatDate(s.createdAt)} · {s.difficulty}</p>
                      </div>
                    </div>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: game.color }}>
                      {Math.round(s.score ?? 0)}/100
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-rehab-muted">{copy.noSavedSessions}</p>
          )}
        </div>

        <div className="rounded-xl border border-rehab-line bg-slate-50 p-4">
          <p className="font-semibold text-rehab-ink">{copy.suggestedExercises}</p>
          <div className="mt-3 space-y-2">
            {suggestions.map((item) => (
              <div key={item.gameType} className="rounded-lg bg-white p-3">
                <p className="text-xs font-semibold text-rehab-ink">{games[item.gameType].title}</p>
                <p className="mt-0.5 text-[11px] text-rehab-muted">{item.reason}</p>
              </div>
            ))}
          </div>
          <Button className="mt-4 w-full justify-center" onClick={() => onStartRehabilitation?.(patient.id)}>
            <Play size={15} /> {copy.startRehabilitation}
          </Button>
        </div>
      </div>
    </ClinicalCard>
  );
}

function buildMotionGameFrame({ gameType, metrics, elapsedSeconds, durationSeconds, difficulty, previousSamples }) {
  const control = extractMotionControl(metrics, previousSamples);
  const targetInfo = targetForMotionGame(gameType, elapsedSeconds, durationSeconds, difficulty, previousSamples);
  const marker = markerForMotionGame(gameType, control);
  const hand = gameUsesHands(gameType) ? control.bestHand : null;
  const error = Math.hypot((marker.x ?? 0) - targetInfo.target.x, (marker.y ?? 0) - targetInfo.target.y);
  const success = error < targetInfo.radius && (!gameUsesHands(gameType) || Boolean(hand));
  const previous = previousSamples.at(-1);
  const exitEvent = gameType === "stability_challenge" && previous && previous.inTarget && !success;
  const newTargetSuccess = success && !previousSamples.some((sample) => sample.targetKey === targetInfo.key && sample.inTarget);

  const sample = {
    t: round2(elapsedSeconds),
    gameType,
    targetX: round2(targetInfo.target.x),
    targetY: round2(targetInfo.target.y),
    markerX: round2(marker.x),
    markerY: round2(marker.y),
    ap: round2(control.ap * 10),
    ml: round2(control.ml * 10),
    error: round2(error),
    inTarget: success,
    exitEvent: Boolean(exitEvent),
    targetSuccess: Boolean(newTargetSuccess),
    touched: Boolean(gameUsesHands(gameType) && newTargetSuccess),
    missed: Boolean(gameUsesHands(gameType) && targetInfo.isExpiring && !success),
    handSide: control.handSide ?? null,
    trackingQuality: control.trackingQuality,
    targetKey: targetInfo.key,
    targetStartedAt: targetInfo.startedAt ?? null,
    reactionTimeMs: newTargetSuccess ? reactionTimeForTarget(previousSamples, targetInfo.key, elapsedSeconds, targetInfo.startedAt) : null,
    squatDepth: round2(control.squatDepth),
    singleLeg: control.singleLeg,
  };

  return {
    sample,
    marker,
    target: targetInfo.target,
    hand,
    path: targetInfo.path,
    obstacles: targetInfo.obstacles,
    targetRadius: targetInfo.radius * 38,
    success,
    instruction: targetInfo.instruction,
    feedback: feedbackForGame(gameType, success, control, targetInfo),
  };
}

function buildDemoMotionFrame({ gameType, elapsedSeconds, durationSeconds, difficulty, previousSamples }) {
  const targetInfo = targetForMotionGame(gameType, elapsedSeconds, durationSeconds, difficulty, previousSamples);
  const lag = difficulty === "advanced" ? 0.34 : difficulty === "intro" ? 0.16 : 0.24;
  const noise = difficulty === "advanced" ? 0.16 : difficulty === "intro" ? 0.07 : 0.11;
  const wobble = {
    x: Math.sin(elapsedSeconds * 1.7) * noise + Math.sin(elapsedSeconds * 0.41) * 0.04,
    y: Math.cos(elapsedSeconds * 1.35) * noise + Math.cos(elapsedSeconds * 0.52) * 0.04,
  };
  const marker = {
    x: targetInfo.target.x * (1 - lag) + wobble.x,
    y: targetInfo.target.y * (1 - lag) + wobble.y,
  };
  const hand = gameUsesHands(gameType) ? marker : null;
  const error = Math.hypot(marker.x - targetInfo.target.x, marker.y - targetInfo.target.y);
  const success = error < targetInfo.radius;
  const previous = previousSamples.at(-1);
  const newTargetSuccess = success && !previousSamples.some((sample) => sample.targetKey === targetInfo.key && sample.inTarget);
  const sample = {
    t: round2(elapsedSeconds),
    gameType,
    targetX: round2(targetInfo.target.x),
    targetY: round2(targetInfo.target.y),
    markerX: round2(marker.x),
    markerY: round2(marker.y),
    ap: round2(marker.y * 10),
    ml: round2(marker.x * 10),
    error: round2(error),
    inTarget: success,
    exitEvent: gameType === "stability_challenge" && previous && previous.inTarget && !success,
    targetSuccess: newTargetSuccess,
    touched: Boolean(gameUsesHands(gameType) && newTargetSuccess),
    missed: Boolean(gameUsesHands(gameType) && targetInfo.isExpiring && !success),
    handSide: Math.sin(elapsedSeconds) > 0 ? "right" : "left",
    trackingQuality: 100,
    targetKey: targetInfo.key,
    targetStartedAt: targetInfo.startedAt ?? null,
    reactionTimeMs: newTargetSuccess ? reactionTimeForTarget(previousSamples, targetInfo.key, elapsedSeconds, targetInfo.startedAt) : null,
  };
  return {
    sample,
    marker,
    target: targetInfo.target,
    hand,
    path: targetInfo.path,
    targetRadius: targetInfo.radius * 38,
    success,
    instruction: targetInfo.instruction,
    feedback: feedbackForGame(gameType, success, { ap: marker.y, ml: marker.x }, targetInfo),
  };
}

function extractMotionControl(metrics, previousSamples = []) {
  const holistic = metrics.rawLandmarks ?? {};
  const pose = holistic.pose ?? [];
  const leftWrist = holistic.leftHand?.[8] ?? holistic.leftHand?.[0] ?? pose[15];
  const rightWrist = holistic.rightHand?.[8] ?? holistic.rightHand?.[0] ?? pose[16];
  const leftHip = pose[23];
  const rightHip = pose[24];
  const leftKnee = pose[25];
  const rightKnee = pose[26];
  const leftAnkle = pose[27];
  const rightAnkle = pose[28];
  const leftFoot = pose[31];
  const rightFoot = pose[32];
  const bodyCenter = metrics.bodyCenter ?? midpointSafe(leftHip, rightHip) ?? { x: 0.5, y: 0.55 };
  const footCenter = metrics.footCenter ?? midpointSafe(leftFoot, rightFoot) ?? { x: 0.5, y: 0.86 };
  const ml = clamp((bodyCenter.x - 0.5) * 3.4, -1, 1);
  const ap = clamp((footCenter.y - bodyCenter.y - 0.28) * 3.2, -1, 1);
  const leftHand = landmarkToGamePoint(leftWrist);
  const rightHand = landmarkToGamePoint(rightWrist);
  const handChoice = chooseBestHand(leftHand, rightHand, previousSamples.at(-1));
  const leftKneeAngle = jointAngle(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = jointAngle(rightHip, rightKnee, rightAnkle);
  const kneeAngle = average([leftKneeAngle, rightKneeAngle].filter(Number.isFinite));
  const squatDepth = Number.isFinite(kneeAngle) ? clamp((170 - kneeAngle) / 70, 0, 1) : 0;

  return {
    bodyCursor: { x: ml, y: ap },
    bestHand: handChoice.point,
    handSide: handChoice.side,
    leftHand,
    rightHand,
    ap,
    ml,
    squatDepth,
    kneeAngle,
    singleLeg: isFootLifted(leftAnkle, rightAnkle, leftFoot, rightFoot),
    stabilityScore: metrics.stabilityScore,
    bodyCenterDeviation: metrics.bodyCenterDeviation,
    trackingQuality: clamp(Number(metrics.landmarkCount ?? 0) / 543 * 100, 0, 100),
  };
}

function targetForMotionGame(gameType, elapsed, duration, difficulty, samples) {
  const difficultyScale = difficulty === "advanced" ? 0.82 : difficulty === "intro" ? 1.2 : 1;
  const radius = 0.22 * difficultyScale;
  if (gameType === "stability_challenge") {
    return { target: { x: 0, y: 0, label: "Hold center" }, radius: 0.26 * difficultyScale, key: "freeze-center", instruction: "Hold still inside the green zone" };
  }
  if (gameType === "weight_shift_trainer") {
    const targets = [
      { x: -0.62, y: 0, label: "Lean left" },
      { x: 0.62, y: 0, label: "Lean right" },
      { x: 0, y: 0.58, label: "Lean forward" },
      { x: 0, y: -0.58, label: "Lean backward" },
    ];
    const targetDuration = difficulty === "advanced" ? 3 : difficulty === "intro" ? 5 : 4;
    const index = Math.floor(elapsed / targetDuration) % targets.length;
    const bucket = Math.floor(elapsed / targetDuration);
    return { target: targets[index], radius: radius * 1.04, key: `shift-${index}-${bucket}`, startedAt: bucket * targetDuration, instruction: targets[index].label };
  }
  if (gameType === "balloon_pop" || gameType === "reach_touch") {
    const targets = [
      { x: -0.72, y: 0.46 }, { x: 0.72, y: 0.42 }, { x: -0.52, y: -0.35 },
      { x: 0.5, y: -0.42 }, { x: 0, y: 0.62 }, { x: -0.82, y: 0.02 }, { x: 0.82, y: -0.05 },
    ];
    const targetDuration = gameType === "balloon_pop" ? 2.8 : 3.4;
    const bucket = Math.floor(elapsed / targetDuration);
    const phase = elapsed / targetDuration - bucket;
    return { target: targets[bucket % targets.length], radius: radius * 0.92, key: `${gameType}-${bucket}`, startedAt: bucket * targetDuration, instruction: gameType === "balloon_pop" ? "Pop the target with either hand" : "Touch the target with your hand", isExpiring: phase > 0.92 };
  }
  if (gameType === "path_following" || gameType === "balance_maze") {
    const t = Math.min(1, elapsed / Math.max(1, duration));
    const path = Array.from({ length: 42 }, (_, i) => {
      const p = i / 41;
      return { x: -0.78 + p * 1.56, y: Math.sin(p * Math.PI * (gameType === "balance_maze" ? 3 : 2)) * 0.45 };
    });
    return { target: path[Math.min(path.length - 1, Math.floor(t * (path.length - 1)))], radius: radius * 0.72, key: `path-${Math.floor(elapsed)}`, path, instruction: "Follow the yellow line" };
  }
  if (gameType === "squat_trainer") {
    return { target: { x: 0, y: -0.62 }, radius: 0.24, key: `squat-${countSquatReps(samples)}`, requiredDepth: difficulty === "advanced" ? 0.48 : difficulty === "intro" ? 0.26 : 0.36, instruction: "Squat down with control" };
  }
  if (gameType === "single_leg_balance") {
    return { target: { x: 0, y: 0 }, radius: difficulty === "advanced" ? 0.18 : 0.24, key: "single-leg-hold", instruction: "Lift one foot and stay centered" };
  }
  if (gameType === "obstacle_avoidance") {
    const phase = elapsed * (difficulty === "advanced" ? 0.22 : 0.16);
    const obstacles = [
      { x: Math.sin(phase) * 0.72, y: 0.45, r: 5, rNorm: 0.16 },
      { x: Math.cos(phase * 1.2) * 0.68, y: -0.35, r: 5, rNorm: 0.16 },
    ];
    return { target: { x: 0, y: 0 }, radius: 0.32, key: `avoid-${Math.floor(elapsed)}`, obstacles, instruction: "Avoid red obstacles" };
  }
  return { target: { x: 0, y: 0 }, radius, key: "freeze", instruction: "Stay centered" };
}

function markerForMotionGame(gameType, control) {
  if (gameUsesHands(gameType)) return control.bestHand ?? { x: 0, y: 0 };
  if (gameType === "squat_trainer") return { x: 0, y: -control.squatDepth };
  return control.bodyCursor;
}

function summarizeMotionSamples(samples, durationSeconds, elapsedSeconds = durationSeconds, gameType = "stability_challenge") {
  if (!samples.length) return { accuracy: 0, stability: 0, smoothness: 0, successRate: 0, reactionTimeMs: null, pathError: null, completionRate: 0, score: 0 };
  const errors = samples.map((sample) => Number(sample.error)).filter(Number.isFinite);
  const successRate = Math.round((samples.filter((sample) => sample.inTarget).length / samples.length) * 100);
  const pathLength = computeMarkerPath(samples);
  const meanError = average(errors);
  const reactionTimes = samples.map((sample) => sample.reactionTimeMs).filter(Number.isFinite);
  const trackingValues = samples.map((sample) => Number(sample.trackingQuality)).filter(Number.isFinite);
  const exits = samples.filter((sample) => sample.exitEvent).length;
  const targetKeys = [...new Set(samples.map((sample) => sample.targetKey).filter(Boolean))];
  const successfulTargets = targetKeys.filter((key) => samples.some((sample) => sample.targetKey === key && sample.inTarget)).length;
  const missedTargets = gameUsesHands(gameType) ? Math.max(0, targetKeys.length - successfulTargets) : samples.filter((sample) => sample.missed).length;
  const accuracy = clamp(100 - meanError * (gameType === "stability_challenge" ? 58 : 46), 0, 100);
  const stability = clamp(100 - swaySpread(samples) * (gameType === "stability_challenge" ? 34 : 20) - exits * 3.5, 0, 100);
  const smoothness = clamp(100 - pathLength * (gameUsesHands(gameType) ? 1.5 : 2.1) - jerkScore(samples) * 20, 0, 100);
  const completionRate = Math.round(Math.min(100, (elapsedSeconds / Math.max(1, durationSeconds)) * 100));
  const targetSuccessRate = targetKeys.length ? Math.round((successfulTargets / targetKeys.length) * 100) : successRate;
  const effectiveSuccessRate = gameType === "weight_shift_trainer" || gameUsesHands(gameType) ? targetSuccessRate : successRate;
  const score = gameType === "stability_challenge"
    ? Math.round(stability * 0.34 + successRate * 0.3 + smoothness * 0.22 + accuracy * 0.14)
    : gameUsesHands(gameType)
      ? Math.round(effectiveSuccessRate * 0.35 + accuracy * 0.26 + smoothness * 0.18 + clamp(100 - (reactionTimes.length ? average(reactionTimes) : 900) / 12, 0, 100) * 0.21)
      : Math.round(effectiveSuccessRate * 0.3 + accuracy * 0.25 + stability * 0.2 + smoothness * 0.16 + completionRate * 0.09);
  return {
    accuracy: round1(accuracy),
    stability: round1(stability),
    smoothness: round1(smoothness),
    successRate: effectiveSuccessRate,
    completionRate,
    reactionTimeMs: reactionTimes.length ? Math.round(average(reactionTimes)) : null,
    pathError: round2(meanError),
    pathLength: round2(pathLength),
    score,
    exits,
    successfulTargets,
    missedTargets,
    targetsHit: successfulTargets,
    targetsMissed: missedTargets,
    touches: samples.filter((sample) => sample.touched).length,
    trackingQuality: trackingValues.length ? round1(average(trackingValues)) : null,
  };
}

function buildMotionSessionFromSamples(session, samples, acquisitionMode = "webcam_mediapipe") {
  const summary = summarizeMotionSamples(samples, session.durationSeconds, session.durationSeconds, session.gameType);
  const sampleTimes = samples.map((sample) => Number(sample.t)).filter(Number.isFinite);
  const trackingTimeEffective = sampleTimes.length ? round2(Math.max(...sampleTimes)) : 0;
  return {
    ...session,
    ...summary,
    acquisitionMode,
    trackingTimeEffective,
    tracking_time_effective: trackingTimeEffective,
    live: false,
    createdAt: session.createdAt ?? new Date().toISOString(),
    date: session.date ?? new Date().toLocaleString(),
    notes: "Full-body MediaPipe-controlled rehabilitation exercise. Estimated support indicators, not diagnostic measurements.",
    duration: session.durationSeconds,
    samples: samples.map((sample) => ({
      ...sample,
      t: round2(sample.t),
      targetX: round2(sample.targetX),
      targetY: round2(sample.targetY),
      markerX: round2(sample.markerX),
      markerY: round2(sample.markerY),
      ap: round2(sample.ap),
      ml: round2(sample.ml),
      error: round2(sample.error),
    })),
  };
}

function feedbackForGame(gameType, success, control, targetInfo) {
  if (gameType === "squat_trainer") return success ? "Good squat depth" : "Lower slowly and keep knees controlled";
  if (gameType === "single_leg_balance") return control.singleLeg ? "Hold steady on one leg" : "Lift one foot to begin the hold";
  if (gameType === "obstacle_avoidance") return success ? "Clear path" : "Shift away from the red obstacle";
  if (gameUsesHands(gameType)) return success ? "Target reached" : targetInfo.instruction;
  return success ? "Inside target zone" : targetInfo.instruction;
}

function reactionTimeForTarget(samples, key, elapsed, startedAt = null) {
  const targetSamples = samples.filter((sample) => sample.targetKey === key);
  if (targetSamples.some((sample) => sample.inTarget)) return null;
  const first = targetSamples[0]?.targetStartedAt ?? targetSamples[0]?.t ?? startedAt ?? elapsed;
  return Math.round((elapsed - first) * 1000);
}

function gameUsesHands(gameType) {
  return gameType === "balloon_pop" || gameType === "reach_touch";
}

function toPercentPoint(point) {
  return { x: 50 + clamp(point?.x ?? 0, -1, 1) * 38, y: 50 - clamp(point?.y ?? 0, -1, 1) * 38 };
}

function landmarkToGamePoint(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return { x: clamp((point.x - 0.5) * 2.1, -1, 1), y: clamp((0.5 - point.y) * 2.1, -1, 1) };
}

function chooseBestHand(leftHand, rightHand, previousSample) {
  if (leftHand && rightHand && previousSample?.targetX != null && previousSample?.targetY != null) {
    const target = { x: previousSample.targetX, y: previousSample.targetY };
    return Math.hypot(leftHand.x - target.x, leftHand.y - target.y) < Math.hypot(rightHand.x - target.x, rightHand.y - target.y)
      ? { point: leftHand, side: "left" }
      : { point: rightHand, side: "right" };
  }
  if (leftHand) return { point: leftHand, side: "left" };
  if (rightHand) return { point: rightHand, side: "right" };
  return { point: null, side: null };
}

function isFootLifted(leftAnkle, rightAnkle, leftFoot, rightFoot) {
  if (!leftAnkle || !rightAnkle) return false;
  const ankleLift = Math.abs(leftAnkle.y - rightAnkle.y) > 0.045;
  const footLift = leftFoot && rightFoot ? Math.abs(leftFoot.y - rightFoot.y) > 0.045 : false;
  return ankleLift || footLift;
}

function jointAngle(a, b, c) {
  if (![a, b, c].every(Boolean)) return null;
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  if (!mag) return null;
  return Math.acos(clamp(dot / mag, -1, 1)) * (180 / Math.PI);
}

function midpointSafe(a, b) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function computeMarkerPath(samples) {
  let path = 0;
  for (let index = 1; index < samples.length; index += 1) {
    path += Math.hypot(samples[index].markerX - samples[index - 1].markerX, samples[index].markerY - samples[index - 1].markerY);
  }
  return path;
}

function swaySpread(samples) {
  const xs = samples.map((sample) => Number(sample.markerX)).filter(Number.isFinite);
  const ys = samples.map((sample) => Number(sample.markerY)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return 0;
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

function jerkScore(samples) {
  if (samples.length < 3) return 0;
  let jerk = 0;
  for (let index = 2; index < samples.length; index += 1) {
    const dx1 = samples[index - 1].markerX - samples[index - 2].markerX;
    const dy1 = samples[index - 1].markerY - samples[index - 2].markerY;
    const dx2 = samples[index].markerX - samples[index - 1].markerX;
    const dy2 = samples[index].markerY - samples[index - 1].markerY;
    jerk += Math.hypot(dx2 - dx1, dy2 - dy1);
  }
  return jerk / samples.length;
}

function countSquatReps(samples) {
  let reps = 0;
  let wasDown = false;
  samples.forEach((sample) => {
    const down = Number(sample.squatDepth) > 0.38;
    if (down && !wasDown) reps += 1;
    wasDown = down;
  });
  return reps;
}

// ─── Simulation engine ────────────────────────────────────────────────────────

function simulateGameSession({ patient, latestAssessment, gameType, difficulty, durationSeconds }) {
  const scoreBase = Number(latestAssessment?.totalScore ?? patient.latestScore ?? 74);
  const difficultyPenalty = difficulty === "advanced" ? 9 : difficulty === "standard" ? 4 : 0;
  const control = Math.max(35, Math.min(96, scoreBase - difficultyPenalty + 6));
  const samples = buildGameSamples(gameType, durationSeconds, control);
  const errors = samples.map((s) => s.error);
  const inTarget = samples.filter((s) => s.inTarget).length;
  const pathLength = samples.slice(1).reduce((sum, s, i) => {
    const prev = samples[i];
    return sum + Math.hypot(s.markerX - prev.markerX, s.markerY - prev.markerY);
  }, 0);
  const accuracy = clamp(100 - average(errors) * 35, 25, 98);
  const stability = clamp(100 - pathLength * 3.5, 25, 98);
  const smoothness = clamp(100 - pathLength * 2.4 - Math.max(0, 80 - control) * 0.35, 25, 98);
  const completionRate = Math.round((inTarget / samples.length) * 100);
  const reactionTimeMs = Math.round(420 + (100 - control) * 8 + (difficulty === "advanced" ? 120 : 0));
  const score = Math.round(accuracy * 0.34 + stability * 0.28 + smoothness * 0.22 + completionRate * 0.16);

  return {
    patientId: patient.id,
    gameType,
    acquisitionMode: "demo",
    difficulty,
    durationSeconds,
    score,
    accuracy: round1(accuracy),
    stability: round1(stability),
    smoothness: round1(smoothness),
    reactionTimeMs,
    pathError: round1(average(errors)),
    completionRate,
    level: difficulty === "advanced" ? 3 : difficulty === "standard" ? 2 : 1,
    clinicalFocus: gameType,
    createdAt: new Date().toISOString(),
    date: new Date().toLocaleString(),
    samples,
  };
}

function buildGameSamples(gameType, durationSeconds, control) {
  const count = Math.max(24, Math.min(90, durationSeconds));
  const instability = (100 - control) / 100;
  return Array.from({ length: count }, (_, index) => {
    const t = index / Math.max(1, count - 1);
    const target = targetForGame(gameType, t, index);
    const lag = 0.08 + instability * 0.18;
    const markerX = target.x * (1 - lag) + Math.sin(index * 0.43) * instability * 0.55 + Math.sin(index * 0.11) * 0.05;
    const markerY = target.y * (1 - lag) + Math.cos(index * 0.37) * instability * 0.55 + Math.cos(index * 0.09) * 0.05;
    const error = Math.hypot(markerX - target.x, markerY - target.y);
    return {
      t: index,
      targetX: round2(target.x),
      targetY: round2(target.y),
      markerX: round2(markerX),
      markerY: round2(markerY),
      ap: round2(markerY * 10),
      ml: round2(markerX * 10),
      error: round2(error),
      inTarget: error < (gameType === "stability_challenge" ? 0.34 : 0.28),
    };
  });
}

function targetForGame(gameType, t, index) {
  if (gameType === "stability_challenge") return { x: 0, y: 0 };
  if (gameType === "weight_shift_trainer") {
    const targets = [{ x: -0.65, y: 0 }, { x: 0.65, y: 0 }, { x: 0, y: 0.65 }, { x: 0, y: -0.65 }];
    return targets[Math.floor(index / 8) % targets.length];
  }
  if (gameType === "balance_maze") {
    return { x: -0.72 + t * 1.42, y: Math.sin(t * Math.PI * 3) * 0.52 };
  }
  return { x: Math.sin(t * Math.PI * 2) * 0.72, y: Math.sin(t * Math.PI * 4) * 0.45 };
}

// ─── Clinical logic ───────────────────────────────────────────────────────────

function buildGuidedProgram(latestAssessment, copy) {
  if (!latestAssessment) {
    return [
      { gameType: "stability_challenge", reason: copy.reasons.baseline, priority: "medium", difficulty: "intro" },
      { gameType: "weight_shift_trainer", reason: copy.reasons.transferIntro, priority: "medium", difficulty: "intro" },
      { gameType: "reach_touch", reason: copy.reasons.coordinatedReach, priority: "medium", difficulty: "intro" },
    ];
  }
  const results = latestAssessment.results ?? {};
  const score = Number(latestAssessment.totalScore ?? results.totalBalanceScore ?? 75);
  const asymmetry = Math.max(Number(results.shoulderAsymmetry ?? 0), Number(results.hipAsymmetry ?? 0));
  const posturalControl = Number(results.posturalControlScore ?? results.postureStabilityScore ?? score);
  return [
    {
      gameType: "stability_challenge",
      reason: posturalControl < 80 ? copy.reasons.improveStatic : copy.reasons.consolidateStatic,
      priority: posturalControl < 70 ? "high" : "medium",
      difficulty: score < 72 ? "intro" : "standard",
    },
    {
      gameType: "weight_shift_trainer",
      reason: copy.reasons.improveTransfer,
      priority: "high",
      difficulty: score < 65 ? "intro" : "standard",
    },
    {
      gameType: asymmetry > 5 ? "reach_touch" : "path_following",
      reason: asymmetry > 5 ? copy.reasons.improveCoordination : copy.reasons.improveTrajectory,
      priority: asymmetry > 5 ? "high" : "medium",
      difficulty: "standard",
    },
  ];
}

function buildAssessmentProfile(latestAssessment, patient, copy) {
  const results = latestAssessment?.results ?? {};
  const score = Number(latestAssessment?.totalScore ?? results.totalBalanceScore ?? patient?.latestScore);
  const ap = Number(results.meanSwayAp ?? results.estimatedBodySway ?? 0);
  const ml = Number(results.meanSwayMl ?? results.bodyCenterDeviation ?? 0);
  const posture = Number(results.posturalControlScore ?? results.postureStabilityScore ?? score);
  const asymmetry = Math.max(Number(results.shoulderAsymmetry ?? 0), Number(results.hipAsymmetry ?? 0));
  const findings = [
    ap > 4 || !latestAssessment ? copy.deficits.ap : copy.findings.apControlled,
    posture < 80 || !Number.isFinite(posture) ? copy.deficits.posture : copy.findings.endurance,
    asymmetry > 5 ? copy.findings.moderateAsymmetry : copy.deficits.asymmetry,
  ];
  const riskLevel = !Number.isFinite(score) ? copy.findings.notAssessed : score < 65 ? copy.riskLabels.high : score < 80 ? copy.riskLabels.moderate : copy.riskLabels.low;
  const riskColor = !Number.isFinite(score) ? "#577590" : score < 65 ? "#F94144" : score < 80 ? "#F8961E" : "#43AA8B";
  const mainDeficit = posture < 70 ? copy.findings.posturalControl : ap >= ml ? copy.findings.apStability : asymmetry > 5 ? copy.findings.symmetryReach : copy.findings.directionalControl;
  const recommendedGame = posture < 70 ? "stability_challenge" : asymmetry > 5 ? "reach_touch" : "weight_shift_trainer";
  return { findings, riskLevel, riskColor, mainDeficit, recommendedGame };
}

function difficultyLabel(value, copy) {
  return copy.difficultyLabels[value] ?? copy.difficultyLabels.standard;
}

function buildGameSuggestions(latestAssessment, copy) {
  if (!latestAssessment) {
    return [{ gameType: "stability_challenge", reason: copy.reasons.baseline, priority: "medium", difficulty: "intro" }];
  }
  const results = latestAssessment.results ?? {};
  const suggestions = [];
  if (Number(results.meanSwayMl ?? results.bodyCenterDeviation ?? 0) > 9)
    suggestions.push({ gameType: "weight_shift_trainer", reason: copy.reasons.elevatedLateral, priority: "high", difficulty: "standard" });
  if (Number(results.pathLength ?? results.maxResultantSway ?? 0) > 16)
    suggestions.push({ gameType: "path_following", reason: copy.reasons.irregularPath, priority: "high", difficulty: "standard" });
  if (Number(latestAssessment.totalScore ?? results.totalBalanceScore ?? 100) < 72)
    suggestions.push({ gameType: "stability_challenge", reason: copy.reasons.lowScore, priority: "high", difficulty: "intro" });
  suggestions.push({ gameType: "balance_maze", reason: copy.reasons.progressCoordination, priority: "medium", difficulty: "standard" });
  return suggestions.slice(0, 4);
}

function buildRehabAnalytics(sessions) {
  const scores = sessions.map((s) => Number(s.score)).filter(Number.isFinite);
  const accuracies = sessions.map((s) => Number(s.accuracy)).filter(Number.isFinite);
  const stabilities = sessions.map((s) => Number(s.stability)).filter(Number.isFinite);
  const sorted = sessions.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const counts = sessions.reduce((map, s) => ({ ...map, [s.gameType]: (map[s.gameType] ?? 0) + 1 }), {});
  const most = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const lastSession = sessions.slice().sort((a, b) => new Date(b.createdAt ?? b.date) - new Date(a.createdAt ?? a.date))[0];
  return {
    count: sessions.length,
    averageScore: average(scores),
    averageAccuracy: average(accuracies),
    averageStability: average(stabilities),
    scoreChange: sorted.length > 1 ? round1(Number(sorted.at(-1).score) - Number(sorted[0].score)) : null,
    mostTrainedGame: most ?? null,
    lastSessionDate: lastSession ? formatDate(lastSession.createdAt ?? lastSession.date) : null,
  };
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function formatValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : "—";
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(getDateLocale(), { month: "short", day: "numeric", year: "numeric" });
}
