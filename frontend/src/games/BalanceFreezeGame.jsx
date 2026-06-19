import { useCallback, useEffect, useRef, useState } from "react";
import { useGamePose } from "./useGamePose.js";

const GAME_DURATION_S = 60; // configurable per difficulty
const TARGET_RADIUS_RATIO = 0.14; // fraction of min(W,H)
const CURSOR_TRAIL_LEN = 20;
const SAMPLE_RATE_MS = 50;

const DIFFICULTY_CONFIG = {
  easy: { duration: 60, targetRadius: 0.18, label: "Easy" },
  medium: { duration: 60, targetRadius: 0.14, label: "Medium" },
  hard: { duration: 45, targetRadius: 0.10, label: "Hard" },
};

export function BalanceFreezeGame({ stream, patient, difficulty = "medium", onComplete, onCancel }) {
  const cfg = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.medium;

  // Game state (all in a ref so draw loop always has latest)
  const stateRef = useRef({
    phase: "waiting", // waiting | countdown | playing | finished
    countdown: 3,
    timeLeft: cfg.duration,
    timeInTarget: 0,
    exits: 0,
    wasInTarget: false,
    lastSampleTime: 0,
    positions: [], // {x, y, t} for smoothness
    trail: [],     // last N cursor positions for rendering
    cursorX: 0.5,
    cursorY: 0.5,
    tracking: false,
    demoOffset: { x: 0, y: 0, vx: 0.001, vy: 0.0007 },
  });

  const [phase, setPhase] = useState("waiting");
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(cfg.duration);
  const [inTarget, setInTarget] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [tracking, setTracking] = useState(false);

  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const animFrameRef = useRef(null);
  const isDemo = !stream;

  // Pose hook
  const { videoRef, status: poseStatus } = useGamePose({
    stream,
    onFrame: useCallback((data) => {
      const s = stateRef.current;
      s.cursorX = data.bodyCenterX;
      s.cursorY = data.bodyCenterY;
      s.tracking = true;
      setTracking(true);
    }, []),
  });

  // Demo cursor simulation
  useEffect(() => {
    if (!isDemo) return;
    const interval = setInterval(() => {
      const s = stateRef.current;
      const d = s.demoOffset;
      d.x += d.vx;
      d.y += d.vy;
      if (Math.abs(d.x) > 0.06) d.vx *= -1;
      if (Math.abs(d.y) > 0.05) d.vy *= -1;
      s.cursorX = 0.5 + d.x;
      s.cursorY = 0.5 + d.y;
      s.tracking = true;
    }, SAMPLE_RATE_MS);
    return () => clearInterval(interval);
  }, [isDemo]);

  // Game timer
  useEffect(() => {
    const s = stateRef.current;
    if (phase !== "playing") return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        const next = t - 1;
        stateRef.current.timeLeft = next;
        if (next <= 0) {
          stateRef.current.phase = "finished";
          setPhase("finished");
        }
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  // Countdown timer
  useEffect(() => {
    if (phase !== "countdown") return;
    let count = 3;
    stateRef.current.countdown = count;
    setCountdown(count);
    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      stateRef.current.countdown = count;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(countdownTimerRef.current);
        stateRef.current.phase = "playing";
        setPhase("playing");
        stateRef.current.timeLeft = cfg.duration;
        setTimeLeft(cfg.duration);
      }
    }, 1000);
    return () => clearInterval(countdownTimerRef.current);
  }, [phase, cfg.duration]);

  // Game logic update loop (tracks hits/exits, samples positions)
  useEffect(() => {
    if (phase !== "playing") return;
    const interval = setInterval(() => {
      const s = stateRef.current;
      if (!s.tracking) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const targetR = Math.min(W, H) * cfg.targetRadius;
      const cx = W / 2;
      const cy = H / 2;
      const cursorPx = s.cursorX * W;
      const cursorPy = s.cursorY * H;
      const dist = Math.hypot(cursorPx - cx, cursorPy - cy);
      const inside = dist <= targetR;

      if (inside) {
        s.timeInTarget += SAMPLE_RATE_MS;
        setInTarget(true);
      } else {
        setInTarget(false);
      }

      if (!inside && s.wasInTarget) {
        s.exits += 1;
      }
      s.wasInTarget = inside;

      // Record position sample for smoothness
      const now = Date.now();
      if (now - s.lastSampleTime >= SAMPLE_RATE_MS) {
        s.positions.push({ x: s.cursorX, y: s.cursorY, t: now });
        if (s.positions.length > 200) s.positions.shift();
        s.lastSampleTime = now;
      }

      // Update trail
      s.trail.push({ x: cursorPx, y: cursorPy });
      if (s.trail.length > CURSOR_TRAIL_LEN) s.trail.shift();

      // Real-time feedback
      if (inside) {
        setFeedback(dist < targetR * 0.4 ? "Perfect — hold still!" : "Good — stay in the circle");
      } else {
        const dx = cursorPx - cx;
        const dy = cursorPy - cy;
        if (Math.abs(dx) > Math.abs(dy)) {
          setFeedback(dx > 0 ? "Shift slightly left" : "Shift slightly right");
        } else {
          setFeedback(dy > 0 ? "Stand taller" : "Bend slightly forward");
        }
      }
    }, SAMPLE_RATE_MS);
    return () => clearInterval(interval);
  }, [phase, cfg.targetRadius]);

  // Finish → compute results
  useEffect(() => {
    if (phase !== "finished") return;
    const s = stateRef.current;
    const totalTime = cfg.duration * 1000;
    const accuracy = Math.round((s.timeInTarget / totalTime) * 100);
    const stability = computeStability(s.positions);
    const smoothness = computeSmoothness(s.positions);
    const score = Math.round(accuracy * 0.5 + stability * 30 + smoothness * 20);

    onComplete({
      gameType: "balance_freeze",
      difficulty,
      durationSeconds: cfg.duration,
      acquisitionMode: isDemo ? "demo" : "webcam",
      score: Math.min(100, score),
      accuracy,
      stability: Math.round(stability * 100) / 100,
      smoothness: Math.round(smoothness * 100) / 100,
      exits: s.exits,
      timeInTarget: Math.round(s.timeInTarget / 1000),
    });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Canvas draw loop
  useEffect(() => {
    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) { animFrameRef.current = requestAnimationFrame(draw); return; }

      const ctx = canvas.getContext("2d");
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      ctx.clearRect(0, 0, W, H);

      const s = stateRef.current;
      const cx = W / 2;
      const cy = H / 2;
      const targetR = Math.min(W, H) * cfg.targetRadius;
      const cursorPx = s.cursorX * W;
      const cursorPy = s.cursorY * H;
      const dist = Math.hypot(cursorPx - cx, cursorPy - cy);
      const inside = dist <= targetR;

      if (s.phase === "playing" || s.phase === "finished") {
        drawTarget(ctx, cx, cy, targetR, inside);
        drawTrail(ctx, s.trail);
        drawCursor(ctx, cursorPx, cursorPy, inside, s.tracking);
      }

      if (s.phase === "countdown") {
        drawCountdown(ctx, W, H, s.countdown);
      }

      if (s.phase === "waiting") {
        drawWaiting(ctx, W, H);
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [cfg.targetRadius]);

  const handleFinish = () => {
    clearInterval(timerRef.current);
    clearInterval(countdownTimerRef.current);
    stateRef.current.phase = "finished";
    setPhase("finished");
  };

  const handleStart = () => {
    stateRef.current.phase = "countdown";
    stateRef.current.timeInTarget = 0;
    stateRef.current.exits = 0;
    stateRef.current.positions = [];
    stateRef.current.trail = [];
    stateRef.current.wasInTarget = false;
    setPhase("countdown");
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-slate-950 select-none">
      {/* Webcam or placeholder */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-cover"
        style={{ transform: "scaleX(-1)" }}
      />

      {/* Game canvas overlay */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      {/* Top HUD */}
      {(phase === "playing" || phase === "countdown") && (
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-6 py-4">
          <div className="rounded-xl bg-black/60 px-4 py-2 text-center backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-wider text-white/60">Time</p>
            <p className={`text-3xl font-bold tabular-nums ${timeLeft <= 10 ? "text-red-400" : "text-white"}`}>
              {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
            </p>
          </div>

          <div className={`rounded-xl px-5 py-2 text-center backdrop-blur font-bold text-lg ${inTarget ? "bg-emerald-500/80 text-white" : "bg-amber-500/80 text-white"}`}>
            {inTarget ? "INSIDE ✓" : "OUT"}
          </div>

          <button
            type="button"
            onClick={handleFinish}
            className="rounded-xl bg-black/60 px-4 py-2 text-sm font-bold text-white/70 backdrop-blur hover:bg-black/80 hover:text-white"
          >
            End Game
          </button>
        </div>
      )}

      {/* Bottom feedback */}
      {phase === "playing" && feedback && (
        <div className="absolute bottom-6 left-6 right-6">
          <div className="mx-auto max-w-md rounded-xl bg-black/70 px-5 py-3 text-center text-base font-semibold text-white backdrop-blur">
            {feedback}
          </div>
        </div>
      )}

      {/* Tracking status */}
      {phase === "playing" && !tracking && !isDemo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="rounded-2xl bg-black/80 p-8 text-center">
            <p className="text-2xl font-bold text-amber-400">Step back from camera</p>
            <p className="mt-2 text-white/70">Stand so your full body is visible</p>
          </div>
        </div>
      )}

      {/* Waiting state */}
      {phase === "waiting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 p-6 text-center">
          <div className="max-w-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Balance Freeze</p>
            <h2 className="mt-3 text-4xl font-bold text-white">Stay Inside the Circle</h2>
            <p className="mt-4 text-lg text-white/70">
              Stand facing the webcam. Keep your body center inside the green target circle for as long as possible.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm text-white/50">
              <span className="rounded-lg bg-white/10 px-3 py-1">{cfg.duration}s duration</span>
              <span className="rounded-lg bg-white/10 px-3 py-1">{cfg.label} difficulty</span>
              {isDemo && <span className="rounded-lg bg-amber-500/30 px-3 py-1 text-amber-300">Demo mode</span>}
            </div>
            {!isDemo && poseStatus === "loading" && (
              <p className="mt-4 text-sm text-amber-300">Loading pose detector…</p>
            )}
            <div className="mt-6 flex gap-3 justify-center">
              <button
                type="button"
                onClick={handleStart}
                disabled={!isDemo && poseStatus !== "tracking" && poseStatus !== "searching"}
                className="rounded-xl bg-emerald-500 px-8 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-emerald-400 disabled:opacity-40"
              >
                Start Game
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl bg-white/10 px-6 py-4 text-lg font-bold text-white/70 transition hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pose error */}
      {poseStatus === "error" && phase === "waiting" && (
        <div className="absolute bottom-6 left-6 right-6">
          <div className="rounded-xl bg-red-900/80 px-4 py-3 text-sm font-semibold text-red-200">
            Pose detection failed. You can still play in Demo mode — click Cancel and select Demo.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Canvas drawing helpers ──────────────────────────────────────────────────

function drawTarget(ctx, cx, cy, r, inside) {
  // Outer glow
  const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.6);
  glow.addColorStop(0, inside ? "rgba(52,211,153,0.15)" : "rgba(251,191,36,0.10)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Target fill
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = inside ? "rgba(52,211,153,0.18)" : "rgba(251,191,36,0.12)";
  ctx.fill();

  // Target border
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = inside ? "#34d399" : "#fbbf24";
  ctx.lineWidth = inside ? 4 : 3;
  ctx.setLineDash(inside ? [] : [12, 8]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Center crosshair
  ctx.strokeStyle = inside ? "rgba(52,211,153,0.4)" : "rgba(251,191,36,0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy);
  ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16);
  ctx.stroke();
}

function drawTrail(ctx, trail) {
  if (trail.length < 2) return;
  for (let i = 1; i < trail.length; i++) {
    const t = i / trail.length;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.strokeStyle = `rgba(99,179,237,${t * 0.6})`;
    ctx.lineWidth = t * 4;
    ctx.lineCap = "round";
    ctx.stroke();
  }
}

function drawCursor(ctx, x, y, inside, tracking) {
  if (!tracking) return;
  const color = inside ? "#34d399" : "#f87171";

  // Outer pulse ring
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.strokeStyle = color + "60";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Main cursor
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fillStyle = color + "cc";
  ctx.fill();

  // White center
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Body icon (simplified silhouette lines)
  ctx.strokeStyle = "#ffffff80";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 36);
  ctx.lineTo(x, y - 22);
  ctx.stroke();
}

function drawCountdown(ctx, W, H, count) {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.min(W, H) * 0.35}px system-ui`;
  ctx.fillStyle = count > 0 ? "#34d399" : "#f9c74f";
  ctx.fillText(count > 0 ? String(count) : "GO!", W / 2, H / 2);

  ctx.font = `bold ${Math.min(W, H) * 0.055}px system-ui`;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("Get ready to hold still…", W / 2, H / 2 + Math.min(W, H) * 0.25);
}

function drawWaiting(ctx, W, H) {
  // Draw a faint target preview
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) * 0.14;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(52,211,153,0.3)";
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ── Metrics helpers ─────────────────────────────────────────────────────────

function computeStability(positions) {
  if (positions.length < 5) return 0.7;
  let sumDist = 0;
  for (let i = 1; i < positions.length; i++) {
    sumDist += Math.hypot(positions[i].x - positions[i - 1].x, positions[i].y - positions[i - 1].y);
  }
  const avgDist = sumDist / (positions.length - 1);
  // Lower average movement = higher stability
  return Math.max(0, Math.min(1, 1 - avgDist * 20));
}

function computeSmoothness(positions) {
  if (positions.length < 5) return 0.7;
  const velocities = [];
  for (let i = 1; i < positions.length; i++) {
    const dt = (positions[i].t - positions[i - 1].t) / 1000;
    if (dt > 0) {
      const vx = (positions[i].x - positions[i - 1].x) / dt;
      const vy = (positions[i].y - positions[i - 1].y) / dt;
      velocities.push(Math.hypot(vx, vy));
    }
  }
  if (velocities.length === 0) return 0.7;
  const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  const variance = velocities.reduce((a, b) => a + (b - mean) ** 2, 0) / velocities.length;
  const stdDev = Math.sqrt(variance);
  return Math.max(0, Math.min(1, 1 - stdDev * 2));
}
