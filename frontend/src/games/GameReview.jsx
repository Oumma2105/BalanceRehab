import { CheckCircle, Clock, Target, TrendingUp, Zap } from "lucide-react";

const GAME_LABELS = {
  balance_freeze: "Balance Freeze",
  weight_shift: "Weight Shift Trainer",
  balloon_pop: "Balloon Pop",
};

const SCORE_GRADES = [
  { min: 85, label: "Excellent", color: "#34d399", bg: "#d1fae5" },
  { min: 70, label: "Good",      color: "#60a5fa", bg: "#dbeafe" },
  { min: 55, label: "Fair",      color: "#fbbf24", bg: "#fef3c7" },
  { min: 0,  label: "Keep going", color: "#f87171", bg: "#fee2e2" },
];

export function GameReview({ results, patient, previousResults, onSave, onDiscard, saving }) {
  const grade = SCORE_GRADES.find((g) => results.score >= g.min) ?? SCORE_GRADES[SCORE_GRADES.length - 1];
  const gameLabel = GAME_LABELS[results.gameType] ?? results.gameType;
  const prev = previousResults?.find((r) => r.gameType === results.gameType);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-slate-950 text-white">
      {/* Header */}
      <div className="flex-none px-6 pt-8 pb-4 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-white/50">{gameLabel}</p>
        <div
          className="mx-auto mt-4 flex h-32 w-32 items-center justify-center rounded-full border-4 text-5xl font-black"
          style={{ borderColor: grade.color, color: grade.color, backgroundColor: grade.color + "20" }}
        >
          {results.score}
        </div>
        <p className="mt-3 text-2xl font-bold" style={{ color: grade.color }}>{grade.label}</p>
        {patient && (
          <p className="mt-1 text-sm text-white/50">{patient.fullName} · {results.difficulty} · {results.acquisitionMode}</p>
        )}
      </div>

      {/* Metrics grid */}
      <div className="flex-1 px-6 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            icon={<Target size={18} />}
            label="Accuracy"
            value={`${results.accuracy ?? "-"}%`}
            prev={prev ? `${prev.accuracy}%` : null}
            color="#60a5fa"
          />
          <MetricCard
            icon={<TrendingUp size={18} />}
            label="Stability"
            value={formatRatio(results.stability)}
            prev={prev ? formatRatio(prev.stability) : null}
            color="#34d399"
          />
          <MetricCard
            icon={<Zap size={18} />}
            label="Smoothness"
            value={formatRatio(results.smoothness)}
            prev={prev ? formatRatio(prev.smoothness) : null}
            color="#c084fc"
          />
          <MetricCard
            icon={<Clock size={18} />}
            label="Duration"
            value={`${results.durationSeconds}s`}
            color="#fbbf24"
          />

          {results.reactionTimeMs != null && (
            <MetricCard
              icon={<Zap size={18} />}
              label="Avg Reaction"
              value={`${results.reactionTimeMs} ms`}
              prev={prev?.reactionTimeMs ? `${prev.reactionTimeMs} ms` : null}
              color="#fb923c"
            />
          )}

          {results.successRate != null && (
            <MetricCard
              icon={<CheckCircle size={18} />}
              label="Success Rate"
              value={`${results.successRate}%`}
              prev={prev ? `${prev.successRate}%` : null}
              color="#34d399"
            />
          )}

          {results.exits != null && (
            <MetricCard
              icon={<Target size={18} />}
              label="Exits"
              value={results.exits}
              prev={prev?.exits != null ? prev.exits : null}
              lowerIsBetter
              color="#f87171"
            />
          )}

          {results.targetsHit != null && (
            <MetricCard
              icon={<CheckCircle size={18} />}
              label="Targets Hit"
              value={`${results.targetsHit} / ${(results.targetsHit ?? 0) + (results.targetsMissed ?? 0)}`}
              color="#34d399"
            />
          )}
        </div>

        {/* Comparison with previous session */}
        {prev && (
          <div className="mt-4 rounded-xl bg-white/5 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-white/40">vs Previous Session</p>
            <p className="mt-1 text-sm text-white/70">
              Score: <span className={results.score >= prev.score ? "text-emerald-400" : "text-red-400"}>
                {results.score >= prev.score ? "+" : ""}{results.score - prev.score} pts
              </span>
              {" "}compared to last {gameLabel} session.
            </p>
          </div>
        )}

        {results.acquisitionMode === "demo" && (
          <div className="mt-3 rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-300">
            Demo mode — results are simulated. Connect webcam and use real movement for clinical data.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-none px-6 pb-8 pt-4 flex flex-col gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="w-full rounded-2xl bg-emerald-500 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Session"}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="w-full rounded-2xl bg-white/10 py-4 text-lg font-semibold text-white/70 transition hover:bg-white/20 disabled:opacity-60"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, prev, color, lowerIsBetter = false }) {
  const improved = prev != null && (
    lowerIsBetter
      ? Number(String(value).replace(/[^0-9.]/g, "")) < Number(String(prev).replace(/[^0-9.]/g, ""))
      : Number(String(value).replace(/[^0-9.]/g, "")) > Number(String(prev).replace(/[^0-9.]/g, ""))
  );

  return (
    <div className="rounded-xl bg-white/5 p-4">
      <div className="flex items-center gap-2" style={{ color }}>
        {icon}
        <p className="text-xs font-bold uppercase tracking-wider">{label}</p>
      </div>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      {prev != null && (
        <p className={`mt-1 text-xs font-semibold ${improved ? "text-emerald-400" : "text-red-400"}`}>
          {improved ? "↑" : "↓"} prev: {prev}
        </p>
      )}
    </div>
  );
}

function formatRatio(value) {
  if (value == null) return "-";
  const pct = Math.round(value * 100);
  return `${pct}%`;
}
