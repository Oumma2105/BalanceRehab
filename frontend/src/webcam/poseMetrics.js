const landmarks = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
};

export function calculatePostureMetrics(poseLandmarks, t = {}) {
  if (!Array.isArray(poseLandmarks) || poseLandmarks.length < 25) return null;

  const leftShoulder = poseLandmarks[landmarks.leftShoulder];
  const rightShoulder = poseLandmarks[landmarks.rightShoulder];
  const leftHip = poseLandmarks[landmarks.leftHip];
  const rightHip = poseLandmarks[landmarks.rightHip];
  const required = [leftShoulder, rightShoulder, leftHip, rightHip];

  if (required.some((point) => !point || point.visibility < 0.35)) return null;

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);
  const torsoDx = shoulderMid.x - hipMid.x;
  const torsoDy = Math.max(0.001, Math.abs(shoulderMid.y - hipMid.y));
  const trunkInclination = round1(Math.abs(Math.atan2(torsoDx, torsoDy)) * (180 / Math.PI));
  const shoulderAsymmetry = round1(Math.abs(leftShoulder.y - rightShoulder.y) * 100);
  const hipAsymmetry = round1(Math.abs(leftHip.y - rightHip.y) * 100);
  const bodyCenterDeviation = round1(Math.abs((shoulderMid.x + hipMid.x) / 2 - 0.5) * 100);
  const postureScore = clamp(
    Math.round(100 - trunkInclination * 2.1 - shoulderAsymmetry * 1.4 - hipAsymmetry * 1.2 - bodyCenterDeviation * 0.8),
    35,
    99,
  );

  return {
    trunkInclination,
    trunkDeviation: trunkInclination,
    shoulderAsymmetry,
    hipAsymmetry,
    bodyCenterDeviation,
    postureScore,
    landmarkCount: poseLandmarks.length,
    warning: postureWarning({ trunkInclination, shoulderAsymmetry, hipAsymmetry, bodyCenterDeviation }, t),
    timestamp: Date.now(),
  };
}

function postureWarning(metrics, t = {}) {
  if (metrics.trunkInclination > 12 || metrics.bodyCenterDeviation > 14) {
    return {
      level: "danger",
      text: t.warningPostureInstability ?? "Serious posture instability detected",
    };
  }
  if (metrics.trunkInclination > 8) {
    return {
      level: "alert",
      text: t.warningTrunkDeviation ?? "Trunk deviation increased",
    };
  }
  if (metrics.shoulderAsymmetry > 6 || metrics.hipAsymmetry > 6 || metrics.bodyCenterDeviation > 9) {
    return {
      level: "warning",
      text: t.warningModeratePostureDeviation ?? "Moderate posture deviation detected",
    };
  }
  return {
    level: "stable",
    text: t.warningWithinRange ?? "Within supervised range",
  };
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}
