import { demoPatients } from "./demoPatients.js";

const BASE_DATE = new Date("2026-06-03T09:00:00");

const severityByPathology = {
  Stroke: 14,
  "Vestibular disorder": 10,
  "Parkinson's disease": 13,
  "Multiple sclerosis": 12,
  "Cerebellar ataxia": 16,
  "Peripheral neuropathy": 11,
  "Post-surgery rehabilitation": 8,
  "Orthopedic injury": 7,
  "Ankle instability": 6,
  "Fall prevention": 9,
  "General balance training": 3,
  Other: 5,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function readableDate(date) {
  return `${isoDate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function trendFor(index) {
  if (index % 11 === 0) return -2.4;
  if (index % 7 === 0) return -1.4;
  if (index % 5 === 0) return 0.4;
  return 1.8 + (index % 3) * 0.7;
}

function statusFromScore(score, previousScore) {
  if (score < 62 || score - previousScore < -3) return "Declining";
  if (score < 70) return "Follow-up";
  if (score - previousScore >= 2) return "Improving";
  return "Stable";
}

function interpretationFor(score, testType, visionCondition, events) {
  if (score < 62) {
    return `Estimated functional balance indicators suggest high instability during this ${testType.toLowerCase()} ${visionCondition.toLowerCase()} condition. Review supervised progression and safety support.`;
  }

  if (score < 72 || events >= 4) {
    return `Estimated functional balance indicators suggest moderate instability, especially under ${visionCondition.toLowerCase()} conditions. Continue rehabilitation-support monitoring.`;
  }

  return `Estimated functional balance indicators suggest controlled performance for this ${testType.toLowerCase()} condition, with continued monitoring recommended during progression.`;
}

function interpretationCodeFor(score, events) {
  if (score < 62) return "high_instability";
  if (score < 72 || events >= 4) return "moderate_instability";
  return "controlled_performance";
}

function recommendationsFor(metrics, testType, visionCondition, score) {
  const recommendations = [];

  if (metrics.medialLateralSway > 13) {
    recommendations.push("Prioritize lateral weight-shift control exercises.");
  }
  if (metrics.anteriorPosteriorSway > 12) {
    recommendations.push("Add forward and backward balance control drills.");
  }
  if (metrics.trunkInclination > 7) {
    recommendations.push("Continue trunk stabilization and postural alignment training.");
  }
  if (testType === "Dynamic" && score < 72) {
    recommendations.push("Use static or support-ring training before increasing dynamic difficulty.");
  }
  if (visionCondition === "Eyes closed" && score < 75) {
    recommendations.push("Include proprioceptive training with therapist supervision.");
  }
  if (!recommendations.length) {
    recommendations.push("Maintain progressive functional balance training.");
  }

  recommendations.push("Use results as rehabilitation-support information, not as a diagnosis.");
  return recommendations;
}

function recommendationCodesFor(metrics, testType, visionCondition, score) {
  const codes = [];

  if (metrics.medialLateralSway > 13) codes.push("lateral_weight_shift");
  if (metrics.anteriorPosteriorSway > 12) codes.push("forward_backward_control");
  if (metrics.trunkInclination > 7) codes.push("trunk_stabilization");
  if (testType === "Dynamic" && score < 72) codes.push("static_support_ring_training");
  if (visionCondition === "Eyes closed" && score < 75) codes.push("proprioceptive_training");
  if (!codes.length) codes.push("progressive_balance_training");
  codes.push("rehabilitation_support_only");

  return codes;
}

function makeSession(patient, patientIndex, sessionIndex, totalSessions) {
  const conditionPattern = [
    ["Static", "Eyes open"],
    ["Static", "Eyes closed"],
    ["Dynamic", "Eyes open"],
    ["Dynamic", "Eyes closed"],
  ];
  const [testType, visionCondition] = conditionPattern[(patientIndex + sessionIndex) % conditionPattern.length];
  const daysAgo = (totalSessions - sessionIndex - 1) * 14 + (patientIndex % 6);
  const date = addDays(BASE_DATE, -daysAgo);
  date.setHours(8 + ((patientIndex + sessionIndex) % 8), sessionIndex % 2 === 0 ? 10 : 40, 0, 0);

  const agePenalty = Math.max(0, (patient.age - 45) * 0.22);
  const pathologyPenalty = severityByPathology[patient.pathology] ?? 6;
  const trend = trendFor(patientIndex);
  const progression = (sessionIndex - (totalSessions - 1)) * trend;
  const testPenalty = testType === "Dynamic" ? 8 : 0;
  const visionPenalty = visionCondition === "Eyes closed" ? 7 : 0;
  const hardPenalty = testType === "Dynamic" && visionCondition === "Eyes closed" ? 5 : 0;
  const individualOffset = (patientIndex % 5) - 2;
  const totalBalanceScore = clamp(
    Math.round(92 - agePenalty - pathologyPenalty - testPenalty - visionPenalty - hardPenalty + progression + individualOffset),
    42,
    96,
  );
  const boardStabilityScore = clamp(Math.round(totalBalanceScore + (testType === "Static" ? 4 : -3) - (visionCondition === "Eyes closed" ? 1 : 0)), 38, 98);
  const postureStabilityScore = clamp(Math.round(totalBalanceScore + (patient.pathology === "Cerebellar ataxia" ? -4 : 2) + (patientIndex % 3)), 38, 98);
  const instability = 100 - totalBalanceScore;
  const dynamicBoost = testType === "Dynamic" ? 2.4 : 0;
  const closedBoost = visionCondition === "Eyes closed" ? 2.1 : 0;
  const hardBoost = testType === "Dynamic" && visionCondition === "Eyes closed" ? 1.6 : 0;
  const anteriorPosteriorSway = round1(4.4 + instability * 0.18 + dynamicBoost + closedBoost);
  const medialLateralSway = round1(4.1 + instability * 0.2 + dynamicBoost + hardBoost + (patient.pathology === "Vestibular disorder" ? 1.8 : 0));
  const swayAmplitude = round1(Math.hypot(anteriorPosteriorSway, medialLateralSway));
  const swayVelocity = round1(8 + instability * 0.46 + dynamicBoost * 1.7 + closedBoost * 1.3);
  const instabilityEvents = Math.max(0, Math.round((instability - 20) / 9 + (testType === "Dynamic" ? 1 : 0) + (visionCondition === "Eyes closed" ? 1 : 0)));
  const trunkInclination = round1(2.8 + instability * 0.09 + (patient.pathology === "Stroke" ? 1.2 : 0));
  const shoulderAsymmetry = round1(1.9 + instability * 0.07 + (patient.pathology === "Stroke" ? 1.1 : 0));
  const hipAsymmetry = round1(1.8 + instability * 0.065 + (patient.pathology === "Orthopedic injury" ? 1.2 : 0));
  const bodyCenterDeviation = round1(3.2 + instability * 0.12 + dynamicBoost);
  const previousScore = totalBalanceScore - trend;
  const status = statusFromScore(totalBalanceScore, previousScore);
  const metrics = {
    anteriorPosteriorSway,
    medialLateralSway,
    swayAmplitude,
    swayVelocity,
    instabilityEvents,
    trunkInclination,
    shoulderAsymmetry,
    hipAsymmetry,
    bodyCenterDeviation,
  };
  const interpretation = interpretationFor(totalBalanceScore, testType, visionCondition, instabilityEvents);
  const interpretationCode = interpretationCodeFor(totalBalanceScore, instabilityEvents);
  const recommendations = recommendationsFor(metrics, testType, visionCondition, totalBalanceScore);
  const recommendationCodes = recommendationCodesFor(metrics, testType, visionCondition, totalBalanceScore);
  const sequence = String(patient.id).padStart(2, "0") + String(sessionIndex + 1).padStart(2, "0");
  const sessionId = `S-${sequence}`;

  return {
    id: sessionId,
    sessionId,
    patientId: patient.id,
    patientCode: patient.patientCode,
    patient: patient.fullName,
    date: readableDate(date),
    dateISO: isoDate(date),
    testType,
    visionCondition,
    condition: visionCondition,
    duration: sessionIndex % 3 === 0 ? 60 : 30,
    durationSeconds: sessionIndex % 3 === 0 ? 60 : 30,
    totalBalanceScore,
    totalScore: totalBalanceScore,
    boardStabilityScore,
    boardScore: boardStabilityScore,
    postureStabilityScore,
    postureScore: postureStabilityScore,
    anteriorPosteriorSway,
    medialLateralSway,
    swayAmplitude,
    swayVelocity,
    instabilityEvents,
    trunkInclination,
    shoulderAsymmetry,
    hipAsymmetry,
    bodyCenterDeviation,
    status,
    supportRing: testType === "Static" ? "Installed" : "Removed",
    acquisitionMode: "Demo",
    interpretation,
    interpretationCode,
    recommendations,
    recommendationCodes,
    results: {
      totalBalanceScore,
      boardStabilityScore,
      postureStabilityScore,
      meanSwayAp: anteriorPosteriorSway,
      meanSwayMl: medialLateralSway,
      maxSwayAp: round1(anteriorPosteriorSway * 1.8),
      maxSwayMl: round1(medialLateralSway * 1.8),
      swayAmplitude,
      swayVelocity,
      instabilityEvents,
      trunkDeviation: trunkInclination,
      trunkInclination,
      shoulderAsymmetry,
      hipAsymmetry,
      bodyCenterDeviation,
      status: totalBalanceScore >= 75 ? "Stable" : totalBalanceScore >= 62 ? "Moderate instability" : "High instability",
      interpretation,
      interpretationCode,
      recommendations,
      recommendationCodes,
    },
  };
}

export const demoSessions = demoPatients
  .flatMap((patient, patientIndex) => {
    const totalSessions = 2 + (patientIndex % 4);
    return Array.from({ length: totalSessions }, (_, sessionIndex) => makeSession(patient, patientIndex, sessionIndex, totalSessions));
  })
  .sort((a, b) => `${b.dateISO} ${b.id}`.localeCompare(`${a.dateISO} ${a.id}`));
