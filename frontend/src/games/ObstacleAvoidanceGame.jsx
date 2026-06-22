import { useCallback, useEffect, useRef, useState } from "react";
import { useGamePose } from "./useGamePose";

// ─── Configuration ────────────────────────────────────────────────────────────

const DIFFICULTY = {
  intro:    { baseSpeed: 0.00020, intervalMs: 2800, gapRatio: 0.52, avatarRadiusRatio: 0.065, comboTarget: 30 },
  standard: { baseSpeed: 0.00028, intervalMs: 2100, gapRatio: 0.42, avatarRadiusRatio: 0.055, comboTarget: 20 },
  advanced: { baseSpeed: 0.00038, intervalMs: 1500, gapRatio: 0.35, avatarRadiusRatio: 0.045, comboTarget: 15 },
};

// [minAvoided, speedMult, maxSimultaneous]
const LEVELS = [
  { min: 0,  speed: 1.0,  max: 1 },
  { min: 6,  speed: 1.30, max: 1 },
  { min: 14, speed: 1.60, max: 2 },
  { min: 26, speed: 1.90, max: 2 },
  { min: 40, speed: 2.25, max: 3 },
];

const OBS_COLORS = ["#F94144", "#F8961E", "#577590", "#4361EE", "#E63946"];
const TEAL = "#43AA8B";
const RED  = "#F94144";
const YEL  = "#F9C74F";

function parseRgb(hex) {
  return `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ObstacleAvoidanceGame({
  stream,
  patient,
  difficulty = "standard",
  durationSeconds = 60,
  onComplete,
  onCancel,
}) {
  const cfg = DIFFICULTY[difficulty] ?? DIFFICULTY.standard;

  const canvasRef = useRef(null);
  const animRef   = useRef(null);

  const stateRef = useRef({
    phase: "waiting",
    countdown: 3,
    cdStartTs: 0,
    gameStartTs: 0,
    lastTs: 0,
    timeLeft: durationSeconds,

    cursorX: 0.5,
    targetX: 0.5,
    tracking: false,
    demoAngle: 0,

    obstacles: [],
    nextObsTs: 0,
    obsCounter: 0,

    score: 0,
    combo: 0,
    maxCombo: 0,
    avoided: 0,
    hits: 0,
    spawned: 0,
    levelIdx: 0,

    particles: [],
    trail: [],
    feedbackText: "",
    feedbackTs: 0,
    shakeUntil: 0,

    samples: [],
    lastSampleTs: 0,
  });

  const [uiPhase,    setUiPhase]    = useState("waiting");
  const [uiCountdown, setUiCountdown] = useState(3);
  const [uiScore,    setUiScore]    = useState(0);
  const [uiCombo,    setUiCombo]    = useState(0);
  const [uiLevel,    setUiLevel]    = useState(1);
  const [uiTimeLeft, setUiTimeLeft] = useState(durationSeconds);
  const [uiTracking, setUiTracking] = useState(false);
  const [uiAvoided,  setUiAvoided]  = useState(0);
  const [uiHits,     setUiHits]     = useState(0);

  const endGameRef = useRef(null);

  // MediaPipe tracking
  const { videoRef } = useGamePose({
    stream,
    onFrame: useCallback((frame) => {
      if (!frame) return;
      const s = stateRef.current;
      s.targetX = frame.bodyCenterX ?? 0.5;
      if (!s.tracking) { s.tracking = true; setUiTracking(true); }
    }, []),
  });

  // ─── End game ──────────────────────────────────────────────────────────────

  const endGame = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === "finished") return;
    s.phase = "finished";
    setUiPhase("finished");

    const total = s.avoided + s.hits;
    const successRate = total > 0 ? (s.avoided / total) * 100 : 0;
    const comboBonus  = Math.min(20, (s.maxCombo / cfg.comboTarget) * 20);
    const finalScore  = Math.min(100, Math.round(successRate * 0.8 + comboBonus));
    const stability   = Math.min(100, Math.max(0, Math.round(100 - s.hits * 9)));
    const smoothness  = Math.min(100, Math.round((s.maxCombo / Math.max(1, s.spawned)) * 80 + 20));
    const elapsed     = s.gameStartTs > 0 ? (performance.now() - s.gameStartTs) / 1000 : durationSeconds;

    onComplete({
      patientId: patient?.id ?? null,
      gameType: "obstacle_avoidance",
      difficulty,
      durationSeconds: Math.round(elapsed),
      acquisitionMode: stream ? "webcam" : "demo",
      score: finalScore,
      rawScore: s.score,
      accuracy: Math.round(successRate),
      stability,
      smoothness,
      successRate: Math.round(successRate),
      completionRate: Math.round(Math.min(100, (elapsed / durationSeconds) * 100)),
      reactionTimeMs: null,
      pathError: null,
      targetsHit: s.avoided,
      targetsMissed: s.hits,
      maxCombo: s.maxCombo,
      levelsReached: s.levelIdx + 1,
      createdAt: new Date().toISOString(),
      date: new Date().toLocaleString(),
      notes: "Obstacle avoidance — full-body lateral weight-shifting exercise.",
      samples: s.samples,
      live: false,
    });
  }, [cfg.comboTarget, difficulty, durationSeconds, onComplete, patient, stream]);

  useEffect(() => { endGameRef.current = endGame; }, [endGame]);

  // ─── Start countdown ───────────────────────────────────────────────────────

  const startGame = useCallback(() => {
    const s = stateRef.current;
    s.phase = "countdown";
    s.countdown = 3;
    s.cdStartTs = performance.now();
    setUiPhase("countdown");
    setUiCountdown(3);
  }, []);

  // ─── Render loop ───────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Helpers defined inside effect (no stale closure on React state) ─────

    function getLevelIdx(avoided) {
      let idx = 0;
      for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (avoided >= LEVELS[i].min) { idx = i; break; }
      }
      return idx;
    }

    function spawn(s, W, H, ts, lvl) {
      const gapW = W * (cfg.gapRatio - lvl * 0.012);
      const maxLeft = W * 0.92 - gapW;
      const gapX = W * 0.08 + Math.random() * (maxLeft - W * 0.08);
      const h = Math.max(14, H * 0.042);
      s.obstacles.push({
        id: ++s.obsCounter,
        y: -h,
        gapX,
        gapW,
        h,
        speed: cfg.baseSpeed * (LEVELS[getLevelIdx(s.avoided)]?.speed ?? 1),
        color: OBS_COLORS[s.spawned % OBS_COLORS.length],
        counted: false,
        gapCx: gapX + gapW / 2,
      });
      s.spawned++;
    }

    function burst(s, x, y, color, count, ts) {
      const rgb = parseRgb(color);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const spd = 1.8 + Math.random() * 3;
        s.particles.push({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - 1.8,
          r: 2.5 + Math.random() * 4,
          rgb,
          born: ts,
          life: 480 + Math.random() * 420,
        });
      }
    }

    function drawAvatar(ctx, x, y, r, color) {
      // glow halo
      const gr = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.1);
      gr.addColorStop(0, `${color}55`);
      gr.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(x, y, r * 2.1, 0, Math.PI * 2);
      ctx.fillStyle = gr;
      ctx.fill();
      // body
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
      // center dot
      ctx.beginPath();
      ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fill();
    }

    function drawObstacle(ctx, obs, W) {
      const { y, gapX, gapW, h, color } = obs;
      ctx.fillStyle = color;
      if (gapX > 0)          ctx.fillRect(0, y, gapX, h);
      if (gapX + gapW < W)   ctx.fillRect(gapX + gapW, y, W - gapX - gapW, h);
      // gap guides
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(gapX, y, gapW, 2);
      ctx.fillRect(gapX, y + h - 2, gapW, 2);
      // inner shadow on wall edges
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      if (gapX > 5)           ctx.fillRect(gapX - 5, y, 5, h);
      if (gapX + gapW < W - 5) ctx.fillRect(gapX + gapW, y, 5, h);
    }

    function tick(ts) {
      animRef.current = requestAnimationFrame(tick);
      const s = stateRef.current;

      // Resize canvas to display size
      const W = canvas.clientWidth  || 600;
      const H = canvas.clientHeight || 400;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width  = W;
        canvas.height = H;
      }
      const ctx = canvas.getContext("2d");

      // Demo cursor simulation — runs whenever real tracking hasn't arrived yet
      if (!s.tracking) {
        s.demoAngle += 0.016;
        s.targetX = 0.5 + Math.sin(s.demoAngle) * 0.30 + Math.sin(s.demoAngle * 2.7) * 0.06;
      }

      // Smooth cursor
      s.cursorX += (s.targetX - s.cursorX) * 0.20;

      // Background
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, W, H);

      // Subtle grid
      ctx.strokeStyle = "rgba(255,255,255,0.025)";
      ctx.lineWidth = 1;
      const gridCols = 5;
      const gridRows = 7;
      for (let col = 1; col < gridCols; col++) {
        const gx = (W / gridCols) * col;
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (let row = 1; row < gridRows; row++) {
        const gy = (H / gridRows) * row;
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }

      const avatarR = W * cfg.avatarRadiusRatio;
      const avatarX = s.cursorX * W;
      const avatarY = H * 0.82;

      // ── WAITING ──────────────────────────────────────────────────────────
      if (s.phase === "waiting") {
        // Decorative obstacles
        ctx.fillStyle = "rgba(249,65,68,0.18)";
        ctx.fillRect(0, H * 0.28, W * 0.36, H * 0.045);
        ctx.fillRect(W * 0.64, H * 0.28, W * 0.36, H * 0.045);
        ctx.fillStyle = "rgba(248,150,30,0.18)";
        ctx.fillRect(0, H * 0.48, W * 0.28, H * 0.045);
        ctx.fillRect(W * 0.54, H * 0.48, W * 0.46, H * 0.045);
        drawAvatar(ctx, avatarX, avatarY, avatarR, TEAL);
        return;
      }

      // ── COUNTDOWN ────────────────────────────────────────────────────────
      if (s.phase === "countdown") {
        const elapsed = (ts - s.cdStartTs) / 1000;
        const cd = 3 - Math.floor(elapsed);
        if (cd !== s.countdown) {
          s.countdown = cd;
          setUiCountdown(Math.max(0, cd));
        }
        if (cd < 0) {
          s.phase = "playing";
          s.lastTs = ts;
          s.gameStartTs = ts;
          s.nextObsTs = ts + 900;
          setUiPhase("playing");
        }
        drawAvatar(ctx, avatarX, avatarY, avatarR, TEAL);
        return;
      }

      // ── FINISHED ─────────────────────────────────────────────────────────
      if (s.phase === "finished") {
        ctx.font = `bold ${Math.round(W * 0.048)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = TEAL;
        ctx.fillText("Session Complete!", W / 2, H / 2);
        return;
      }

      // ── PLAYING ──────────────────────────────────────────────────────────
      const dt = Math.min(ts - s.lastTs, 80); // ms, capped to avoid jumps
      s.lastTs = ts;

      // Countdown down
      s.timeLeft -= dt / 1000;
      if (s.timeLeft <= 0) {
        s.timeLeft = 0;
        endGameRef.current?.();
        return;
      }
      setUiTimeLeft(Math.ceil(s.timeLeft));

      // Level up
      const newLvlIdx = getLevelIdx(s.avoided);
      if (newLvlIdx !== s.levelIdx) {
        s.levelIdx = newLvlIdx;
        s.feedbackText = `LEVEL ${newLvlIdx + 1}!`;
        s.feedbackTs = ts;
        setUiLevel(newLvlIdx + 1);
      }
      const lvl = LEVELS[s.levelIdx] ?? LEVELS[LEVELS.length - 1];

      // Spawn
      if (ts >= s.nextObsTs && s.obstacles.length < lvl.max) {
        spawn(s, W, H, ts, s.levelIdx);
        s.nextObsTs = ts + cfg.intervalMs / lvl.speed;
      }

      // Move obstacles
      for (const obs of s.obstacles) {
        obs.y += W * obs.speed * dt;
      }

      // Collision / scoring
      for (const obs of s.obstacles) {
        if (obs.counted) continue;
        if (obs.y + obs.h >= avatarY - avatarR && obs.y <= avatarY + avatarR) {
          obs.counted = true;
          const inGap = avatarX > obs.gapX && avatarX < obs.gapX + obs.gapW;
          if (inGap) {
            s.combo++;
            s.maxCombo = Math.max(s.maxCombo, s.combo);
            const mult = s.combo >= 20 ? 4 : s.combo >= 10 ? 3 : s.combo >= 5 ? 2 : 1;
            const pts  = 10 * mult;
            s.score += pts;
            s.avoided++;
            s.feedbackText = s.combo >= 5 ? `×${mult} COMBO! +${pts}` : `+${pts}`;
            s.feedbackTs = ts;
            burst(s, avatarX, avatarY, TEAL, 8, ts);
            setUiScore(s.score);
            setUiCombo(s.combo);
            setUiAvoided(s.avoided);
          } else {
            s.combo = 0;
            s.hits++;
            s.shakeUntil = ts + 420;
            s.feedbackText = "HIT!";
            s.feedbackTs = ts;
            burst(s, avatarX, avatarY, RED, 14, ts);
            setUiCombo(0);
            setUiHits(s.hits);
          }
        }
      }

      // Remove off-screen obstacles
      s.obstacles = s.obstacles.filter((obs) => obs.y < H + 30);

      // Record sample every ~200ms
      if (ts - s.lastSampleTs > 200 && s.gameStartTs > 0) {
        const nearestObs = s.obstacles[0];
        s.samples.push({
          t: (ts - s.gameStartTs) / 1000,
          markerX: (s.cursorX - 0.5) * 2,
          markerY: 0,
          targetX: nearestObs ? ((nearestObs.gapCx / W) - 0.5) * 2 : 0,
          targetY: 0,
          inTarget: false,
          gameType: "obstacle_avoidance",
        });
        s.lastSampleTs = ts;
      }

      // Update trail
      s.trail.push({ x: avatarX, y: avatarY, ts });
      if (s.trail.length > 22) s.trail.shift();

      // Update particles
      s.particles = s.particles.filter((p) => ts - p.born < p.life);

      // Screen shake offset
      let shakeX = 0;
      let shakeY = 0;
      if (ts < s.shakeUntil) {
        const intensity = ((s.shakeUntil - ts) / 420) * 7;
        shakeX = (Math.random() - 0.5) * intensity;
        shakeY = (Math.random() - 0.5) * intensity;
      }

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // Timer bar
      const timerFrac = s.timeLeft / durationSeconds;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, W, 6);
      ctx.fillStyle = timerFrac > 0.3 ? TEAL : RED;
      ctx.fillRect(0, 0, W * timerFrac, 6);

      // Obstacles
      for (const obs of s.obstacles) drawObstacle(ctx, obs, W);

      // Trail
      for (let i = 0; i < s.trail.length; i++) {
        const tp = s.trail[i];
        const a  = (i / s.trail.length) * 0.32;
        const r  = avatarR * (0.25 + (i / s.trail.length) * 0.55);
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(67,170,139,${a.toFixed(2)})`;
        ctx.fill();
      }

      // Avatar
      const isHit = ts < s.shakeUntil;
      drawAvatar(ctx, avatarX, avatarY, avatarR, isHit ? RED : TEAL);

      // Particles
      for (const p of s.particles) {
        const age = (ts - p.born) / p.life;
        const a   = (1 - age).toFixed(2);
        const dt2 = (ts - p.born) / 40;
        const px  = p.x + p.vx * dt2;
        const py  = p.y + p.vy * dt2 + 0.025 * dt2 * dt2;
        ctx.beginPath();
        ctx.arc(px, py, p.r * (1 - age * 0.55), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.rgb},${a})`;
        ctx.fill();
      }

      // Feedback text
      if (s.feedbackText && ts - s.feedbackTs < 900) {
        const age = (ts - s.feedbackTs) / 900;
        ctx.save();
        ctx.globalAlpha = 1 - age;
        ctx.font = `bold ${Math.round(W * 0.036)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = YEL;
        ctx.shadowColor = YEL;
        ctx.shadowBlur = 10;
        ctx.fillText(s.feedbackText, W / 2, H * 0.42 - age * 38);
        ctx.restore();
      }

      // Combo badge (canvas-level, large combos only)
      if (s.combo >= 5) {
        const combColor = s.combo >= 20 ? RED : s.combo >= 10 ? "#F8961E" : YEL;
        ctx.font = `bold ${Math.round(W * 0.028)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.fillStyle = combColor;
        ctx.shadowColor = combColor;
        ctx.shadowBlur = 6;
        ctx.fillText(`×${s.combo}`, W * 0.025, H * 0.06);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    }

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex h-full w-full overflow-hidden" style={{ background: "#0f172a" }}>
      {/* Mirrored video feed */}
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover opacity-[0.13]"
          style={{ transform: "scaleX(-1)" }}
        />
      )}

      {/* Game canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* ── Waiting overlay ────────────────────────────────────────────────── */}
      {uiPhase === "waiting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-7 bg-slate-950/75 px-6">
          <div className="text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-teal-400">Rehabilitation Game</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Obstacle Avoidance</h2>
            <p className="mt-2 text-slate-400">Shift your body weight to navigate through the gaps</p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-white/10 px-4 py-3">
              <div className="text-2xl font-bold text-teal-400">⇐⇒</div>
              <div className="mt-1 text-xs font-semibold text-slate-300">Shift Weight</div>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3">
              <div className="text-2xl font-bold" style={{ color: YEL }}>△</div>
              <div className="mt-1 text-xs font-semibold text-slate-300">Find the Gap</div>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3">
              <div className="text-2xl font-bold" style={{ color: "#F8961E" }}>×5</div>
              <div className="mt-1 text-xs font-semibold text-slate-300">Build Combo</div>
            </div>
          </div>

          {!stream && (
            <p className="rounded-full bg-amber-900/50 px-4 py-1.5 text-xs font-semibold text-amber-300">
              Demo Mode — No webcam connected
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={startGame}
              className="rounded-xl bg-[#43AA8B] px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-[#3b9a7e] active:scale-95"
            >
              ▶ Start Game
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-white/20 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white/40"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Countdown overlay ──────────────────────────────────────────────── */}
      {uiPhase === "countdown" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-2xl bg-white/94 px-16 py-10 text-center shadow-2xl">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Get Ready</p>
            <p
              className="mt-2 text-8xl font-bold leading-none"
              style={{ color: uiCountdown > 0 ? YEL : TEAL }}
            >
              {uiCountdown > 0 ? uiCountdown : "GO!"}
            </p>
            <p className="mt-3 text-sm font-semibold text-slate-500">Stand in view — shift left and right</p>
          </div>
        </div>
      )}

      {/* ── Playing HUD ────────────────────────────────────────────────────── */}
      {uiPhase === "playing" && (
        <>
          {/* Right metrics panel */}
          <div className="absolute right-3 top-10 flex flex-col items-end gap-2 text-right">
            <div className="rounded-xl bg-black/65 px-4 py-2 backdrop-blur-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Score</div>
              <div className="text-2xl font-bold tabular-nums text-white">{uiScore}</div>
            </div>

            {uiCombo > 0 && (
              <div className="rounded-xl bg-yellow-500/20 px-4 py-2 backdrop-blur-sm ring-1 ring-yellow-400/30">
                <div className="text-[10px] font-bold uppercase tracking-wider text-yellow-400">Combo</div>
                <div className="text-xl font-bold text-yellow-300">×{uiCombo}</div>
              </div>
            )}

            <div className="rounded-xl bg-black/65 px-3 py-1.5 backdrop-blur-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-teal-400">
                Level {uiLevel}
              </div>
            </div>

            <div className="rounded-xl bg-black/65 px-3 py-1.5 backdrop-blur-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Time</div>
              <div
                className="text-xl font-bold tabular-nums"
                style={{ color: uiTimeLeft <= 10 ? RED : "white" }}
              >
                {uiTimeLeft}s
              </div>
            </div>

            <button
              type="button"
              onClick={() => endGameRef.current?.()}
              className="mt-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              End
            </button>
          </div>

          {/* Bottom center stats */}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-3">
            <div className="rounded-lg bg-black/65 px-4 py-1.5 text-center backdrop-blur-sm">
              <div className="text-[10px] text-slate-400">Avoided</div>
              <div className="text-sm font-bold text-teal-300">{uiAvoided}</div>
            </div>
            <div className="rounded-lg bg-black/65 px-4 py-1.5 text-center backdrop-blur-sm">
              <div className="text-[10px] text-slate-400">Hits</div>
              <div className="text-sm font-bold text-red-400">{uiHits}</div>
            </div>
          </div>

          {/* Tracking indicator */}
          <div className="absolute bottom-4 left-3">
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                uiTracking
                  ? "bg-teal-500/20 text-teal-300"
                  : "bg-amber-500/20 text-amber-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  uiTracking ? "animate-pulse bg-teal-400" : "bg-amber-400"
                }`}
              />
              {uiTracking ? (stream ? "Tracking Active" : "Demo") : "Searching…"}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
