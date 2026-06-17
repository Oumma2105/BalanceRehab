const landmarks = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
};

export function calculatePostureMetrics(input, t = {}) {
  const { holistic, tracking } = normalizeHolisticInput(input);
  const poseLandmarks = holistic.pose;
  if (!Array.isArray(poseLandmarks) || poseLandmarks.length < 25) return null;

  const leftShoulder = poseLandmarks[landmarks.leftShoulder];
  const rightShoulder = poseLandmarks[landmarks.rightShoulder];
  const leftHip = poseLandmarks[landmarks.leftHip];
  const rightHip = poseLandmarks[landmarks.rightHip];
  const leftEar = poseLandmarks[landmarks.leftEar];
  const rightEar = poseLandmarks[landmarks.rightEar];
  const required = [leftShoulder, rightShoulder, leftHip, rightHip];

  if (required.some((point) => !point || point.visibility < 0.35)) return null;

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);
  const headCenter = calculateHeadCenter(poseLandmarks, holistic.face);
  const torsoDx = shoulderMid.x - hipMid.x;
  const torsoDy = Math.max(0.001, Math.abs(shoulderMid.y - hipMid.y));
  const signedTrunkInclination = round1(Math.atan2(torsoDx, torsoDy) * (180 / Math.PI));
  const trunkInclination = round1(Math.abs(signedTrunkInclination));
  const shoulderAsymmetry = round1(Math.abs(leftShoulder.y - rightShoulder.y) * 100);
  const hipAsymmetry = round1(Math.abs(leftHip.y - rightHip.y) * 100);
  const pelvicTilt = round1(
    Math.atan2(Math.abs(leftHip.y - rightHip.y), Math.max(0.001, Math.abs(leftHip.x - rightHip.x))) * (180 / Math.PI)
  );
  const headTilt = (isVisible(leftEar) && isVisible(rightEar))
    ? round1(Math.atan2(Math.abs(leftEar.y - rightEar.y), Math.max(0.001, Math.abs(leftEar.x - rightEar.x))) * (180 / Math.PI))
    : null;
  const bodyCenter = {
    x: (shoulderMid.x + hipMid.x) / 2,
    y: (shoulderMid.y + hipMid.y) / 2,
  };
  const signedBodyCenterDeviation = round1((bodyCenter.x - 0.5) * 100);
  const bodyCenterDeviation = round1(Math.abs(signedBodyCenterDeviation));
  const armSymmetry = calculateArmSymmetry(poseLandmarks);
  const armCompensation = calculateArmCompensation(poseLandmarks, shoulderMid, hipMid);
  const postureScore = clamp(
    Math.round(100 - trunkInclination * 2.1 - shoulderAsymmetry * 1.4 - hipAsymmetry * 1.2 - bodyCenterDeviation * 0.8),
    35,
    99,
  );

  const alignmentScore = clamp(Math.round(100 - trunkInclination * 2.5 - bodyCenterDeviation * 1.1), 35, 99);
  const symmetryScore = clamp(Math.round(100 - shoulderAsymmetry * 2 - hipAsymmetry * 1.8 - (armSymmetry ?? 0) * 0.6), 35, 99);
  const stabilityScore = clamp(Math.round(postureScore * 0.6 + alignmentScore * 0.25 + symmetryScore * 0.15), 35, 99);

  return {
    trunkInclination,
    signedTrunkInclination,
    trunkDeviation: trunkInclination,
    shoulderAsymmetry,
    hipAsymmetry,
    bodyCenterDeviation,
    signedBodyCenterDeviation,
    bodyCenter,
    shoulderCenter: shoulderMid,
    hipCenter: hipMid,
    headCenter,
    postureScore,
    stabilityScore,
    alignmentScore,
    symmetryScore,
    posturalControlScore: stabilityScore,
    trunkControlScore: alignmentScore,
    armSymmetry,
    armDrift: armCompensation?.armDrift ?? null,
    handArmCompensation: armCompensation?.handArmCompensation ?? null,
    handCompensationSide: armCompensation?.side ?? null,
    trunkRotation: null,
    pelvicTilt,
    headTilt,
    headRotation: null,
    headForwardPosture: null,
    chinDeviation: null,
    eyeAlignment: null,
    swayAmplitude: null,
    swayVelocity: null,
    directionalSway: null,
    landmarkCount: countLandmarks(holistic),
    bodyLandmarkCount: holistic.pose.length,
    faceLandmarkCount: holistic.face.length,
    leftHandLandmarkCount: holistic.leftHand.length,
    rightHandLandmarkCount: holistic.rightHand.length,
    bodyDetected: tracking.bodyDetected,
    faceDetected: tracking.faceDetected,
    leftHandDetected: tracking.leftHandDetected,
    rightHandDetected: tracking.rightHandDetected,
    handsDetected: tracking.leftHandDetected || tracking.rightHandDetected,
    engines: {
      pose: true,
      face: true,
      hands: true,
      bodyDetected: tracking.bodyDetected,
      faceDetected: tracking.faceDetected,
      leftHandDetected: tracking.leftHandDetected,
      rightHandDetected: tracking.rightHandDetected,
      handsDetected: tracking.leftHandDetected || tracking.rightHandDetected,
      fps: tracking.fps ?? 0,
    },
    readiness: {
      body: tracking.bodyDetected ? "detected" : "missing",
      face: tracking.faceDetected ? "detected" : "missing",
      leftHand: tracking.leftHandDetected ? "detected" : "missing",
      rightHand: tracking.rightHandDetected ? "detected" : "missing",
      fps: tracking.fps ?? 0,
    },
    rawLandmarks: holistic,
    warning: postureWarning({ trunkInclination, shoulderAsymmetry, hipAsymmetry, bodyCenterDeviation }, t),
    timestamp: Date.now(),
  };
}

function normalizeHolisticInput(input) {
  if (Array.isArray(input)) {
    return {
      holistic: {
        pose: input,
        poseWorld: [],
        face: [],
        faceBlendshapes: [],
        leftHand: [],
        leftHandWorld: [],
        rightHand: [],
        rightHandWorld: [],
      },
      tracking: {
        bodyDetected: input.length > 0,
        faceDetected: false,
        leftHandDetected: false,
        rightHandDetected: false,
        fps: 0,
      },
    };
  }

  const holistic = input?.holistic ?? {};
  return {
    holistic: {
      pose: safeLandmarks(holistic.pose),
      poseWorld: safeLandmarks(holistic.poseWorld),
      face: safeLandmarks(holistic.face),
      faceBlendshapes: Array.isArray(holistic.faceBlendshapes) ? holistic.faceBlendshapes : [],
      leftHand: safeLandmarks(holistic.leftHand),
      leftHandWorld: safeLandmarks(holistic.leftHandWorld),
      rightHand: safeLandmarks(holistic.rightHand),
      rightHandWorld: safeLandmarks(holistic.rightHandWorld),
    },
    tracking: {
      bodyDetected: Boolean(input?.tracking?.bodyDetected ?? holistic.pose?.length),
      faceDetected: Boolean(input?.tracking?.faceDetected ?? holistic.face?.length),
      leftHandDetected: Boolean(input?.tracking?.leftHandDetected ?? holistic.leftHand?.length),
      rightHandDetected: Boolean(input?.tracking?.rightHandDetected ?? holistic.rightHand?.length),
      fps: input?.tracking?.fps ?? 0,
    },
  };
}

function calculateArmSymmetry(poseLandmarks) {
  const leftWrist = poseLandmarks[landmarks.leftWrist];
  const rightWrist = poseLandmarks[landmarks.rightWrist];
  if (!isVisible(leftWrist) || !isVisible(rightWrist)) return null;
  return round1(Math.abs(leftWrist.y - rightWrist.y) * 100);
}

function calculateArmCompensation(poseLandmarks, shoulderMid, hipMid) {
  const leftWrist = poseLandmarks[landmarks.leftWrist];
  const rightWrist = poseLandmarks[landmarks.rightWrist];
  const leftElbow = poseLandmarks[landmarks.leftElbow];
  const rightElbow = poseLandmarks[landmarks.rightElbow];
  const torsoHeight = Math.max(0.001, Math.abs(shoulderMid.y - hipMid.y));
  const visibleWrists = [
    { side: "left", point: leftWrist, elbow: leftElbow },
    { side: "right", point: rightWrist, elbow: rightElbow },
  ].filter((item) => isVisible(item.point));

  if (!visibleWrists.length) return null;

  const scores = visibleWrists.map((item) => {
    const lateralReach = Math.abs(item.point.x - shoulderMid.x) / torsoHeight;
    const handHeight = Math.max(0, (hipMid.y - item.point.y) / torsoHeight);
    const elbowLift = isVisible(item.elbow) ? Math.max(0, (hipMid.y - item.elbow.y) / torsoHeight) : 0;
    return {
      side: item.side,
      score: round1(clamp((lateralReach * 22 + handHeight * 18 + elbowLift * 8), 0, 100)),
    };
  });

  const maxScore = scores.reduce((best, item) => (item.score > best.score ? item : best), scores[0]);
  const averageScore = scores.reduce((sum, item) => sum + item.score, 0) / scores.length;
  return {
    armDrift: round1(averageScore),
    handArmCompensation: maxScore.score,
    side: maxScore.side,
  };
}

function calculateHeadCenter(poseLandmarks, faceLandmarks) {
  const nose = poseLandmarks[landmarks.nose];
  const leftEar = poseLandmarks[landmarks.leftEar];
  const rightEar = poseLandmarks[landmarks.rightEar];
  if (isVisible(leftEar) && isVisible(rightEar)) return midpoint(leftEar, rightEar);
  if (isVisible(nose)) return { x: nose.x, y: nose.y, z: nose.z ?? 0 };
  if (Array.isArray(faceLandmarks) && faceLandmarks.length) {
    const visible = faceLandmarks.filter(Boolean);
    return visible.length ? centroid(visible) : null;
  }
  return null;
}

function countLandmarks(holistic) {
  return holistic.pose.length + holistic.face.length + holistic.leftHand.length + holistic.rightHand.length;
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

function safeLandmarks(value) {
  return Array.isArray(value) ? value : [];
}

function isVisible(point) {
  return point && (point.visibility == null || point.visibility > 0.35);
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
  };
}

function centroid(points) {
  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
      z: sum.z + (point.z ?? 0),
    }),
    { x: 0, y: 0, z: 0 },
  );
  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: total.z / points.length,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

// Future clinical and balance-support metrics can be added here once validation
// data is available. Keep new metrics descriptive and avoid diagnostic claims.
