import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Gamepad2, Play } from "lucide-react";

import { BalanceFreezeGame } from "../games/BalanceFreezeGame.jsx";
import { BalloonPopGame } from "../games/BalloonPopGame.jsx";
import { GameReview } from "../games/GameReview.jsx";
import { WeightShiftGame } from "../games/WeightShiftGame.jsx";

const GAMES = [
  {
    id: "balance_freeze",
    label: "Balance Freeze",
    emoji: "🎯",
    description: "Stay inside the target circle as long as possible. Trains static balance and stillness.",
    color: "#34d399",
    bg: "#064e3b",
    component: BalanceFreezeGame,
  },
  {
    id: "weight_shift",
    label: "Weight Shift Trainer",
    emoji: "⚖️",
    description: "Shift your body weight to reach directional targets. Trains dynamic weight control.",
    color: "#60a5fa",
    bg: "#1e3a5f",
    component: WeightShiftGame,
  },
  {
    id: "balloon_pop",
    label: "Balloon Pop",
    emoji: "🎈",
    description: "Raise your hands to pop balloons before they disappear. Trains arm reach and coordination.",
    color: "#f472b6",
    bg: "#4a0530",
    component: BalloonPopGame,
  },
];

const PLACEHOLDERS = [
  { id: "balance_maze", label: "Balance Maze", emoji: "🌀", description: "Navigate a maze using body lean. Coming soon." },
  { id: "squat_trainer", label: "Squat Trainer", emoji: "🏋️", description: "Guided squats with real-time depth feedback. Coming soon." },
  { id: "single_leg", label: "Single-Leg Balance", emoji: "🦩", description: "Single-leg stability challenge. Coming soon." },
];

const DIFFICULTY_OPTIONS = ["easy", "medium", "hard"];

export function RehabGamesPage({
  patients,
  rehabSessions,
  onSaveRehabSession,
  preselectedPatientId,
  onClearPreselectedPatient,
}) {
  const [view, setView] = useState("home"); // home | game | review
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedPatientId, setSelectedPatientId] = useState(preselectedPatientId ?? null);
  const [difficulty, setDifficulty] = useState("medium");
  const [stream, setStream] = useState(null);
  const [streamError, setStreamError] = useState(null);
  const [results, setResults] = useState(null);
  const [saving, setSaving] = useState(false);
  const streamRef = useRef(null);

  // Ensure camera is released if page is unmounted while a game is active
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Apply pre-selected patient
  useEffect(() => {
    if (preselectedPatientId && !selectedPatientId) {
      setSelectedPatientId(preselectedPatientId);
      onClearPreselectedPatient?.();
    }
  }, [preselectedPatientId]); // eslint-disable-line

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) ?? null;
  const patientSessions = (rehabSessions ?? []).filter((s) => s.patientId === selectedPatientId);

  // Acquire webcam stream before game starts
  async function startGame(game, useDemo = false) {
    setSelectedGame(game);

    if (useDemo) {
      setStream(null);
      setStreamError(null);
      setView("game");
      return;
    }

    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      });
      streamRef.current = s;
      setStream(s);
      setStreamError(null);
      setView("game");
    } catch (err) {
      setStreamError(err.message || "Camera access denied");
      // Fall back to demo automatically
      setStream(null);
      setView("game");
    }
  }

  function handleGameComplete(gameResults) {
    setResults(gameResults);
    setView("review");
    // Stop the camera
    stopStream();
  }

  function handleCancel() {
    stopStream();
    setView("home");
    setSelectedGame(null);
    setResults(null);
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }

  async function handleSave() {
    if (!results) return;
    setSaving(true);
    try {
      await onSaveRehabSession({
        patientId: selectedPatientId,
        ...results,
      });
      setView("home");
      setSelectedGame(null);
      setResults(null);
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setView("home");
    setSelectedGame(null);
    setResults(null);
  }

  // ── Game view ──────────────────────────────────────────────────────────────
  if (view === "game" && selectedGame) {
    const GameComponent = selectedGame.component;
    return (
      <div className="fixed inset-0 z-30 bg-slate-950">
        <div className="h-full w-full">
          <GameComponent
            stream={stream}
            patient={selectedPatient}
            difficulty={difficulty}
            onComplete={handleGameComplete}
            onCancel={handleCancel}
          />
        </div>
        {streamError && (
          <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-amber-900/80 px-4 py-3 text-sm font-semibold text-amber-200">
            Camera unavailable — running in demo mode. {streamError}
          </div>
        )}
      </div>
    );
  }

  // ── Review view ────────────────────────────────────────────────────────────
  if (view === "review" && results) {
    return (
      <div className="fixed inset-0 z-30 bg-slate-950">
        <GameReview
          results={results}
          patient={selectedPatient}
          previousResults={patientSessions}
          onSave={handleSave}
          onDiscard={handleDiscard}
          saving={saving}
        />
      </div>
    );
  }

  // ── Home / game selection ──────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/20 text-violet-400">
            <Gamepad2 size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-rehab-ink">Rehabilitation Games</h1>
            <p className="text-sm text-rehab-muted">Body-controlled games using MediaPipe pose tracking.</p>
          </div>
        </div>
      </section>

      {/* Patient + difficulty selectors */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-rehab-line bg-white p-4 shadow-clinical">
        <div className="flex-1 min-w-40">
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-rehab-muted">Patient</label>
          <div className="relative">
            <select
              value={selectedPatientId ?? ""}
              onChange={(e) => setSelectedPatientId(e.target.value ? Number(e.target.value) : null)}
              className="w-full appearance-none rounded-lg border border-rehab-line bg-white py-2.5 pl-3 pr-8 text-sm font-semibold outline-none focus:border-rehab-teal"
            >
              <option value="">Select patient…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.fullName} ({p.patientCode})</option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-3 text-rehab-muted" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-rehab-muted">Difficulty</label>
          <div className="flex rounded-lg border border-rehab-line overflow-hidden">
            {DIFFICULTY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={`px-4 py-2.5 text-sm font-semibold capitalize transition ${
                  difficulty === d
                    ? "bg-rehab-teal text-white"
                    : "bg-white text-rehab-muted hover:bg-slate-50"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Playable games */}
      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-rehab-muted">Available Games</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {GAMES.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              patientSelected={!!selectedPatientId}
              onStart={(demo) => startGame(game, demo)}
            />
          ))}
        </div>
      </div>

      {/* Placeholder games */}
      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-rehab-muted">Coming Soon</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {PLACEHOLDERS.map((game) => (
            <div key={game.id} className="rounded-xl border border-dashed border-rehab-line bg-slate-50 p-5 opacity-60">
              <span className="text-3xl">{game.emoji}</span>
              <p className="mt-2 font-semibold text-rehab-ink">{game.label}</p>
              <p className="mt-1 text-sm text-rehab-muted">{game.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent game sessions for selected patient */}
      {selectedPatient && patientSessions.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-rehab-muted">
            Recent Sessions — {selectedPatient.fullName}
          </h2>
          <div className="overflow-hidden rounded-xl border border-rehab-line bg-white shadow-clinical">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rehab-line bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-rehab-muted">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Game</th>
                  <th className="px-4 py-3">Difficulty</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Accuracy</th>
                  <th className="px-4 py-3">Mode</th>
                </tr>
              </thead>
              <tbody>
                {patientSessions.slice(0, 10).map((s) => (
                  <tr key={s.id} className="border-b border-rehab-line last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-rehab-muted">{formatDate(s.createdAt)}</td>
                    <td className="px-4 py-3 font-semibold">{GAMES.find((g) => g.id === s.gameType)?.label ?? s.gameType}</td>
                    <td className="px-4 py-3 capitalize text-rehab-muted">{s.difficulty}</td>
                    <td className="px-4 py-3 font-bold">{s.score ?? "-"}</td>
                    <td className="px-4 py-3">{s.accuracy != null ? `${s.accuracy}%` : "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.acquisitionMode === "webcam" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {s.acquisitionMode}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function GameCard({ game, patientSelected, onStart }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-white/10 text-white shadow-lg"
      style={{ background: `linear-gradient(135deg, ${game.bg}, #0f172a)` }}
    >
      <div className="p-6">
        <span className="text-4xl">{game.emoji}</span>
        <h3 className="mt-3 text-xl font-bold">{game.label}</h3>
        <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>{game.description}</p>
      </div>
      <div className="flex gap-2 border-t border-white/10 p-4">
        <button
          type="button"
          onClick={() => onStart(false)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition hover:brightness-110"
          style={{ backgroundColor: game.color }}
        >
          <Play size={15} fill="currentColor" />
          Play (Webcam)
        </button>
        <button
          type="button"
          onClick={() => onStart(true)}
          className="rounded-xl border border-white/20 px-4 py-3 text-xs font-bold text-white/70 transition hover:bg-white/10"
        >
          Demo
        </button>
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}
