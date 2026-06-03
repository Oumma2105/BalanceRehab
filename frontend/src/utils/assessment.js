export function simulateAssessmentResults(config) {
  const dynamicPenalty = config.testType === "dynamic" ? 9 : 0;
  const eyesPenalty = config.visualCondition === "eyes_closed" ? 7 : 0;
  const base = 84 - dynamicPenalty - eyesPenalty;
  const boardStabilityScore = clamp(Math.round(base - 4 + Math.random() * 8), 45, 96);
  const postureStabilityScore = clamp(Math.round(base - 1 + Math.random() * 10), 45, 96);
  const totalBalanceScore = Math.round(boardStabilityScore * 0.6 + postureStabilityScore * 0.4);
  const swayMultiplier = config.testType === "dynamic" ? 1.35 : 1;
  const visionMultiplier = config.visualCondition === "eyes_closed" ? 1.25 : 1;
  const meanSwayAp = round1((8 + Math.random() * 5) * swayMultiplier * visionMultiplier);
  const meanSwayMl = round1((7 + Math.random() * 6) * swayMultiplier * visionMultiplier);
  const maxSwayAp = round1(meanSwayAp * (1.8 + Math.random() * 0.4));
  const maxSwayMl = round1(meanSwayMl * (1.7 + Math.random() * 0.5));
  const swayVelocity = round1((18 + Math.random() * 12) * swayMultiplier * visionMultiplier);
  const instabilityEvents = Math.max(0, Math.round((100 - totalBalanceScore) / 9 + Math.random() * 2));
  const trunkDeviation = round1((4 + Math.random() * 5) * swayMultiplier);
  const shoulderAsymmetry = round1(2 + Math.random() * 5);
  const hipAsymmetry = round1(2 + Math.random() * 5);
  const bodyCenterDeviation = round1((5 + Math.random() * 6) * visionMultiplier);
  const status = getStatus(totalBalanceScore);

  const metrics = {
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
    status,
  };

  return {
    ...metrics,
    interpretation: generateInterpretation(metrics, config),
    recommendations: generateRecommendations(metrics, config),
    samples: generateSamples(config.durationSeconds, metrics),
  };
}

export function getStatus(score) {
  if (score >= 80) return "Stable";
  if (score >= 65) return "Moderate instability";
  return "High instability";
}

export function generateInterpretation(metrics, config) {
  const mode = config.testType === "dynamic" ? "dynamic unsupported condition" : "controlled static condition";
  return `Estimated functional balance indicators suggest ${metrics.status.toLowerCase()} during the ${mode}. The result should be interpreted as rehabilitation-support information, not as a medical diagnosis.`;
}

export function generateRecommendations(metrics, config) {
  const recommendations = [];

  if (metrics.meanSwayMl > 12) {
    recommendations.push("High medial-lateral sway: consider lateral weight-shift and side-stepping control exercises.");
  }
  if (metrics.meanSwayAp > 12) {
    recommendations.push("High anterior-posterior sway: include forward/backward control and ankle strategy exercises.");
  }
  if (metrics.trunkDeviation > 8) {
    recommendations.push("Trunk deviation increased: add trunk stabilization and postural alignment exercises.");
  }
  if (config.testType === "dynamic" && metrics.totalBalanceScore < 70) {
    recommendations.push("Dynamic score is limited: continue static/support-ring training before increasing difficulty.");
  }
  if (config.visualCondition === "eyes_closed" && metrics.totalBalanceScore < 75) {
    recommendations.push("Eyes-closed instability is present: consider proprioceptive training with safe therapist supervision.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Current indicators are stable: progress difficulty gradually while maintaining therapist supervision.");
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
    acquisitionMode: "Demo",
    status: results.status === "Stable" ? "Stable" : results.status === "Moderate instability" ? "Follow-up" : "Declining",
    totalScore: results.totalBalanceScore,
    boardScore: results.boardStabilityScore,
    postureScore: results.postureStabilityScore,
    results,
  };
}

export function generateLiveFrame(progress) {
  const wave = Math.sin(progress / 7);
  return {
    stability: clamp(Math.round(78 + wave * 8 + Math.random() * 5), 55, 96),
    apSway: round1(8 + Math.abs(wave) * 7 + Math.random() * 2),
    mlSway: round1(7 + Math.abs(Math.cos(progress / 6)) * 8 + Math.random() * 2),
    posture: clamp(Math.round(82 - Math.abs(wave) * 10 + Math.random() * 4), 55, 96),
    warning:
      progress > 8 && progress % 11 < 2
        ? "High lateral sway detected"
        : progress > 15 && progress % 13 < 2
          ? "Trunk deviation increased"
          : "Within supervised range",
  };
}

function generateSamples(duration, metrics) {
  return Array.from({ length: Math.min(duration, 60) }, (_, index) => ({
    t: index,
    ap: round1(metrics.meanSwayAp + Math.sin(index / 4) * 3),
    ml: round1(metrics.meanSwayMl + Math.cos(index / 5) * 3),
    posture: clamp(Math.round(metrics.postureStabilityScore + Math.sin(index / 6) * 5), 45, 98),
  }));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}
