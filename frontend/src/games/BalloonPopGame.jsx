import { useCallback, useEffect, useRef, useState } from "react";
import { useGamePose } from "./useGamePose.js";

const BALLOON_RADIUS = 45;
const POP_DURATION_MS = 400;
const HAND_RADIUS = 28;

const DIFFICULTY_CONFIG = {
  easy:   { totalBalloons: 10, spawnIntervalMs: 2500, lifetimeMs: 4000, label: "Easy" },
  medium: { totalBalloons: 15, spawnIntervalMs: 2000, lifetimeMs: 3000, label: "Medium" },
  hard:   { totalBalloons: 20, spawnIntervalMs: 1500, lifetimeMs: 2200, label: "Hard" },
};

const BALLOON_COLORS = ["#f87171", "#fb923c", "#facc15", "#34d399", "#60a5fa", "#c084fc", "#f472b6"];

let nextBalloonId = 1;

export function BalloonPopGame({ stream, patient, difficulty = "medium", onComplete, onCancel }) {
  const cfg = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.medium;

  const stateRef = useRef({
    phase: "waiting",
    countdown: 3,
    balloons: [],
    pops: [],
    leftX: null, leftY: null,
    rightX: null, rightY: null,
    tracking: false,
    hits: [],
    misses: 0,
    spawned: 0,
    demoAngle: 0,
    demoHandTimer: 0,
  });

  const [phase, setPhase] = useState("waiting");
  const [countdown, setCountdown] = useState(3);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [tracking, setTracking] = useState(false);

  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const spawnTimerRef = useRef(null);
  const isDemo = !stream;

  const { videoRef, status: poseStatus } = useGamePose({
    stream,
    onFrame: useCallback((data) => {
      const s = stateRef.current;
      s.leftX = data.leftWristX;
      s.leftY = data.leftWristY;
      s.rightX = data.rightWristX;
      s.rightY = data.rightWristY;
      s.tracking = true;
      setTracking(true);
    }, []),
  });

  // Demo hand simulation
  useEffect(() => {
    if (!isDemo) return;
    const interval = setInterval(() => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      s.demoAngle += 0.04;

      // Find nearest balloon to simulate hitting
      const canvas = canvasRef.current;
      if (!canvas) return;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;

      const balloon = s.balloons[0];
      if (balloon) {
        // Move hand toward balloon
        const bx = balloon.x / W;
        const by = balloon.y / H;
        s.rightX = s.rightX ? s.rightX + (bx - s.rightX) * 0.12 : bx;
        s.rightY = s.rightY ? s.rightY + (by - s.rightY) * 0.12 : by;
      } else {
        // Idle movement
        s.rightX = 0.7 + Math.sin(s.demoAngle) * 0.1;
        s.rightY = 0.5 + Math.cos(s.demoAngle * 0.7) * 0.15;
      }
      s.leftX = 0.3 + Math.sin(s.demoAngle * 0.8 + 1) * 0.08;
      s.leftY = 0.5 + Math.cos(s.demoAngle * 0.6) * 0.12;
      s.tracking = true;
    }, 50);
    return () => clearInterval(interval);
  }, [isDemo]);

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
        stateRef.current.phase = "playing";
        stateRef.current.spawned = 0;
        stateRef.current.hits = [];
        stateRef.current.misses = 0;
        stateRef.current.balloons = [];
        stateRef.current.pops = [];
        setPhase("playing");
        setScore(0);
        startSpawning();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [phase]); // eslint-disable-line

  function startSpawning() {
    const spawnBalloon = () => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;

      const margin = BALLOON_RADIUS + 20;
      const x = margin + Math.random() * (W - margin * 2);
      const y = margin + Math.random() * (H * 0.7 - margin);

      const balloon = {
        id: nextBalloonId++,
        x, y,
        color: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)],
        createdAt: Date.now(),
        lifetimeMs: cfg.lifetimeMs,
        reactionStart: Date.now(),
      };

      s.balloons.push(balloon);
      s.spawned += 1;

      if (s.spawned < cfg.totalBalloons) {
        spawnTimerRef.current = setTimeout(spawnBalloon, cfg.spawnIntervalMs);
      }
    };

    spawnTimerRef.current = setTimeout(spawnBalloon, 300);
  }

  // Collision detection and balloon expiry
  useEffect(() => {
    if (phase !== "playing") return;
    const interval = setInterval(() => {
      const s = stateRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const now = Date.now();

      const toRemove = new Set();
      let scoreGain = 0;

      for (const balloon of s.balloons) {
        const age = now - balloon.createdAt;

        // Check hand collisions
        const hands = [
          { x: s.leftX !== null ? s.leftX * W : null, y: s.leftY !== null ? s.leftY * H : null, side: "left" },
          { x: s.rightX !== null ? s.rightX * W : null, y: s.rightY !== null ? s.rightY * H : null, side: "right" },
        ];

        let popped = false;
        for (const hand of hands) {
          if (hand.x === null) continue;
          const dist = Math.hypot(hand.x - balloon.x, hand.y - balloon.y);
          if (dist < BALLOON_RADIUS + HAND_RADIUS) {
            // Hit!
            const reactionMs = now - balloon.reactionStart;
            s.hits.push({ reactionMs, side: hand.side });
            s.pops.push({ x: balloon.x, y: balloon.y, color: balloon.color, startedAt: now });
            toRemove.add(balloon.id);
            scoreGain += 10;
            setFeedback(hand.side === "left" ? "Left hand hit! ✓" : "Right hand hit! ✓");
            popped = true;
            break;
          }
        }

        if (!popped && age > balloon.lifetimeMs) {
          // Expired = miss
          s.misses += 1;
          s.pops.push({ x: balloon.x, y: balloon.y, color: "#94a3b8", startedAt: now });
          toRemove.add(balloon.id);
          setFeedback("Missed!");
        }
      }

      s.balloons = s.balloons.filter((b) => !toRemove.has(b.id));
      s.pops = s.pops.filter((p) => now - p.startedAt < POP_DURATION_MS);

      if (scoreGain > 0) {
        setScore((prev) => prev + scoreGain);
      }

      // End game when all spawned and collected
      if (s.spawned >= cfg.totalBalloons && s.balloons.length === 0 && s.pops.length === 0) {
        endGame();
      }
    }, 33); // ~30fps
    return () => clearInterval(interval);
  }, [phase, cfg.totalBalloons]); // eslint-disable-line

  function endGame() {
    if (stateRef.current.phase === "finished") return;
    clearTimeout(spawnTimerRef.current);
    const s = stateRef.current;
    s.phase = "finished";
    setPhase("finished");

    const hits = s.hits;
    const totalTargets = cfg.totalBalloons;
    const successRate = hits.length / totalTargets;
    const avgReaction = hits.length > 0
      ? hits.reduce((sum, h) => sum + h.reactionMs, 0) / hits.length
      : null;
    const leftHits = hits.filter((h) => h.side === "left").length;
    const rightHits = hits.filter((h) => h.side === "right").length;
    const coordination = Math.min(leftHits, rightHits) / Math.max(leftHits, rightHits, 1);
    const score = Math.round(
      successRate * 60 +
      (avgReaction ? Math.max(0, 1 - avgReaction / cfg.lifetimeMs) * 30 : 0) +
      coordination * 10
    );

    onComplete({
      gameType: "balloon_pop",
      difficulty,
      durationSeconds: Math.round(cfg.totalBalloons * cfg.spawnIntervalMs / 1000) + 5,
      acquisitionMode: isDemo ? "demo" : "webcam",
      score: Math.min(100, score),
      accuracy: Math.round(successRate * 100),
      stability: Math.round(coordination * 100) / 100,
      smoothness: Math.round(coordination * 100) / 100,
      reactionTimeMs: avgReaction ? Math.round(avgReaction) : null,
      successRate: Math.round(successRate * 100),
      targetsHit: hits.length,
      targetsMissed: s.misses,
    });
  }

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
      const now = Date.now();

      if (s.phase === "playing") {
        // Draw balloons
        for (const balloon of s.balloons) {
          const age = now - balloon.createdAt;
          const lifeRatio = age / balloon.lifetimeMs;
          drawBalloon(ctx, balloon.x, balloon.y, balloon.color, lifeRatio);
        }

        // Draw pop effects
        for (const pop of s.pops) {
          const progress = (now - pop.startedAt) / POP_DURATION_MS;
          drawPopEffect(ctx, pop.x, pop.y, pop.color, progress);
        }

        // Draw hands
        if (s.leftX !== null && s.tracking) {
          drawHand(ctx, s.leftX * W, s.leftY * H, "left");
        }
        if (s.rightX !== null && s.tracking) {
          drawHand(ctx, s.rightX * W, s.rightY * H, "right");
        }
      }

      if (s.phase === "countdown") {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `bold ${Math.min(W, H) * 0.35}px system-ui`;
        ctx.fillStyle = s.countdown > 0 ? "#f472b6" : "#34d399";
        ctx.fillText(s.countdown > 0 ? String(s.countdown) : "POP!", W / 2, H / 2);
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }
    animFrameRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animFrameRef.current); clearTimeout(spawnTimerRef.current); };
  }, []); // eslint-disable-line

  const handleStart = () => {
    stateRef.current.phase = "countdown";
    setPhase("countdown");
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

      {/* HUD */}
      {(phase === "playing" || phase === "countdown") && (
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-6 py-4">
          <div className="rounded-xl bg-black/60 px-4 py-2 text-center backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-wider text-white/60">Score</p>
            <p className="text-3xl font-bold text-white tabular-nums">{score}</p>
          </div>

          <div className="rounded-xl bg-black/60 px-5 py-2 text-center backdrop-blur">
            <p className="text-sm font-bold text-pink-300">Raise your hands to pop balloons!</p>
          </div>

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
          <div className="mx-auto max-w-xs rounded-xl bg-black/70 px-5 py-3 text-center text-base font-semibold text-white backdrop-blur">
            {feedback}
          </div>
        </div>
      )}

      {/* Waiting */}
      {phase === "waiting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 p-6 text-center">
          <div className="max-w-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-pink-400">Balloon Pop</p>
            <h2 className="mt-3 text-4xl font-bold text-white">Pop the Balloons!</h2>
            <p className="mt-4 text-lg text-white/70">
              Raise your hands to pop balloons as they appear. Use both hands for coordination training.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm text-white/50">
              <span className="rounded-lg bg-white/10 px-3 py-1">{cfg.totalBalloons} balloons</span>
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
                className="rounded-xl bg-pink-500 px-8 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-pink-400 disabled:opacity-40"
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

function drawBalloon(ctx, x, y, color, lifeRatio) {
  const r = BALLOON_RADIUS;
  const alpha = lifeRatio > 0.75 ? 1 - (lifeRatio - 0.75) / 0.25 * 0.5 : 1;

  ctx.globalAlpha = alpha;

  // Shadow
  ctx.beginPath();
  ctx.arc(x, y + 5, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fill();

  // Main balloon body
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fill();

  // String
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.lineTo(x + 5, y + r + 20);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Countdown ring (shrinking)
  ctx.beginPath();
  ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - lifeRatio));
  ctx.strokeStyle = lifeRatio > 0.75 ? "#f87171" : "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.globalAlpha = 1;
}

function drawPopEffect(ctx, x, y, color, progress) {
  if (progress >= 1) return;
  const r = BALLOON_RADIUS * (1 + progress * 2);
  const alpha = 1 - progress;
  ctx.globalAlpha = alpha;

  // Burst particles
  const numParticles = 8;
  for (let i = 0; i < numParticles; i++) {
    const angle = (i / numParticles) * Math.PI * 2;
    const dist = r * 0.8;
    const px = x + Math.cos(angle) * dist;
    const py = y + Math.sin(angle) * dist;
    ctx.beginPath();
    ctx.arc(px, py, 5 * (1 - progress), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Ring
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.globalAlpha = 1;
}

function drawHand(ctx, x, y, side) {
  const color = side === "left" ? "#60a5fa" : "#f472b6";

  // Outer glow
  ctx.beginPath();
  ctx.arc(x, y, HAND_RADIUS + 10, 0, Math.PI * 2);
  ctx.fillStyle = color + "30";
  ctx.fill();

  // Hand circle
  ctx.beginPath();
  ctx.arc(x, y, HAND_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color + "cc";
  ctx.fill();

  // Label
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold 14px system-ui`;
  ctx.fillStyle = "#fff";
  ctx.fillText(side === "left" ? "L" : "R", x, y);
}
