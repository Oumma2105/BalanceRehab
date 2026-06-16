import { acquisitionModeLabels, acquisitionModes, normalizeAssessmentResults } from "../assessmentModel.js";
import { acquisitionLabel, generateInterpretation, generateLiveFrame, generateRecommendations } from "../../utils/assessment.js";
import { webcamVideoConstraints } from "../../webcam/webcamConfig.js";

export class WebcamAssessmentSource {
  constructor({ config, t }) {
    this.config = config;
    this.t = t;
    this.stream = null;
    this.latestPoseMetrics = null;
    this.poseSamples = [];
  }

  async start() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error(this.t.webcamUnavailable ?? "Webcam access is not available in this browser.");
    }

    this.latestPoseMetrics = null;
    this.poseSamples = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: webcamVideoConstraints,
      audio: false,
    });

    return this.stream;
  }

  getFrame(progress) {
    const fallbackFrame = generateLiveFrame(progress, this.t, acquisitionModes.webcam);
    if (!this.latestPoseMetrics) {
      return {
        ...fallbackFrame,
        stability: null,
        posture: null,
        trunkInclination: null,
        shoulderAsymmetry: null,
        hipAsymmetry: null,
        bodyCenterDeviation: null,
        warning: this.t.poseNotDetected ?? "Pose not detected",
        warningLevel: "warning",
        landmarkCount: 0,
      };
    }

    return {
      ...fallbackFrame,
      stability: this.latestPoseMetrics.stabilityScore ?? this.latestPoseMetrics.postureScore,
      posture: this.latestPoseMetrics.postureScore,
      trunkInclination: this.latestPoseMetrics.trunkInclination,
      shoulderAsymmetry: this.latestPoseMetrics.shoulderAsymmetry,
      hipAsymmetry: this.latestPoseMetrics.hipAsymmetry,
      bodyCenterDeviation: this.latestPoseMetrics.bodyCenterDeviation,
      warning: this.latestPoseMetrics.warning?.text ?? fallbackFrame.warning,
      warningLevel: this.latestPoseMetrics.warning?.level ?? "stable",
      landmarkCount: this.latestPoseMetrics.landmarkCount ?? 0,
    };
  }

  getResults() {
    if (!this.poseSamples.length) {
      return normalizeAssessmentResults(this.noPoseResults());
    }

    const quality = summarizeTrackingQuality(this.poseSamples, this.config.durationSeconds);
    if (!quality.sufficient) {
      return normalizeAssessmentResults(this.insufficientTrackingResults(quality));
    }

    const movement = summarizeWebcamMovement(this.poseSamples, this.config.durationSeconds);
    const postureSymmetry = clamp(round1(100 - averageValues([average(this.poseSamples, "shoulderAsymmetry") * 7, average(this.poseSamples, "hipAsymmetry") * 7, nullableAverage(this.poseSamples, "armSymmetry") ?? 0])), 0, 100);
    const compensation = round1(nullableAverage(this.poseSamples, "handArmCompensation") ?? nullableAverage(this.poseSamples, "armDrift") ?? 0);
    const smoothnessScore = movement.movementSmoothnessScore;
    const stabilityScore = clamp(Math.round(
      100
      - movement.estimatedBodySway * 5.2
      - movement.bodySwayVelocity * 2.1
      - average(this.poseSamples, "trunkInclination") * 1.8
      - compensation * 0.28
      - (100 - smoothnessScore) * 0.18,
    ), 0, 100);
    const postureStabilityScore = clamp(Math.round(
      stabilityScore * 0.45
      + postureSymmetry * 0.25
      + movement.movementSmoothnessScore * 0.2
      + (100 - compensation) * 0.1,
    ), 0, 100);
    const alignmentScore = Math.round(average(this.poseSamples, "alignmentScore"));
    const symmetryScore = clamp(Math.round(postureSymmetry), 0, 100);
    const posturalControlScore = Math.round(average(this.poseSamples, "posturalControlScore"));
    const trunkControlScore = Math.round(average(this.poseSamples, "trunkControlScore"));
    const totalBalanceScore = Math.round((postureStabilityScore * 0.45 + stabilityScore * 0.35 + alignmentScore * 0.1 + symmetryScore * 0.1));
    const lastSample = this.poseSamples[this.poseSamples.length - 1];
    const engineCoverage = summarizeEngineCoverage(this.poseSamples);
    const metrics = {
      acquisitionMode: acquisitionModes.webcam,
      acquisitionLabel: acquisitionLabel(acquisitionModes.webcam, this.t),
      availableMetrics: {
        posture: true,
        board: false,
      },
      metricLabel: this.t.estimatedWebcamIndicators ?? "Estimated webcam-based indicators",
      trackingQuality: quality,
      totalBalanceScore,
      boardStabilityScore: null,
      postureStabilityScore,
      stabilityScore,
      alignmentScore,
      symmetryScore,
      posturalControlScore,
      trunkControlScore,
      meanSwayAp: null,
      meanSwayMl: null,
      maxSwayAp: null,
      maxSwayMl: null,
      estimatedBodySway: movement.estimatedBodySway,
      shoulderCenterMovement: movement.shoulderCenterMovement,
      hipCenterMovement: movement.hipCenterMovement,
      headMovement: movement.headMovement,
      postureSymmetry,
      handArmCompensation: compensation,
      movementSmoothness: movement.movementSmoothness,
      movementSmoothnessScore: smoothnessScore,
      bodySwayVelocity: movement.bodySwayVelocity,
      swayAmplitude: movement.estimatedBodySway,
      swayVelocity: movement.bodySwayVelocity,
      directionalSway: movement.directionalSway,
      instabilityEvents: null,
      trunkDeviation: round1(average(this.poseSamples, "trunkInclination")),
      trunkInclination: round1(average(this.poseSamples, "trunkInclination")),
      trunkRotation: nullableAverage(this.poseSamples, "trunkRotation"),
      shoulderAsymmetry: round1(average(this.poseSamples, "shoulderAsymmetry")),
      hipAsymmetry: round1(average(this.poseSamples, "hipAsymmetry")),
      pelvicTilt: nullableAverage(this.poseSamples, "pelvicTilt"),
      headTilt: nullableAverage(this.poseSamples, "headTilt"),
      headRotation: nullableAverage(this.poseSamples, "headRotation"),
      headForwardPosture: nullableAverage(this.poseSamples, "headForwardPosture"),
      chinDeviation: nullableAverage(this.poseSamples, "chinDeviation"),
      eyeAlignment: nullableAverage(this.poseSamples, "eyeAlignment"),
      armSymmetry: nullableAverage(this.poseSamples, "armSymmetry"),
      armDrift: nullableAverage(this.poseSamples, "armDrift"),
      weightShiftEstimation: nullableAverage(this.poseSamples, "weightShiftEstimation"),
      bodyCenterDeviation: round1(average(this.poseSamples, "bodyCenterDeviation")),
      minPostureScore: min(this.poseSamples, "postureScore"),
      maxPostureScore: max(this.poseSamples, "postureScore"),
      minStabilityScore: min(this.poseSamples, "stabilityScore"),
      maxStabilityScore: max(this.poseSamples, "stabilityScore"),
      postureWarnings: uniqueWarnings(this.poseSamples, this.t),
      engineCoverage,
      webcamIndicatorSummary: movement,
      boardUnavailableReason: this.t.notAvailableWebcamOnly ?? "Not available in webcam-only mode",
      rawLandmarkSamples: this.poseSamples.map((sample) => ({
        t: sample.elapsedSeconds,
        timestamp: sample.timestamp,
        landmarks: sample.rawLandmarks,
        engines: sample.engines,
        quality: sample.readiness,
      })),
      samples: this.poseSamples.slice(-60).map((sample, index) => ({
        t: sample.elapsedSeconds ?? index,
        ap: null,
        ml: null,
        posture: sample.postureScore,
        stability: sample.stabilityScore,
        alignment: sample.alignmentScore,
        symmetry: sample.symmetryScore,
        posturalControl: sample.posturalControlScore,
        trunkInclination: sample.trunkInclination,
        trunkDeviation: sample.trunkInclination,
        signedTrunkInclination: sample.signedTrunkInclination,
        trunkRotation: sample.trunkRotation,
        shoulderAsymmetry: sample.shoulderAsymmetry,
        hipAsymmetry: sample.hipAsymmetry,
        pelvicTilt: sample.pelvicTilt,
        headTilt: sample.headTilt,
        headRotation: sample.headRotation,
        armSymmetry: sample.armSymmetry,
        armDrift: sample.armDrift,
        bodyCenterDeviation: sample.bodyCenterDeviation,
        signedBodyCenterDeviation: sample.signedBodyCenterDeviation,
        bodyCenterX: sample.bodyCenter?.x,
        bodyCenterY: sample.bodyCenter?.y,
        shoulderCenterX: sample.shoulderCenter?.x,
        shoulderCenterY: sample.shoulderCenter?.y,
        hipCenterX: sample.hipCenter?.x,
        hipCenterY: sample.hipCenter?.y,
        headCenterX: sample.headCenter?.x,
        headCenterY: sample.headCenter?.y,
        handArmCompensation: sample.handArmCompensation,
        estimatedBodySway: movement.sampleBodySway[index] ?? null,
        swayAmplitude: sample.swayAmplitude,
        swayVelocity: sample.swayVelocity,
        faceDetected: sample.faceDetected,
        bodyDetected: sample.bodyDetected,
        leftHandDetected: sample.leftHandDetected,
        rightHandDetected: sample.rightHandDetected,
        handsDetected: sample.handsDetected,
      })),
    };

    const status = scoreStatus(metrics.totalBalanceScore);
    const finalMetrics = {
      ...metrics,
      status,
    };

    return normalizeAssessmentResults({
      ...finalMetrics,
      interpretation: generateInterpretation(finalMetrics, this.config, this.t),
      recommendations: generateRecommendations(finalMetrics, this.config, this.t),
    });
  }

  stop() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    return true;
  }

  getStream() {
    return this.stream;
  }

  recordPoseMetrics(metrics) {
    if (!metrics) return;
    const sample = this.createPoseSample(metrics);
    this.latestPoseMetrics = sample;
    this.poseSamples.push(sample);
    if (this.poseSamples.length > 1200) {
      this.poseSamples = this.poseSamples.slice(-1200);
    }
  }

  previewPoseMetrics(metrics) {
    if (!metrics) return;
    this.latestPoseMetrics = {
      ...metrics,
      elapsedSeconds: this.poseSamples.length ? round1((metrics.timestamp - this.poseSamples[0].timestamp) / 1000) : 0,
    };
  }

  createPoseSample(metrics) {
    return {
      ...metrics,
      elapsedSeconds: this.poseSamples.length ? round1((metrics.timestamp - this.poseSamples[0].timestamp) / 1000) : 0,
    };
  }

  noPoseResults() {
    const metrics = {
      acquisitionMode: acquisitionModes.webcam,
      acquisitionLabel: acquisitionLabel(acquisitionModes.webcam, this.t),
      availableMetrics: {
        posture: false,
        board: false,
      },
      metricLabel: this.t.estimatedWebcamIndicators ?? "Estimated webcam-based indicators",
      trackingQuality: {
        sufficient: false,
        sampleCount: 0,
        sampleRate: 0,
        usablePercent: 0,
        spanSeconds: 0,
        message: "tracking quality insufficient",
      },
      totalBalanceScore: 0,
      boardStabilityScore: null,
      postureStabilityScore: 0,
      stabilityScore: 0,
      meanSwayAp: null,
      meanSwayMl: null,
      maxSwayAp: null,
      maxSwayMl: null,
      swayVelocity: null,
      instabilityEvents: null,
      trunkDeviation: null,
      trunkInclination: null,
      shoulderAsymmetry: null,
      hipAsymmetry: null,
      bodyCenterDeviation: null,
      postureWarnings: [this.t.poseNotDetectedResult ?? "Pose was not detected during the assessment."],
      boardUnavailableReason: this.t.notAvailableWebcamOnly ?? "Not available in webcam-only mode",
      status: "High instability",
      samples: [],
    };

    return {
      ...metrics,
      interpretation: this.t.poseNotDetectedResult ?? "Pose was not detected during the assessment. Please repeat the webcam-based assessment with the patient fully visible.",
      recommendations: [
        this.t.poseNotDetectedRecommendation ?? "Repeat the assessment with the full body visible in the camera frame.",
      ],
    };
  }

  insufficientTrackingResults(quality) {
    const message = this.t.trackingQualityInsufficient ?? "Tracking quality insufficient";
    const metrics = {
      acquisitionMode: acquisitionModes.webcam,
      acquisitionLabel: acquisitionLabel(acquisitionModes.webcam, this.t),
      availableMetrics: {
        posture: false,
        board: false,
      },
      metricLabel: this.t.estimatedWebcamIndicators ?? "Estimated webcam-based indicators",
      trackingQuality: quality,
      totalBalanceScore: 0,
      boardStabilityScore: null,
      postureStabilityScore: 0,
      stabilityScore: 0,
      meanSwayAp: null,
      meanSwayMl: null,
      maxSwayAp: null,
      maxSwayMl: null,
      swayVelocity: null,
      instabilityEvents: null,
      trunkDeviation: null,
      trunkInclination: null,
      shoulderAsymmetry: null,
      hipAsymmetry: null,
      bodyCenterDeviation: null,
      estimatedBodySway: null,
      shoulderCenterMovement: null,
      hipCenterMovement: null,
      headMovement: null,
      postureSymmetry: null,
      handArmCompensation: null,
      movementSmoothness: null,
      movementSmoothnessScore: null,
      postureWarnings: [message],
      engineCoverage: summarizeEngineCoverage(this.poseSamples),
      boardUnavailableReason: this.t.notAvailableWebcamOnly ?? "Not available in webcam-only mode",
      status: message,
      samples: this.poseSamples.slice(-60).map((sample, index) => ({
        t: sample.elapsedSeconds ?? index,
        posture: null,
        stability: null,
        bodyCenterDeviation: sample.bodyCenterDeviation,
        signedBodyCenterDeviation: sample.signedBodyCenterDeviation,
        bodyCenterX: sample.bodyCenter?.x,
        bodyCenterY: sample.bodyCenter?.y,
      })),
    };

    return {
      ...metrics,
      interpretation: message,
      recommendations: [
        this.t.repeatWebcamAssessmentForTracking ?? "Repeat the webcam assessment with the full body visible and steady lighting.",
      ],
    };
  }

  static metadata(t = {}) {
    return {
      mode: acquisitionModes.webcam,
      label: t.webcamAssessmentMode ?? acquisitionModeLabels[acquisitionModes.webcam],
      description: t.webcamAssessmentModeDesc ?? "Laptop webcam with MediaPipe Holistic landmarks as the primary source.",
      availableNow: true,
    };
  }
}

function average(samples, key) {
  const values = samples.map((sample) => sample[key]).filter((value) => Number.isFinite(value));
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function nullableAverage(samples, key) {
  const values = samples.map((sample) => sample[key]).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function min(samples, key) {
  const values = samples.map((sample) => sample[key]).filter((value) => Number.isFinite(value));
  return values.length ? round1(Math.min(...values)) : null;
}

function max(samples, key) {
  const values = samples.map((sample) => sample[key]).filter((value) => Number.isFinite(value));
  return values.length ? round1(Math.max(...values)) : null;
}

function uniqueWarnings(samples, t = {}) {
  const warnings = samples.map((sample) => sample.warning?.text).filter(Boolean);
  const unique = [...new Set(warnings)];
  return unique.length ? unique.slice(0, 3) : [t.warningWithinRange ?? "Within supervised range"];
}

function summarizeEngineCoverage(samples) {
  const total = samples.length || 1;
  const faceFrames = samples.filter((sample) => sample.engines?.faceDetected || sample.faceDetected).length;
  const leftHandFrames = samples.filter((sample) => sample.engines?.leftHandDetected || sample.leftHandDetected).length;
  const rightHandFrames = samples.filter((sample) => sample.engines?.rightHandDetected || sample.rightHandDetected).length;
  const handFrames = samples.filter((sample) => sample.engines?.handsDetected || sample.handsDetected || sample.leftHandDetected || sample.rightHandDetected).length;
  const poseFrames = samples.filter((sample) => sample.engines?.bodyDetected || sample.bodyDetected || sample.bodyLandmarkCount > 0).length;
  return {
    pose: {
      available: true,
      detectedPercent: Math.round((poseFrames / total) * 100),
    },
    face: {
      available: samples.some((sample) => sample.engines?.face),
      detectedPercent: Math.round((faceFrames / total) * 100),
    },
    hands: {
      available: samples.some((sample) => sample.engines?.hands),
      detectedPercent: Math.round((handFrames / total) * 100),
    },
    leftHand: {
      available: samples.some((sample) => sample.engines?.hands),
      detectedPercent: Math.round((leftHandFrames / total) * 100),
    },
    rightHand: {
      available: samples.some((sample) => sample.engines?.hands),
      detectedPercent: Math.round((rightHandFrames / total) * 100),
    },
  };
}

function scoreStatus(score) {
  if (score >= 80) return "Stable";
  if (score >= 65) return "Moderate instability";
  return "High instability";
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function summarizeTrackingQuality(samples, durationSeconds = 30) {
  const sampleCount = samples.length;
  const duration = Math.max(1, Number(durationSeconds) || 30);
  const minSamples = Math.min(20, Math.max(8, duration * 2));
  const spanSeconds = Math.max(0, samples[samples.length - 1]?.elapsedSeconds ?? 0);
  const sampleRate = round1(sampleCount / duration);
  const poseUsableFrames = samples.filter((sample) => sample.bodyDetected && sample.bodyCenter && sample.shoulderCenter && sample.hipCenter).length;
  const usablePercent = Math.round((poseUsableFrames / Math.max(1, sampleCount)) * 100);
  const sufficient = sampleCount >= minSamples && sampleRate >= 2 && usablePercent >= 80 && spanSeconds >= Math.max(1, duration * 0.45);
  return {
    sufficient,
    sampleCount,
    sampleRate,
    usablePercent,
    spanSeconds: round1(spanSeconds),
    message: sufficient ? "OK" : "tracking quality insufficient",
  };
}

function summarizeWebcamMovement(samples, durationSeconds = 30) {
  const body = movementStats(samples, "bodyCenter");
  const shoulder = movementStats(samples, "shoulderCenter");
  const hip = movementStats(samples, "hipCenter");
  const head = movementStats(samples, "headCenter");
  const duration = Math.max(1, Number(durationSeconds) || 30);
  const estimatedBodySway = body.rms;
  const bodySwayVelocity = round1(body.path / duration);
  const movementSmoothness = round1((body.smoothness + shoulder.smoothness + hip.smoothness + head.smoothness) / 4);
  const movementSmoothnessScore = clamp(Math.round(100 - movementSmoothness * 12), 0, 100);

  return {
    estimatedBodySway,
    shoulderCenterMovement: shoulder.range,
    hipCenterMovement: hip.range,
    headMovement: head.range,
    bodySwayVelocity,
    movementSmoothness,
    movementSmoothnessScore,
    directionalSway: Math.abs(body.rangeX) >= Math.abs(body.rangeY) ? "ML" : "AP",
    sampleBodySway: body.sampleDistances,
  };
}

function movementStats(samples, key) {
  const points = samples.map((sample) => sample[key]).filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length < 2) {
    return { range: null, rangeX: 0, rangeY: 0, path: 0, rms: null, smoothness: 0, sampleDistances: [] };
  }

  const baseline = points[0];
  const distances = points.map((point) => distance(point, baseline) * 100);
  const xs = points.map((point) => point.x * 100);
  const ys = points.map((point) => point.y * 100);
  const velocities = points.slice(1).map((point, index) => distance(point, points[index]) * 100);
  const accelerations = velocities.slice(1).map((value, index) => Math.abs(value - velocities[index]));
  const rangeX = Math.max(...xs) - Math.min(...xs);
  const rangeY = Math.max(...ys) - Math.min(...ys);

  return {
    range: round1(Math.hypot(rangeX, rangeY)),
    rangeX: round1(rangeX),
    rangeY: round1(rangeY),
    path: round1(velocities.reduce((sum, value) => sum + value, 0)),
    rms: round1(Math.sqrt(distances.reduce((sum, value) => sum + value * value, 0) / distances.length)),
    smoothness: round1(accelerations.length ? averageArray(accelerations) : 0),
    sampleDistances: distances.map(round1),
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function averageArray(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function averageValues(values) {
  return averageArray(values);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
