import { useEffect, useRef } from "react";

import { useMediaPipePose } from "./useMediaPipePose.js";

const statusStyles = {
  idle: "bg-slate-100 text-[#577590]",
  loading: "bg-amber-50 text-[#F8961E]",
  searching: "bg-amber-50 text-[#F8961E]",
  tracking: "bg-emerald-50 text-[#43AA8B]",
  error: "bg-rose-50 text-[#F94144]",
};

const warningStyles = {
  stable: "border-[#90BE6D] bg-[#90BE6D]/10 text-[#47743C]",
  warning: "border-[#F9C74F] bg-[#F9C74F]/20 text-[#8A6B00]",
  alert: "border-[#F8961E] bg-[#F8961E]/15 text-[#A14F00]",
  danger: "border-[#F94144] bg-[#F94144]/10 text-[#B4232A]",
};

export function WebcamPoseAssessment({ t, stream, frame, onMetrics }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const pose = useMediaPipePose({
    videoRef,
    canvasRef,
    active: Boolean(stream),
    onMetrics,
    t,
  });
  const metrics = pose.metrics;
  const warning = metrics?.warning ?? { level: "stable", text: frame.warning };

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="mt-5 space-y-4">
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950 shadow-sm">
        <video ref={videoRef} autoPlay playsInline muted className="h-[28rem] w-full object-cover" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[pose.status] ?? statusStyles.idle}`}>
            {statusLabel(pose.status, t)}
          </span>
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#577590]">
            {metrics?.landmarkCount ?? pose.landmarks.length} {t.poseLandmarks}
          </span>
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <div className={`rounded-lg border px-4 py-3 text-sm font-semibold backdrop-blur ${warningStyles[warning.level] ?? warningStyles.stable}`}>
            {warning.text}
          </div>
        </div>
      </div>

      {pose.error ? (
        <div className="rounded-lg border border-[#F94144]/25 bg-[#F94144]/10 p-4 text-sm font-semibold text-[#B4232A]">
          {pose.error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <PostureMetric label={t.trunkDeviation} value={metrics?.trunkInclination ?? frame.trunkInclination} unit="deg" tone={toneFor(metrics?.trunkInclination ?? frame.trunkInclination, 8, 12)} />
        <PostureMetric label={t.shoulderAsymmetry} value={metrics?.shoulderAsymmetry ?? frame.shoulderAsymmetry} unit="%" tone={toneFor(metrics?.shoulderAsymmetry ?? frame.shoulderAsymmetry, 5, 8)} />
        <PostureMetric label={t.hipAsymmetry} value={metrics?.hipAsymmetry ?? frame.hipAsymmetry} unit="%" tone={toneFor(metrics?.hipAsymmetry ?? frame.hipAsymmetry, 5, 8)} />
        <PostureMetric label={t.bodyCenterDeviation} value={metrics?.bodyCenterDeviation ?? frame.bodyCenterDeviation} unit="%" tone={toneFor(metrics?.bodyCenterDeviation ?? frame.bodyCenterDeviation, 9, 14)} />
      </div>
    </div>
  );
}

function PostureMetric({ label, value, unit, tone }) {
  const styles = {
    stable: "border-[#90BE6D]/30 bg-[#90BE6D]/10 text-[#47743C]",
    warning: "border-[#F9C74F]/50 bg-[#F9C74F]/20 text-[#8A6B00]",
    alert: "border-[#F8961E]/35 bg-[#F8961E]/15 text-[#A14F00]",
  };

  return (
    <div className={`rounded-lg border p-3 ${styles[tone] ?? styles.stable}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">
        {value ?? "-"} <span className="text-sm font-medium">{unit}</span>
      </p>
    </div>
  );
}

function toneFor(value, warningThreshold, alertThreshold) {
  if (value == null) return "stable";
  if (value >= alertThreshold) return "alert";
  if (value >= warningThreshold) return "warning";
  return "stable";
}

function statusLabel(status, t) {
  if (status === "loading") return t.poseLoading;
  if (status === "searching") return t.poseSearching;
  if (status === "tracking") return t.poseTracking;
  if (status === "error") return t.poseError;
  return t.poseIdle;
}
