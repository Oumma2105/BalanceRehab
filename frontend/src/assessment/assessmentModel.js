export const acquisitionModes = {
  webcam: "webcam",
  demo: "demo",
  combined: "combined_future",
  board: "board",
};

export const acquisitionModeLabels = {
  [acquisitionModes.webcam]: "Webcam-Based Assessment",
  [acquisitionModes.demo]: "Demo Assessment",
  [acquisitionModes.combined]: "Webcam + Board Sensors (future)",
  [acquisitionModes.board]: "ESP32 USB Serial",
};

export const metricAvailability = {
  posture: "posture",
  board: "board",
};

export function createUnavailableMetric(reason) {
  return {
    available: false,
    reason,
  };
}

export function createAvailableMetric(value, unit = "") {
  return {
    available: true,
    value,
    unit,
  };
}

export function normalizeAssessmentResults(results) {
  return {
    ...results,
    acquisitionMode: results.acquisitionMode,
    acquisitionLabel: results.acquisitionLabel,
    availableMetrics: {
      posture: Boolean(results.availableMetrics?.posture),
      board: Boolean(results.availableMetrics?.board),
    },
    totalBalanceScore: results.totalBalanceScore,
    boardStabilityScore: results.boardStabilityScore ?? null,
    postureStabilityScore: results.postureStabilityScore,
    meanSwayAp: results.meanSwayAp ?? null,
    meanSwayMl: results.meanSwayMl ?? null,
    maxSwayAp: results.maxSwayAp ?? null,
    maxSwayMl: results.maxSwayMl ?? null,
    meanResultantSway: results.meanResultantSway ?? null,
    maxResultantSway: results.maxResultantSway ?? null,
    rmsSway: results.rmsSway ?? null,
    pathLength: results.pathLength ?? null,
    sensorQuality: results.sensorQuality ?? null,
    swayVelocity: results.swayVelocity ?? null,
    instabilityEvents: results.instabilityEvents ?? null,
    trunkDeviation: results.trunkDeviation ?? results.trunkInclination ?? null,
    trunkInclination: results.trunkInclination ?? results.trunkDeviation ?? null,
    shoulderAsymmetry: results.shoulderAsymmetry ?? null,
    hipAsymmetry: results.hipAsymmetry ?? null,
    bodyCenterDeviation: results.bodyCenterDeviation ?? null,
    postureWarnings: results.postureWarnings ?? [],
    boardUnavailableReason: results.boardUnavailableReason ?? null,
    status: results.status,
    interpretation: results.interpretation,
    recommendations: results.recommendations ?? [],
    samples: results.samples ?? [],
  };
}
