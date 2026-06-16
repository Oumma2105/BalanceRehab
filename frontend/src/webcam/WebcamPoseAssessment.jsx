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

export function WebcamPoseAssessment({ t, stream, frame, onMetrics, onState, mirrored = false, immersive = false }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const pose = useMediaPipePose({
    videoRef,
    canvasRef,
    active: Boolean(stream),
    onMetrics,
    onState,
    t,
  });
  const metrics = pose.metrics;
  const warning = metrics?.warning ?? { level: "stable", text: frame.warning };
  const landmarkCounts = getHolisticCounts(pose.holistic);
  const landmarkCount = metrics?.landmarkCount ?? totalLandmarkCount(landmarkCounts);
  const mediaTransform = mirrored ? "scaleX(-1)" : undefined;

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      console.info("[BalanceRehab] camera started");
    }
  }, [stream]);

  if (immersive) {
    return (
      <div className="h-full">
        <div className="relative h-full overflow-hidden bg-slate-950">
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ transform: mediaTransform }} />
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ transform: mediaTransform }} />
        </div>
        {pose.error ? (
          <div className="absolute bottom-5 left-5 z-30 max-w-sm rounded-lg border border-[#F94144]/25 bg-slate-950/78 p-3 text-sm font-semibold text-white shadow-xl shadow-slate-950/20 backdrop-blur-md">
            {t.modelDetectionCouldNotStart ?? "Camera is active, but pose detection could not start. Restart the assessment."}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950 shadow-sm">
        <video ref={videoRef} autoPlay playsInline muted className="h-[28rem] w-full object-cover" style={{ transform: mediaTransform }} />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ transform: mediaTransform }} />
        <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[pose.status] ?? statusStyles.idle}`}>
            {statusLabel(pose.status, t)}
          </span>
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#577590]">
            {landmarkCount} {t.poseLandmarks}
          </span>
        </div>
        <TrackingStatusPanel tracking={pose.tracking} readiness={pose.readiness} t={t} />
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

function TrackingStatusPanel({ tracking = {}, readiness, t, compact = false }) {
  const items = [
    { label: t.cameraReady ?? "Camera ready", active: readiness?.cameraActive },
    { label: t.modelActive ?? "Model active", active: readiness?.modelActive },
    { label: t.bodyDetected ?? "Body detected", active: tracking.bodyDetected },
  ];

  return (
    <div className={`absolute right-4 top-16 rounded-lg border border-white/16 bg-slate-950/48 p-2.5 text-white shadow-xl shadow-slate-950/15 backdrop-blur-md ${compact ? "max-w-[13.5rem]" : "w-[15rem]"}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase text-white/62">{t.trackingStatus ?? "Tracking status"}</p>
        <span className="rounded-full bg-white/12 px-2 py-1 text-[10px] font-semibold text-white">
          {tracking.processing ? (t.processing ?? "Processing") : `${tracking.fps ?? 0} FPS`}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <div key={item.label} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${item.active ? "border-[#90BE6D]/35 bg-[#90BE6D]/16 text-white" : "border-white/12 bg-white/8 text-white/56"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${item.active ? "bg-[#90BE6D]" : "bg-white/28"}`} aria-label={item.active ? (t.detected ?? "Detected") : (t.notDetected ?? "Not detected")} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      {readiness && !readiness.ready ? (
        <p className="mt-2 rounded-md bg-[#F9C74F]/14 px-2 py-1.5 text-[11px] font-semibold leading-4 text-[#FFF4C2]">
          {readiness.feedback ?? t.moveBackwardUntilVisible ?? "Move back until your entire body is visible"}
        </p>
      ) : null}
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

function getHolisticCounts(holistic = {}) {
  return {
    pose: holistic.pose?.length ?? 0,
    face: holistic.face?.length ?? 0,
    leftHand: holistic.leftHand?.length ?? 0,
    rightHand: holistic.rightHand?.length ?? 0,
  };
}

function totalLandmarkCount(counts) {
  return counts.pose + counts.face + counts.leftHand + counts.rightHand;
}
