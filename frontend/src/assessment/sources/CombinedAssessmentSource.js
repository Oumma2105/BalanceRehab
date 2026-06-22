import { API_WS_BASE_URL, api } from "../../api/client.js";
import { acquisitionModeLabels, acquisitionModes, normalizeAssessmentResults } from "../assessmentModel.js";
import { acquisitionLabel, generateInterpretation, generateRecommendations } from "../../utils/assessment.js";
import { WebcamAssessmentSource } from "./WebcamAssessmentSource.js";

export class CombinedAssessmentSource extends WebcamAssessmentSource {
  constructor({ config, t }) {
    super({ config, t });
    this.boardSocket = null;
    this.boardSamples = [];
    this.backendSession = null;
    this.boardStatus = "disconnected";
    this.boardError = "";
    this.boardStartedAtMs = null;
    this.serialPollTimer = null;
  }

  async start() {
    const stream = await super.start();
    this.boardSamples = [];
    this.backendSession = null;
    this.boardStatus = "connecting";
    this.boardError = "";
    this.boardStartedAtMs = null;

    if (!this.config.patientId) {
      this.boardStatus = "missing_patient";
      this.boardError = "Patient is required before starting combined acquisition.";
      return stream;
    }

    try {
      this.backendSession = await api.createSession({
        patientId: this.config.patientId,
        acquisitionModeKey: acquisitionModes.combined,
        testType: this.config.testType === "dynamic" ? "Dynamic" : "Static",
        supportRing: this.config.testType === "dynamic" ? "Removed" : "Installed",
        condition: this.config.visualCondition === "eyes_closed" ? "Eyes closed" : "Eyes open",
        durationSeconds: this.config.durationSeconds,
        notes: this.config.notes,
        status: null,
        totalScore: null,
        boardScore: null,
        postureScore: null,
        results: {
          acquisitionMode: acquisitionModes.combined,
          recommendations: [],
          samples: [],
        },
      });
      await this.openPreferredBoardStream(this.backendSession.id);
    } catch (error) {
      console.warn("Combined board session could not be created.", error);
      this.boardStatus = "error";
      this.boardError = "Could not create live board session.";
    }

    return stream;
  }

  async openPreferredBoardStream(sessionId) {
    try {
      const serialStatus = await api.esp32Status();
      if (serialStatus.connected) {
        try {
          await api.esp32Zero();
        } catch (error) {
          console.warn("ESP32 zero baseline could not be applied at combined assessment start.", error);
        }
        await api.esp32AttachSession(sessionId);
        this.boardStatus = serialStatus.status ?? "connected";
        this.boardError = serialStatus.error ?? "";
        this.serialPollTimer = window.setInterval(() => this.pollSerialBoard(), 250);
        return;
      }
    } catch (error) {
      console.warn("ESP32 serial status could not be checked; using board WebSocket fallback.", error);
    }
    this.openBoardSocket(sessionId);
  }

  async pollSerialBoard() {
    try {
      const state = await api.esp32Status();
      this.boardStatus = state.status ?? (state.connected ? "connected" : "disconnected");
      this.boardError = state.error ?? "";
      if (state.latest_packet) {
        this.recordBoardPacket({ ...state.latest_packet, ...(state.latest_result ?? {}) });
      }
    } catch (error) {
      this.boardStatus = "error";
      this.boardError = "ESP32 USB serial status is unavailable.";
    }
  }

  openBoardSocket(sessionId) {
    if (!sessionId || typeof WebSocket === "undefined") return;
    const socket = new WebSocket(`${API_WS_BASE_URL}/ws/board/${sessionId}`);
    this.boardSocket = socket;

    socket.addEventListener("open", () => {
      this.boardStatus = "connected";
      this.boardError = "";
    });

    socket.addEventListener("message", (event) => {
      try {
        const packet = JSON.parse(event.data);
        if (packet.error) {
          this.boardStatus = "error";
          this.boardError = packet.error;
          return;
        }
        this.recordBoardPacket(packet);
      } catch (error) {
        console.warn("Board packet could not be parsed.", error);
      }
    });

    socket.addEventListener("close", () => {
      if (this.boardStatus !== "error") this.boardStatus = "disconnected";
    });

    socket.addEventListener("error", () => {
      this.boardStatus = "error";
      this.boardError = "Board WebSocket connection failed.";
    });
  }

  recordBoardPacket(packet) {
    const timestampMs = Number(packet.timestamp_ms ?? packet.t ?? Date.now());
    if (this.boardStartedAtMs == null) this.boardStartedAtMs = timestampMs;
    const elapsedSeconds = round1((timestampMs - this.boardStartedAtMs) / 1000);
    const sample = {
      t: elapsedSeconds,
      timestampMs,
      fl: finiteOrNull(packet.front_left ?? packet.fl),
      fr: finiteOrNull(packet.front_right ?? packet.fr),
      rl: finiteOrNull(packet.rear_left ?? packet.rl),
      rr: finiteOrNull(packet.rear_right ?? packet.rr),
      ap: finiteOrNull(packet.ap ?? packet.anterior_posterior_sway),
      ml: finiteOrNull(packet.ml ?? packet.medial_lateral_sway),
      resultant: finiteOrNull(packet.resultant_sway ?? packet.resultant),
      stability: finiteOrNull(packet.stability ?? packet.stability_score),
      quality: packet.quality ?? null,
      boardMetrics: packet.session_metrics ?? null,
    };
    this.boardSamples.push(sample);
    if (this.boardSamples.length > 1200) {
      this.boardSamples = this.boardSamples.slice(-1200);
    }
  }

  getFrame(progress) {
    const frame = super.getFrame(progress);
    const latestBoard = this.boardSamples[this.boardSamples.length - 1] ?? null;
    const latestMetrics = latestBoard?.boardMetrics;
    const boardScore = latestMetrics?.board_stability_score ?? latestBoard?.stability ?? null;
    const postureScore = frame.posture ?? frame.stability ?? null;
    const combinedScore = boardScore != null && postureScore != null
      ? Math.round(boardScore * 0.6 + postureScore * 0.4)
      : frame.stability;

    return {
      ...frame,
      acquisitionMode: acquisitionModes.combined,
      acquisitionLabel: acquisitionLabel(acquisitionModes.combined, this.t),
      stability: combinedScore,
      boardStatus: this.boardStatus,
      boardError: this.boardError,
      boardSessionId: this.backendSession?.id ?? null,
      boardSampleCount: this.boardSamples.length,
      apSway: latestBoard?.ap ?? null,
      mlSway: latestBoard?.ml ?? null,
      boardStability: boardScore,
      boardSamples: this.boardSamples.slice(-120),
      warning: boardWarning(latestBoard, frame.warning, this.t),
    };
  }

  getResults() {
    const webcamResults = super.getResults();
    const boardSummary = summarizeBoardSamples(this.boardSamples);
    const boardAvailable = this.boardSamples.length > 0 && boardSummary.boardStabilityScore != null;
    const totalBalanceScore = boardAvailable
      ? Math.round(boardSummary.boardStabilityScore * 0.6 + webcamResults.postureStabilityScore * 0.4)
      : webcamResults.totalBalanceScore;
    const metrics = {
      ...webcamResults,
      acquisitionMode: acquisitionModes.combined,
      acquisitionLabel: acquisitionLabel(acquisitionModes.combined, this.t),
      backendSessionId: this.backendSession?.id ?? null,
      availableMetrics: {
        posture: Boolean(webcamResults.availableMetrics?.posture),
        board: boardAvailable,
      },
      totalBalanceScore,
      boardStabilityScore: boardSummary.boardStabilityScore,
      postureStabilityScore: webcamResults.postureStabilityScore,
      meanSwayAp: boardSummary.meanSwayAp,
      meanSwayMl: boardSummary.meanSwayMl,
      maxSwayAp: boardSummary.maxSwayAp,
      maxSwayMl: boardSummary.maxSwayMl,
      meanResultantSway: boardSummary.meanResultantSway,
      maxResultantSway: boardSummary.maxResultantSway,
      rmsSway: boardSummary.rmsSway,
      pathLength: boardSummary.pathLength,
      swayVelocity: boardSummary.swayVelocity,
      instabilityEvents: boardSummary.instabilityEvents,
      sensorQuality: boardSummary.sensorQuality,
      boardUnavailableReason: boardAvailable ? null : "ESP32 board stream was not received during this assessment.",
      postureSamples: webcamResults.samples ?? [],
      sensorSamples: this.boardSamples.slice(),
      samples: mergeSamplesBySecond(webcamResults.samples ?? [], this.boardSamples),
    };
    const status = scoreStatus(totalBalanceScore);
    const finalMetrics = { ...metrics, status };
    return normalizeAssessmentResults({
      ...finalMetrics,
      interpretation: generateInterpretation(finalMetrics, this.config, this.t),
      recommendations: generateRecommendations(finalMetrics, this.config, this.t),
    });
  }

  stop() {
    if (this.boardSocket) {
      this.boardSocket.close();
      this.boardSocket = null;
    }
    if (this.serialPollTimer) {
      window.clearInterval(this.serialPollTimer);
      this.serialPollTimer = null;
      api.esp32AttachSession(null).catch(() => {});
    }
    this.boardStatus = "disconnected";
    return super.stop();
  }

  static metadata(t = {}) {
    return {
      mode: acquisitionModes.combined,
      label: t.combinedAssessmentMode ?? acquisitionModeLabels[acquisitionModes.combined],
      description: t.combinedAssessmentModeDesc ?? "Synchronized MediaPipe posture tracking and ESP32 board sensor acquisition.",
      availableNow: true,
    };
  }
}

function summarizeBoardSamples(samples) {
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

function mergeSamplesBySecond(postureSamples, boardSamples) {
  const merged = new Map();
  postureSamples.forEach((sample, index) => {
    const second = Math.round(Number(sample.t ?? index));
    merged.set(second, { ...sample, t: second });
  });
  boardSamples.forEach((sample) => {
    const second = Math.round(Number(sample.t ?? 0));
    merged.set(second, {
      ...(merged.get(second) ?? { t: second }),
      ap: sample.ap,
      ml: sample.ml,
      stability: sample.stability ?? merged.get(second)?.stability,
    });
  });
  return [...merged.values()].sort((a, b) => Number(a.t) - Number(b.t)).slice(-120);
}

function boardWarning(sample, fallback, t = {}) {
  if (!sample) return t.waitingForBoardStream ?? "Waiting for ESP32 board stream";
  if ((sample.stability ?? 100) < 65) return t.warningHighLateralSway ?? "High lateral sway detected";
  if (Math.hypot(sample.ap ?? 0, sample.ml ?? 0) > 16) return t.warningHighLateralSway ?? "High lateral sway detected";
  return fallback;
}

function average(values) {
  if (!values.length) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function maxAbs(values) {
  return values.length ? round1(Math.max(...values.map(Math.abs))) : null;
}

function swayVelocity(samples) {
  let distance = 0;
  let seconds = 0;
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (![previous.ap, previous.ml, current.ap, current.ml].every(Number.isFinite)) continue;
    const dt = Math.max(0, Number(current.t) - Number(previous.t));
    if (dt <= 0) continue;
    seconds += dt;
    distance += Math.hypot(current.ap - previous.ap, current.ml - previous.ml);
  }
  return seconds > 0 ? round1(distance / seconds) : 0;
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

function scoreFromResultant(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, round1(100 - value * 2.2)));
}

function finiteOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function finite(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function round1(value) {
  return Math.round(finite(value) * 10) / 10;
}

function scoreStatus(score) {
  if (score >= 80) return "Stable";
  if (score >= 65) return "Moderate instability";
  return "High instability";
}
