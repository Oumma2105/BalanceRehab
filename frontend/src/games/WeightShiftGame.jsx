import { useCallback, useEffect, useRef, useState } from "react";
import { useGamePose } from "./useGamePose.js";

const DIRECTIONS = ["left", "right", "forward", "backward"];
const CALIBRATION_FRAMES = 40;
const TARGET_HOLD_MS = 800;   // must hold in zone for this long to count
const TARGET_TIMEOUT_MS = 4000; // miss if not reached in time
const SHIFT_THRESHOLD = 0.06; // normalized units to count as shifted

const DIFFICULTY_CONFIG = {
  easy: { targets: 8, threshold: 0.05, holdMs: 600, timeoutMs: 5000, label: "Easy" },
  medium: { targets: 12, threshold: 0.06, holdMs: 800, timeoutMs: 4000, label: "Medium" },
  hard: { targets: 16, threshold: 0.08, holdMs: 1000, timeoutMs: 3000, label: "Hard" },
};

const DIR_LABELS = {
  left: "← Shift LEFT",
  right: "Shift RIGHT →",
  forward: "↑ Lean FORWARD",
  backward: "↓ Lean BACK",
};

const DIR_COLORS = {
  left: "#60a5fa",
  right: "#f472b6",
  forward: "#34d399",
  backward: "#fbbf24",
};

export function WeightShiftGame({ stream, patient, difficulty = "medium", onComplete, onCancel }) {
  const cfg = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.medium;

  const stateRef = useRef({
    phase: "waiting",  // waiting | calibrating | countdown | playing | finished
    countdown: 3,
    calibFrames: [],
    neutral: { x: 0.5, y: 0.5 },
    cursorX: 0.5,
    cursorY: 0.5,
    tracking: false,
    currentDir: null,
    currentTargetStart: 0,  // when this target was presented
    holdStart: 0,           // when patient entered zone
    inZone: false,
    hits: [],        // { dir, reactionMs }
    misses: 0,
    targetQueue: [],
    targetIndex: 0,
    demoPhase: 0,
    demoOffset: { x: 0, y: 0 },
  });

  const [phase, setPhase] = useState("waiting");
  const [countdown, setCountdown] = useState(3);
  const [currentDir, setCurrentDir] = useState(null);
  const [inZone, setInZone] = useState(false);
  const [targetsLeft, setTargetsLeft] = useState(cfg.targets);
  const [feedback, setFeedback] = useState("");
  const [tracking, setTracking] = useState(false);
  const [calibProgress, setCalibProgress] = useState(0);

  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const targetTimerRef = useRef(null);
  const isDemo = !stream;

  const { videoRef, status: poseStatus } = useGamePose({
    stream,
    onFrame: useCallback((data) => {
      const s = stateRef.current;
      s.cursorX = data.bodyCenterX;
      s.cursorY = data.bodyCenterY;
      s.tracking = true;
      setTracking(true);

      // Calibration
      if (s.phase === "calibrating") {
        s.calibFrames.push({ x: data.bodyCenterX, y: data.bodyCenterY });
        const progress = Math.min(1, s.calibFrames.length / CALIBRATION_FRAMES);
        setCalibProgress(progress);
        if (s.calibFrames.length >= CALIBRATION_FRAMES) {
          const neutral = average(s.calibFrames);
          s.neutral = neutral;
          s.phase = "countdown";
          setPhase("countdown");
        }
      }
    }, []),
  });

  // Demo cursor simulation
  useEffect(() => {
    if (!isDemo) return;
    const interval = setInterval(() => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      const dir = s.currentDir;
      // Simulate patient shifting toward current target direction
      let targetX = 0.5;
      let targetY = 0.5;
      if (dir === "left") targetX = 0.5 - cfg.threshold * 1.5;
      else if (dir === "right") targetX = 0.5 + cfg.threshold * 1.5;
      else if (dir === "forward") targetY = 0.5 - cfg.threshold * 1.5;
      else if (dir === "backward") targetY = 0.5 + cfg.threshold * 1.5;
      s.cursorX += (targetX - s.cursorX) * 0.08;
      s.cursorY += (targetY - s.cursorY) * 0.08;
      s.tracking = true;
    }, 50);
    return () => clearInterval(interval);
  }, [isDemo, cfg.threshold]);

  // Countdown
  useEffect(() => {
    if (phase !== "countdown") return;
    let count = 3;
    stateRef.current.countdown = count;
    setCountdown(count);
    const t = setInterval(() => {
      count -= 1;
      stateRef.current.countdown = count;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(t);
        const queue = buildQueue(cfg.targets);
        stateRef.current.targetQueue = queue;
        stateRef.current.targetIndex = 0;
        stateRef.current.hits = [];
        stateRef.current.misses = 0;
        stateRef.current.phase = "playing";
        setPhase("playing");
        setTargetsLeft(cfg.targets);
        presentNextTarget();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [phase, cfg.targets]); // eslint-disable-line

  function presentNextTarget() {
    const s = stateRef.current;
    if (s.targetIndex >= s.targetQueue.length) {
      endGame();
      return;
    }
    const dir = s.targetQueue[s.targetIndex];
    s.currentDir = dir;
    s.currentTargetStart = Date.now();
    s.holdStart = 0;
    s.inZone = false;
    setCurrentDir(dir);
    setInZone(false);
    setTargetsLeft(s.targetQueue.length - s.targetIndex);
    setFeedback(DIR_LABELS[dir]);

    clearTimeout(targetTimerRef.current);
    targetTimerRef.current = setTimeout(() => {
      // Timeout = miss
      const s2 = stateRef.current;
      if (s2.phase === "playing" && s2.currentDir === dir) {
        s2.misses += 1;
        s2.targetIndex += 1;
        setFeedback("Missed! Too slow.");
        setTimeout(presentNextTarget, 600);
      }
    }, cfg.timeoutMs);
  }

  function endGame() {
    clearTimeout(targetTimerRef.current);
    const s = stateRef.current;
    s.phase = "finished";
    setPhase("finished");
    const hits = s.hits;
    const totalTargets = cfg.targets;
    const successRate = hits.length / totalTargets;
    const avgReaction = hits.length > 0
      ? hits.reduce((sum, h) => sum + h.reactionMs, 0) / hits.length
      : null;
    const accuracy = hits.length > 0
      ? Math.round(hits.reduce((sum, h) => sum + h.accuracy, 0) / hits.length * 100)
      : 0;
    const smoothness = computeSmoothness(hits);
    const score = Math.round(
      successRate * 50 +
      (avgReaction ? Math.max(0, (cfg.timeoutMs - avgReaction) / cfg.timeoutMs) * 30 : 0) +
      accuracy * 0.2
    );

    onComplete({
      gameType: "weight_shift",
      difficulty,
      durationSeconds: Math.round((Date.now() - (s.hits[0]?.startTime ?? Date.now())) / 1000) || cfg.targets * 3,
      acquisitionMode: isDemo ? "demo" : "webcam",
      score: Math.min(100, score),
      accuracy: accuracy,
      stability: Math.round(smoothness * 100) / 100,
      smoothness: Math.round(smoothness * 100) / 100,
      reactionTimeMs: avgReaction ? Math.round(avgReaction) : null,
      successRate: Math.round(successRate * 100),
      targetsHit: hits.length,
      targetsMissed: s.misses,
    });
  }

  // Zone detection loop
  useEffect(() => {
    if (phase !== "playing") return;
    const interval = setInterval(() => {
      const s = stateRef.current;
      if (!s.tracking || !s.currentDir) return;

      const nx = s.neutral.x;
      const ny = s.neutral.y;
      const dx = s.cursorX - nx;
      const dy = s.cursorY - ny;
      const threshold = cfg.threshold;

      let inZoneNow = false;
      switch (s.currentDir) {
        case "left":    inZoneNow = dx < -threshold; break;
        case "right":   inZoneNow = dx > threshold; break;
        case "forward": inZoneNow = dy < -threshold; break;
        case "backward": inZoneNow = dy > threshold; break;
      }

      setInZone(inZoneNow);
      s.inZone = inZoneNow;

      if (inZoneNow) {
        if (s.holdStart === 0) s.holdStart = Date.now();
        const holdDuration = Date.now() - s.holdStart;
        const progress = Math.min(1, holdDuration / cfg.holdMs);
        setFeedback(`Hold… ${Math.round(progress * 100)}%`);
        if (holdDuration >= cfg.holdMs) {
          // Successful hit!
          const reactionMs = s.holdStart - s.currentTargetStart;
          const shiftMag = Math.abs(s.currentDir === "left" || s.currentDir === "right" ? dx : dy);
          s.hits.push({
            dir: s.currentDir,
            reactionMs,
            accuracy: Math.min(1, shiftMag / (threshold * 1.5)),
            startTime: s.currentTargetStart,
          });
          s.targetIndex += 1;
          clearTimeout(targetTimerRef.current);
          setFeedback("Target reached! ✓");
          setTimeout(presentNextTarget, 400);
        }
      } else {
        if (s.holdStart > 0) s.holdStart = 0;
        setFeedback(DIR_LABELS[s.currentDir] ?? "");
      }
    }, 50);
    return () => clearInterval(interval);
  }, [phase, cfg.holdMs, cfg.threshold]); // eslint-disable-line

  // Canvas draw loop
  useEffect(() => {
    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) { animFrameRef.current = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext("2d");
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      ctx.clearRect(0, 0, W, H);

      const s = stateRef.current;

      if (s.phase === "playing") {
        const nx = s.neutral.x * W;
        const ny = s.neutral.y * H;
        drawZoneIndicators(ctx, W, H, s.currentDir, s.inZone, s.neutral, cfg.threshold);
        drawWeightCursor(ctx, s.cursorX * W, s.cursorY * H, s.inZone, s.tracking);
        drawNeutralMarker(ctx, nx, ny);
      }

      if (s.phase === "countdown") {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `bold ${Math.min(W, H) * 0.35}px system-ui`;
        ctx.fillStyle = s.countdown > 0 ? "#60a5fa" : "#34d399";
        ctx.fillText(s.countdown > 0 ? String(s.countdown) : "GO!", W / 2, H / 2);
      }

      if (s.phase === "calibrating") {
        const progress = s.calibFrames.length / CALIBRATION_FRAMES;
        drawCalibrating(ctx, W, H, progress);
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }
    animFrameRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animFrameRef.current); clearTimeout(targetTimerRef.current); };
  }, [cfg.threshold]); // eslint-disable-line

  const handleStart = () => {
    const s = stateRef.current;
    if (isDemo) {
      // Skip calibration for demo
      s.neutral = { x: 0.5, y: 0.5 };
      s.phase = "countdown";
      setPhase("countdown");
    } else {
      s.calibFrames = [];
      s.phase = "calibrating";
      setPhase("calibrating");
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-slate-950 select-none">
      <video
        ref={videoRef}
        autoPlay playsInline muted
        className="h-full w-full object-cover"
        style={{ transform: "scaleX(-1)" }}
      />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

      {/* Top HUD during play */}
      {(phase === "playing" || phase === "countdown") && (
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-6 py-4">
          <div className="rounded-xl bg-black/60 px-4 py-2 text-center backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-wider text-white/60">Targets</p>
            <p className="text-3xl font-bold text-white tabular-nums">{targetsLeft}</p>
          </div>

          {currentDir && (
            <div
              className="rounded-xl px-6 py-3 text-center backdrop-blur text-xl font-bold"
              style={{ backgroundColor: DIR_COLORS[currentDir] + "cc", color: "#fff" }}
            >
              {DIR_LABELS[currentDir]}
            </div>
          )}

          <button
            type="button"
            onClick={endGame}
            className="rounded-xl bg-black/60 px-4 py-2 text-sm font-bold text-white/70 backdrop-blur hover:bg-black/80 hover:text-white"
          >
            End Game
          </button>
        </div>
      )}

      {/* Feedback */}
      {phase === "playing" && feedback && (
        <div className="absolute bottom-6 left-6 right-6">
          <div className={`mx-auto max-w-md rounded-xl px-5 py-3 text-center text-base font-semibold text-white backdrop-blur ${inZone ? "bg-emerald-600/80" : "bg-black/70"}`}>
            {feedback}
          </div>
        </div>
      )}

      {/* Calibrating */}
      {phase === "calibrating" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
          <p className="text-2xl font-bold text-white">Stand still and relax</p>
          <p className="mt-2 text-white/60">Finding your neutral position…</p>
          <div className="mt-6 h-3 w-64 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${calibProgress * 100}%` }} />
          </div>
        </div>
      )}

      {/* Waiting */}
      {phase === "waiting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 p-6 text-center">
          <div className="max-w-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-400">Weight Shift Trainer</p>
            <h2 className="mt-3 text-4xl font-bold text-white">Shift to Reach the Target</h2>
            <p className="mt-4 text-lg text-white/70">
              Arrows will appear on screen. Shift your body weight in that direction to reach the target zone.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm text-white/50">
              <span className="rounded-lg bg-white/10 px-3 py-1">{cfg.targets} targets</span>
              <span className="rounded-lg bg-white/10 px-3 py-1">{cfg.label}</span>
              {isDemo && <span className="rounded-lg bg-amber-500/30 px-3 py-1 text-amber-300">Demo</span>}
            </div>
            {!isDemo && poseStatus === "loading" && (
              <p className="mt-4 text-sm text-amber-300">Loading pose detector…</p>
            )}
            <div className="mt-6 flex gap-3 justify-center">
              <button
                type="button"
                onClick={handleStart}
                disabled={!isDemo && poseStatus !== "tracking" && poseStatus !== "searching"}
                className="rounded-xl bg-blue-500 px-8 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-blue-400 disabled:opacity-40"
              >
                Start Game
              </button>
              <button type="button" onClick={onCancel} className="rounded-xl bg-white/10 px-6 py-4 text-lg font-bold text-white/70 transition hover:bg-white/20">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Canvas drawing ──────────────────────────────────────────────────────────

function drawZoneIndicators(ctx, W, H, activeDir, inZone, neutral, threshold) {
  const zoneW = W * threshold * 2.5;
  const zoneH = H * threshold * 2.5;
  const nx = neutral.x * W;
  const ny = neutral.y * H;

  const zones = {
    left:     { x: nx - W * threshold * 3 - zoneW / 2, y: ny - zoneH / 2, w: zoneW, h: zoneH, label: "←" },
    right:    { x: nx + W * threshold * 3 - zoneW / 2, y: ny - zoneH / 2, w: zoneW, h: zoneH, label: "→" },
    forward:  { x: nx - zoneW / 2, y: ny - H * threshold * 3 - zoneH / 2, w: zoneW, h: zoneH, label: "↑" },
    backward: { x: nx - zoneW / 2, y: ny + H * threshold * 3 - zoneH / 2, w: zoneW, h: zoneH, label: "↓" },
  };

  for (const [dir, zone] of Object.entries(zones)) {
    const isActive = dir === activeDir;
    const isHit = isActive && inZone;
    const alpha = isActive ? 0.85 : 0.2;
    const color = DIR_COLORS[dir];

    ctx.beginPath();
    roundRect(ctx, zone.x, zone.y, zone.w, zone.h, 16);
    ctx.fillStyle = isHit ? color + "cc" : color + Math.floor(alpha * 80).toString(16).padStart(2, "0");
    ctx.fill();

    if (isActive) {
      ctx.strokeStyle = isHit ? "#fff" : color;
      ctx.lineWidth = isHit ? 4 : 3;
      ctx.beginPath();
      roundRect(ctx, zone.x, zone.y, zone.w, zone.h, 16);
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.min(zone.w, zone.h) * 0.55}px system-ui`;
    ctx.fillStyle = isActive ? "#fff" : "rgba(255,255,255,0.4)";
    ctx.fillText(zone.label, zone.x + zone.w / 2, zone.y + zone.h / 2);
  }
}

function drawWeightCursor(ctx, x, y, inZone, tracking) {
  if (!tracking) return;
  const color = inZone ? "#34d399" : "#60a5fa";

  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.strokeStyle = color + "80";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fillStyle = color + "cc";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
}

function drawNeutralMarker(ctx, nx, ny) {
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(nx - 20, ny); ctx.lineTo(nx + 20, ny);
  ctx.moveTo(nx, ny - 20); ctx.lineTo(nx, ny + 20);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawCalibrating(ctx, W, H, progress) {
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) * 0.08;

  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.strokeStyle = "#34d399";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function average(points) {
  const n = points.length;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

function buildQueue(count) {
  const dirs = [...DIRECTIONS, ...DIRECTIONS];
  const queue = [];
  let lastDir = null;
  while (queue.length < count) {
    const candidates = dirs.filter((d) => d !== lastDir);
    const dir = candidates[Math.floor(Math.random() * candidates.length)];
    queue.push(dir);
    lastDir = dir;
  }
  return queue;
}

function computeSmoothness(hits) {
  if (hits.length < 2) return 0.7;
  const reactions = hits.map((h) => h.reactionMs);
  const mean = reactions.reduce((a, b) => a + b, 0) / reactions.length;
  const variance = reactions.reduce((a, b) => a + (b - mean) ** 2, 0) / reactions.length;
  const cv = Math.sqrt(variance) / (mean || 1); // coefficient of variation
  return Math.max(0, Math.min(1, 1 - cv * 0.5));
}
