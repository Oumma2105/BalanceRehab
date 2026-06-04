import { acquisitionModeLabels, acquisitionModes } from "../assessment/assessmentModel.js";

export function simulateAssessmentResults(config, t = {}) {
  const acquisitionMode = config.acquisitionMode ?? acquisitionModes.demo;
  const isWebcamOnly = acquisitionMode === acquisitionModes.webcam;
  const dynamicPenalty = config.testType === "dynamic" ? 9 : 0;
  const eyesPenalty = config.visualCondition === "eyes_closed" ? 7 : 0;
  const base = 84 - dynamicPenalty - eyesPenalty;
  const boardStabilityScore = isWebcamOnly ? null : clamp(Math.round(base - 4 + Math.random() * 8), 45, 96);
  const postureStabilityScore = clamp(Math.round(base - 1 + Math.random() * 10), 45, 96);
  const totalBalanceScore = isWebcamOnly ? postureStabilityScore : Math.round(boardStabilityScore * 0.6 + postureStabilityScore * 0.4);
  const swayMultiplier = config.testType === "dynamic" ? 1.35 : 1;
  const visionMultiplier = config.visualCondition === "eyes_closed" ? 1.25 : 1;
  const meanSwayAp = isWebcamOnly ? null : round1((8 + Math.random() * 5) * swayMultiplier * visionMultiplier);
  const meanSwayMl = isWebcamOnly ? null : round1((7 + Math.random() * 6) * swayMultiplier * visionMultiplier);
  const maxSwayAp = isWebcamOnly ? null : round1(meanSwayAp * (1.8 + Math.random() * 0.4));
  const maxSwayMl = isWebcamOnly ? null : round1(meanSwayMl * (1.7 + Math.random() * 0.5));
  const swayVelocity = isWebcamOnly ? null : round1((18 + Math.random() * 12) * swayMultiplier * visionMultiplier);
  const instabilityEvents = isWebcamOnly ? null : Math.max(0, Math.round((100 - totalBalanceScore) / 9 + Math.random() * 2));
  const trunkDeviation = round1((4 + Math.random() * 5) * swayMultiplier);
  const shoulderAsymmetry = round1(2 + Math.random() * 5);
  const hipAsymmetry = round1(2 + Math.random() * 5);
  const bodyCenterDeviation = round1((5 + Math.random() * 6) * visionMultiplier);
  const status = getStatus(totalBalanceScore);
  const postureWarnings = generatePostureWarnings({ trunkDeviation, shoulderAsymmetry, hipAsymmetry, bodyCenterDeviation }, t);

  const metrics = {
    acquisitionMode,
    acquisitionLabel: acquisitionLabel(acquisitionMode, t),
    availableMetrics: {
      posture: true,
      board: !isWebcamOnly,
    },
    totalBalanceScore,
    boardStabilityScore,
    postureStabilityScore,
    meanSwayAp,
    meanSwayMl,
    maxSwayAp,
    maxSwayMl,
    swayVelocity,
    instabilityEvents,
    trunkDeviation,
    shoulderAsymmetry,
    hipAsymmetry,
    bodyCenterDeviation,
    postureWarnings,
    boardUnavailableReason: isWebcamOnly ? t.notAvailableWebcamOnly ?? "Not available in webcam-only mode" : null,
    status,
  };

  return {
    ...metrics,
    interpretation: generateInterpretation(metrics, config, t),
    recommendations: generateRecommendations(metrics, config, t),
    samples: generateSamples(config.durationSeconds, metrics),
  };
}

export function getStatus(score) {
  if (score >= 80) return "Stable";
  if (score >= 65) return "Moderate instability";
  return "High instability";
}

export function generateInterpretation(metrics, config, t = {}) {
  if (metrics.acquisitionMode === acquisitionModes.webcam) {
    return template(
      t.webcamGeneratedInterpretation ??
        "Estimated webcam-based posture indicators suggest {status}. Board-sensor sway metrics are not available in webcam-only mode. The result should be interpreted as rehabilitation-support information, not as a medical diagnosis.",
      { status: statusText(metrics.status, t).toLowerCase() },
    );
  }

  const mode = config.testType === "dynamic" ? t.dynamicUnsupportedCondition : t.controlledStaticCondition;
  const status = statusText(metrics.status, t).toLowerCase();

  return template(
    t.generatedInterpretation ??
      "Estimated functional balance indicators suggest {status} during the {mode}. The result should be interpreted as rehabilitation-support information, not as a medical diagnosis.",
    { status, mode },
  );
}

export function generateRecommendations(metrics, config, t = {}) {
  const recommendations = [];

  if (metrics.meanSwayMl > 12) {
    recommendations.push(t.recoLateralSway ?? "High medial-lateral sway: consider lateral weight-shift and side-stepping control exercises.");
  }
  if (metrics.meanSwayAp > 12) {
    recommendations.push(t.recoAnteriorPosteriorSway ?? "High anterior-posterior sway: include forward/backward control and ankle strategy exercises.");
  }
  if (metrics.trunkDeviation > 8) {
    recommendations.push(t.recoTrunkDeviation ?? "Trunk deviation increased: add trunk stabilization and postural alignment exercises.");
  }
  if (metrics.shoulderAsymmetry > 5) {
    recommendations.push(t.recoShoulderAsymmetry ?? "Shoulder asymmetry increased: monitor upper-body alignment during balance tasks.");
  }
  if (metrics.hipAsymmetry > 5) {
    recommendations.push(t.recoHipAsymmetry ?? "Hip asymmetry increased: include symmetrical stance and controlled weight-transfer exercises.");
  }
  if (config.testType === "dynamic" && metrics.totalBalanceScore < 70) {
    recommendations.push(t.recoDynamicLimited ?? "Dynamic score is limited: continue static/support-ring training before increasing difficulty.");
  }
  if (config.visualCondition === "eyes_closed" && metrics.totalBalanceScore < 75) {
    recommendations.push(t.recoEyesClosedInstability ?? "Eyes-closed instability is present: consider proprioceptive training with safe therapist supervision.");
  }
  if (recommendations.length === 0) {
    recommendations.push(t.recoStableIndicators ?? "Current indicators are stable: progress difficulty gradually while maintaining therapist supervision.");
  }

  return recommendations;
}

export function buildSession({ patient, config, results }) {
  const now = new Date();
  return {
    id: `S-${now.getTime().toString().slice(-6)}`,
    patientId: patient.id,
    patient: patient.fullName,
    patientCode: patient.patientCode,
    date: now.toLocaleString(),
    testType: config.testType === "static" ? "Static" : "Dynamic",
    supportRing: config.testType === "static" ? "Installed" : "Removed",
    condition: config.visualCondition === "eyes_open" ? "Eyes open" : "Eyes closed",
    durationSeconds: config.durationSeconds,
    notes: config.notes,
    acquisitionMode: results.acquisitionLabel ?? acquisitionLabel(results.acquisitionMode, {}),
    acquisitionModeKey: results.acquisitionMode,
    status: results.status === "Stable" ? "Stable" : results.status === "Moderate instability" ? "Follow-up" : "Declining",
    totalScore: results.totalBalanceScore,
    boardScore: results.boardStabilityScore,
    postureScore: results.postureStabilityScore,
    results,
  };
}

export function generateLiveFrame(progress, t = {}, acquisitionMode = acquisitionModes.demo) {
  const isWebcamOnly = acquisitionMode === acquisitionModes.webcam;
  const wave = Math.sin(progress / 7);
  return {
    acquisitionMode,
    acquisitionLabel: acquisitionLabel(acquisitionMode, t),
    stability: clamp(Math.round(78 + wave * 8 + Math.random() * 5), 55, 96),
    apSway: isWebcamOnly ? null : round1(8 + Math.abs(wave) * 7 + Math.random() * 2),
    mlSway: isWebcamOnly ? null : round1(7 + Math.abs(Math.cos(progress / 6)) * 8 + Math.random() * 2),
    posture: clamp(Math.round(82 - Math.abs(wave) * 10 + Math.random() * 4), 55, 96),
    trunkInclination: round1(4 + Math.abs(wave) * 6 + Math.random() * 1.5),
    shoulderAsymmetry: round1(2 + Math.abs(Math.sin(progress / 5)) * 4),
    hipAsymmetry: round1(2 + Math.abs(Math.cos(progress / 8)) * 4),
    bodyCenterDeviation: round1(4 + Math.abs(wave) * 5),
    warning:
      progress > 8 && progress % 11 < 2
        ? t.warningHighLateralSway ?? "High lateral sway detected"
        : progress > 15 && progress % 13 < 2
          ? t.warningTrunkDeviation ?? "Trunk deviation increased"
          : t.warningWithinRange ?? "Within supervised range",
  };
}

export function statusText(status, t = {}) {
  if (status === "Stable") return t.stableResult ?? "Stable";
  if (status === "Moderate instability") return t.moderateInstability ?? "Moderate instability";
  if (status === "High instability") return t.highInstability ?? "High instability";
  return status;
}

export function acquisitionLabel(mode, t = {}) {
  if (mode === acquisitionModes.webcam) return t.webcamBasedAssessment ?? acquisitionModeLabels[mode];
  if (mode === acquisitionModes.demo) return t.demoAssessmentMode ?? acquisitionModeLabels[mode];
  if (mode === acquisitionModes.combined) return t.combinedAssessmentMode ?? acquisitionModeLabels[mode];
  if (mode === acquisitionModes.board) return t.boardAssessmentMode ?? acquisitionModeLabels[mode];
  return mode;
}

function template(text, values) {
  return Object.entries(values).reduce((current, [key, value]) => current.replace(`{${key}}`, value ?? ""), text);
}

function generateSamples(duration, metrics) {
  return Array.from({ length: Math.min(duration, 60) }, (_, index) => ({
    t: index,
    ap: metrics.meanSwayAp == null ? null : round1(metrics.meanSwayAp + Math.sin(index / 4) * 3),
    ml: metrics.meanSwayMl == null ? null : round1(metrics.meanSwayMl + Math.cos(index / 5) * 3),
    posture: clamp(Math.round(metrics.postureStabilityScore + Math.sin(index / 6) * 5), 45, 98),
  }));
}

function generatePostureWarnings(metrics, t = {}) {
  const warnings = [];

  if (metrics.trunkDeviation > 8) warnings.push(t.warningTrunkDeviation ?? "Trunk deviation increased");
  if (metrics.shoulderAsymmetry > 5) warnings.push(t.warningShoulderAsymmetry ?? "Shoulder asymmetry increased");
  if (metrics.hipAsymmetry > 5) warnings.push(t.warningHipAsymmetry ?? "Hip asymmetry increased");
  if (metrics.bodyCenterDeviation > 9) warnings.push(t.warningBodyCenterDeviation ?? "Body center deviation increased");

  return warnings.length ? warnings : [t.warningWithinRange ?? "Within supervised range"];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}
