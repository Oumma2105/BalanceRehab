import { api } from "../../api/client.js";
import { acquisitionModeLabels, acquisitionModes, normalizeAssessmentResults } from "../assessmentModel.js";
import { acquisitionLabel, generateInterpretation, generateRecommendations } from "../../utils/assessment.js";

export class BoardAssessmentSource {
  constructor({ config, t }) {
    this.config = config;
    this.t = t;
    this.backendSession = null;
    this.samples = [];
    this.status = "disconnected";
    this.error = "";
    this.pollTimer = null;
    this.startedAtMs = null;
  }

  async start() {
    this.samples = [];
    this.status = "connecting";
    this.error = "";
    this.startedAtMs = null;

    if (!this.config.patientId) {
      this.status = "missing_patient";
      this.error = "Patient is required before starting ESP32 acquisition.";
      return null;
    }

    try {
      await api.esp32Zero();
    } catch (error) {
      console.warn("ESP32 zero baseline could not be applied at assessment start.", error);
    }

    this.backendSession = await api.createSession({
      patientId: this.config.patientId,
      acquisitionModeKey: acquisitionModes.board,
      testType: this.config.testType === "dynamic" ? "Dynamic" : "Static",
      supportRing: this.config.testType === "dynamic" ? "Removed" : "Installed",
      condition: this.config.visualCondition === "eyes_closed" ? "Eyes closed" : "Eyes open",
      durationSeconds: this.config.durationSeconds,
      notes: this.config.notes,
      status: null,
      totalScore: null,
      boardScore: null,
      postureScore: null,
      results: { acquisitionMode: acquisitionModes.board, samples: [], recommendations: [] },
    });

    await api.esp32AttachSession(this.backendSession.id);
    await this.pollStatus();
    this.pollTimer = window.setInterval(() => this.pollStatus(), 250);
    return null;
  }

  async pollStatus() {
    try {
      const state = await api.esp32Status();
      this.status = state.status ?? (state.connected ? "connected" : "disconnected");
      this.error = state.error ?? "";
      const packet = state.latest_packet;
      if (packet) this.recordPacket(packet, state.latest_result);
    } catch (error) {
      this.status = "error";
      this.error = "ESP32 serial status is unavailable.";
    }
  }

  recordPacket(packet, result) {
    const timestampMs = Number(packet.timestamp_ms ?? packet.t ?? Date.now());
    if (this.startedAtMs == null) this.startedAtMs = timestampMs;
    const elapsedSeconds = round1((timestampMs - this.startedAtMs) / 1000);
    const last = this.samples[this.samples.length - 1];
    if (last?.timestampMs === timestampMs) return;

    this.samples.push({
      t: elapsedSeconds,
      timestampMs,
      fl: finiteOrNull(packet.front_left ?? packet.fl),
      fr: finiteOrNull(packet.front_right ?? packet.fr),
      rl: finiteOrNull(packet.rear_left ?? packet.rl),
      rr: finiteOrNull(packet.rear_right ?? packet.rr),
      ap: finiteOrNull(packet.anterior_posterior_sway ?? packet.ap),
      ml: finiteOrNull(packet.medial_lateral_sway ?? packet.ml),
      resultant: finiteOrNull(packet.resultant_sway),
      stability: finiteOrNull(result?.stability ?? packet.stability_score),
      quality: packet.quality ?? null,
    });
    if (this.samples.length > 2000) this.samples = this.samples.slice(-2000);
  }

  getFrame() {
    const latest = this.samples[this.samples.length - 1] ?? null;
    const summary = summarizeBoardSamples(this.samples);
    return {
      acquisitionMode: acquisitionModes.board,
      acquisitionLabel: acquisitionLabel(acquisitionModes.board, this.t),
      stability: summary.boardStabilityScore ?? latest?.stability ?? null,
      boardStatus: this.status,
      boardError: this.error,
      boardSessionId: this.backendSession?.id ?? null,
      boardSampleCount: this.samples.length,
      apSway: latest?.ap ?? null,
      mlSway: latest?.ml ?? null,
      boardStability: summary.boardStabilityScore ?? latest?.stability ?? null,
      boardSamples: this.samples.slice(-120),
      posture: null,
      warning: boardWarning(latest, this.status, this.t),
    };
  }

  getResults() {
    const summary = summarizeBoardSamples(this.samples);
    const boardAvailable = this.samples.length > 0 && summary.boardStabilityScore != null;
    const metrics = {
      acquisitionMode: acquisitionModes.board,
      acquisitionLabel: acquisitionLabel(acquisitionModes.board, this.t),
      backendSessionId: this.backendSession?.id ?? null,
      availableMetrics: { posture: false, board: boardAvailable },
      totalBalanceScore: summary.boardStabilityScore,
      boardStabilityScore: summary.boardStabilityScore,
      postureStabilityScore: null,
      ...summary,
      boardUnavailableReason: boardAvailable ? null : "ESP32 USB serial stream was not received during this assessment.",
      samples: this.samples.slice(),
      status: scoreStatus(summary.boardStabilityScore),
    };
    return normalizeAssessmentResults({
      ...metrics,
      interpretation: generateInterpretation(metrics, this.config, this.t),
      recommendations: generateRecommendations(metrics, this.config, this.t),
    });
  }

  stop() {
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    api.esp32AttachSession(null).catch(() => {});
    this.status = "disconnected";
    return true;
  }

  getStream() {
    return null;
  }

  static metadata(t = {}) {
    return {
      mode: acquisitionModes.board,
      label: t.boardAssessmentMode ?? acquisitionModeLabels[acquisitionModes.board],
      description: t.boardAssessmentModeDesc ?? "USB serial ESP32 board acquisition using four ultrasonic distance sensors.",
      availableNow: true,
    };
  }
}

export function summarizeBoardSamples(samples) {
  const clean = samples.filter((sample) => Number.isFinite(sample.ap) && Number.isFinite(sample.ml));
  const apValues = clean.map((sample) => sample.ap);
  const mlValues = clean.map((sample) => sample.ml);
  const resultantValues = clean.map((sample) => Number.isFinite(sample.resultant) ? sample.resultant : Math.hypot(sample.ap, sample.ml));
  const stabilityValues = samples.map((sample) => sample.stability).filter(Number.isFinite);
  const pathLength = computePathLength(clean);
  const duration = clean.length > 1 ? Math.max(0, clean[clean.length - 1].t - clean[0].t) : 0;
  return {
    boardStabilityScore: average(stabilityValues) ?? scoreFromResultant(average(resultantValues)),
    meanSwayAp: average(apValues.map(Math.abs)),
    meanSwayMl: average(mlValues.map(Math.abs)),
    maxSwayAp: maxAbs(apValues),
    maxSwayMl: maxAbs(mlValues),
    meanResultantSway: average(resultantValues),
    maxResultantSway: maxAbs(resultantValues),
    rmsSway: resultantValues.length ? round1(Math.sqrt(resultantValues.reduce((sum, value) => sum + value * value, 0) / resultantValues.length)) : null,
    pathLength: round1(pathLength),
    swayVelocity: duration > 0 ? round1(pathLength / duration) : 0,
    instabilityEvents: countInstabilityEvents(clean),
    sensorQuality: average(stabilityValues),
  };
}

function computePathLength(samples) {
  let distance = 0;
  for (let index = 1; index < samples.length; index++) {
    distance += Math.hypot(samples[index].ap - samples[index - 1].ap, samples[index].ml - samples[index - 1].ml);
  }
  return distance;
}

function countInstabilityEvents(samples) {
  let events = 0;
  let inEvent = false;
  samples.forEach((sample) => {
    const unstable = (sample.stability ?? 100) < 65 || Math.hypot(sample.ap ?? 0, sample.ml ?? 0) > 16;
    if (unstable && !inEvent) events++;
    inEvent = unstable;
  });
  return events;
}

function boardWarning(sample, status, t = {}) {
  if (status === "calibrating") return t.calibrating ?? "Calibrating baseline";
  if (!sample) return t.waitingForBoardStream ?? "Waiting for ESP32 board stream";
  if ((sample.stability ?? 100) < 65 || Math.hypot(sample.ap ?? 0, sample.ml ?? 0) > 16) return t.warningHighLateralSway ?? "High sway detected";
  return t.warningWithinRange ?? "Within supervised range";
}

function scoreFromResultant(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, round1(100 - value * 2.2)));
}

function scoreStatus(score) {
  if (!Number.isFinite(score)) return "High instability";
  if (score >= 80) return "Stable";
  if (score >= 65) return "Moderate instability";
  return "High instability";
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? round1(clean.reduce((sum, value) => sum + value, 0) / clean.length) : null;
}

function maxAbs(values) {
  return values.length ? round1(Math.max(...values.map(Math.abs))) : null;
}

function finiteOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function round1(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 10) / 10 : null;
}
