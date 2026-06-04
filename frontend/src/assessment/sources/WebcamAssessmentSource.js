import { acquisitionModeLabels, acquisitionModes, normalizeAssessmentResults } from "../assessmentModel.js";
import { generateInterpretation, generateLiveFrame, generateRecommendations, simulateAssessmentResults } from "../../utils/assessment.js";
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

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: webcamVideoConstraints,
      audio: false,
    });

    return this.stream;
  }

  getFrame(progress) {
    const fallbackFrame = generateLiveFrame(progress, this.t, acquisitionModes.webcam);
    if (!this.latestPoseMetrics) return fallbackFrame;

    return {
      ...fallbackFrame,
      stability: this.latestPoseMetrics.postureScore,
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
    const simulated = simulateAssessmentResults(
      {
        ...this.config,
        acquisitionMode: acquisitionModes.webcam,
      },
      this.t,
    );

    if (!this.poseSamples.length) {
      return normalizeAssessmentResults(simulated);
    }

    const postureStabilityScore = Math.round(average(this.poseSamples, "postureScore"));
    const metrics = {
      ...simulated,
      totalBalanceScore: postureStabilityScore,
      postureStabilityScore,
      trunkDeviation: round1(average(this.poseSamples, "trunkInclination")),
      trunkInclination: round1(average(this.poseSamples, "trunkInclination")),
      shoulderAsymmetry: round1(average(this.poseSamples, "shoulderAsymmetry")),
      hipAsymmetry: round1(average(this.poseSamples, "hipAsymmetry")),
      bodyCenterDeviation: round1(average(this.poseSamples, "bodyCenterDeviation")),
      postureWarnings: uniqueWarnings(this.poseSamples, this.t),
      samples: this.poseSamples.slice(-60).map((sample, index) => ({
        t: index,
        ap: null,
        ml: null,
        posture: sample.postureScore,
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
    this.latestPoseMetrics = metrics;
    this.poseSamples.push(metrics);
    if (this.poseSamples.length > 240) {
      this.poseSamples = this.poseSamples.slice(-240);
    }
  }

  static metadata(t = {}) {
    return {
      mode: acquisitionModes.webcam,
      label: t.webcamAssessmentMode ?? acquisitionModeLabels[acquisitionModes.webcam],
      description: t.webcamAssessmentModeDesc ?? "Laptop webcam with MediaPipe Pose landmarks as the primary source.",
      availableNow: true,
    };
  }
}

function average(samples, key) {
  const values = samples.map((sample) => sample[key]).filter((value) => Number.isFinite(value));
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function uniqueWarnings(samples, t = {}) {
  const warnings = samples.map((sample) => sample.warning?.text).filter(Boolean);
  const unique = [...new Set(warnings)];
  return unique.length ? unique.slice(0, 3) : [t.warningWithinRange ?? "Within supervised range"];
}

function scoreStatus(score) {
  if (score >= 80) return "Stable";
  if (score >= 65) return "Moderate instability";
  return "High instability";
}

function round1(value) {
  return Math.round(value * 10) / 10;
}
