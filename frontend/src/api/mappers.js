import { acquisitionLabel } from "../utils/assessment.js";

export function patientFromApi(patient) {
  return {
    id: patient.id,
    patientId: patient.patient_code,
    patientCode: patient.patient_code,
    fullName: patient.full_name,
    age: patient.age,
    sex: patient.sex,
    heightCm: patient.height_cm,
    weightKg: patient.weight_kg,
    dominantSide: patient.dominant_side,
    pathology: patient.pathology,
    clinicalGoal: patient.clinical_goal,
    clinicalNotes: patient.clinical_notes,
    notes: patient.clinical_notes,
    latestScore: patient.latest_score,
    lastAssessmentDate: formatDateTime(patient.last_assessment_date),
    status: patient.status,
    createdAt: patient.created_at,
    updatedAt: patient.updated_at,
  };
}

export function patientToApi(patient) {
  return {
    patient_code: patient.patientCode ?? patient.patientId ?? null,
    full_name: patient.fullName,
    age: patient.age ? Number(patient.age) : null,
    sex: patient.sex ?? null,
    height_cm: patient.heightCm ? Number(patient.heightCm) : null,
    weight_kg: patient.weightKg ? Number(patient.weightKg) : null,
    dominant_side: patient.dominantSide || null,
    pathology: patient.pathology || null,
    clinical_goal: patient.clinicalGoal || null,
    clinical_notes: patient.clinicalNotes || patient.notes || null,
  };
}

export function patientUpdateToApi(patient) {
  const payload = patientToApi(patient);
  delete payload.patient_code;
  return payload;
}

export function sessionFromApi(session, patientLookup = new Map()) {
  const patient = patientLookup.get(session.patient_id);
  const recommendations = (session.recommendations ?? []).map((item) => item.recommendation_en);
  const isBoardAvailable = session.board_stability_score != null;
  const acquisitionMode = session.acquisition_mode ?? "webcam";

  return {
    id: session.id,
    sessionId: `S-${session.id}`,
    patientId: session.patient_id,
    patient: patient?.fullName ?? patient?.full_name ?? "",
    patientCode: patient?.patientCode ?? patient?.patient_code ?? "",
    date: formatDateTime(session.created_at),
    dateISO: session.created_at,
    testType: titleCase(session.test_type),
    supportRing: session.support_ring === "removed" ? "Removed" : "Installed",
    condition: session.visual_condition === "eyes_closed" ? "Eyes closed" : "Eyes open",
    visionCondition: session.visual_condition === "eyes_closed" ? "Eyes closed" : "Eyes open",
    durationSeconds: session.duration_seconds,
    notes: session.notes,
    acquisitionMode: acquisitionLabel(acquisitionMode, {}),
    acquisitionModeKey: acquisitionMode,
    status: session.status,
    totalScore: session.total_balance_score,
    boardScore: session.board_stability_score,
    postureScore: session.posture_stability_score,
    results: {
      acquisitionMode,
      acquisitionLabel: acquisitionLabel(acquisitionMode, {}),
      availableMetrics: {
        posture: true,
        board: isBoardAvailable,
      },
      totalBalanceScore: session.total_balance_score,
      boardStabilityScore: session.board_stability_score,
      postureStabilityScore: session.posture_stability_score,
      meanSwayAp: session.mean_sway_ap,
      meanSwayMl: session.mean_sway_ml,
      maxSwayAp: session.max_sway_ap,
      maxSwayMl: session.max_sway_ml,
      meanResultantSway: session.mean_resultant_sway,
      maxResultantSway: session.max_resultant_sway,
      rmsSway: session.rms_sway,
      pathLength: session.path_length,
      sensorQuality: session.sensor_quality,
      swayVelocity: session.sway_velocity,
      instabilityEvents: session.instability_events,
      trunkDeviation: session.trunk_deviation,
      trunkInclination: session.trunk_deviation,
      shoulderAsymmetry: session.shoulder_asymmetry,
      hipAsymmetry: session.hip_asymmetry,
      bodyCenterDeviation: session.body_center_deviation,
      status: apiStatusToResultStatus(session.status),
      interpretation: session.interpretation,
      recommendations,
      samples: mergeApiSamples(session.posture_samples ?? [], session.sensor_samples ?? []),
      sensorSamples: (session.sensor_samples ?? []).map((sample, index) => ({
        t: Math.round((sample.timestamp_ms ?? index * 1000) / 1000),
        timestampMs: sample.timestamp_ms,
        fl: sample.front_left,
        fr: sample.front_right,
        rl: sample.rear_left,
        rr: sample.rear_right,
        ap: sample.anterior_posterior_sway,
        ml: sample.medial_lateral_sway,
        resultant: resultant(sample.anterior_posterior_sway, sample.medial_lateral_sway),
        stability: sample.stability_score,
      })),
      postureSamples: (session.posture_samples ?? []).map((sample, index) => ({
        t: Math.round((sample.timestamp_ms ?? index * 1000) / 1000),
        timestampMs: sample.timestamp_ms,
        ap: null,
        ml: null,
        apSwayProxy: webcamApProxyFromSample(sample),
        mlSwayProxy: webcamMlProxyFromSample(sample),
        posture: sample.posture_score,
        stability: sample.stability_score,
        trunkInclination: sample.trunk_inclination,
        trunkDeviation: sample.trunk_inclination,
        shoulderAsymmetry: sample.shoulder_asymmetry,
        hipAsymmetry: sample.hip_asymmetry,
        bodyCenterDeviation: sample.body_center_deviation,
        bodyCenterX: sample.body_center_x,
        bodyCenterY: sample.body_center_y,
        shoulderCenterX: sample.shoulder_center_x,
        shoulderCenterY: sample.shoulder_center_y,
        hipCenterX: sample.hip_center_x,
        hipCenterY: sample.hip_center_y,
        headCenterX: sample.head_center_x,
        headCenterY: sample.head_center_y,
        estimatedBodySway: sample.estimated_body_sway,
        handArmCompensation: sample.hand_arm_compensation,
        movementLabel: sample.movement_label,
        movementIntent: sample.movement_intent,
        labelConfidence: sample.label_confidence,
      })),
    },
  };
}

export function sessionToApi(session) {
  const results = session.results ?? {};
  const acquisitionMode = session.acquisitionModeKey ?? results.acquisitionMode ?? "webcam";
  const postureSourceSamples = Array.isArray(results.postureSamples) && results.postureSamples.length
    ? results.postureSamples
    : results.samples ?? [];
  const sensorSourceSamples = Array.isArray(results.sensorSamples) && results.sensorSamples.length
    ? results.sensorSamples
    : results.samples ?? [];
  const canSendSensorSamples = acquisitionMode === "board" || acquisitionMode === "combined" || acquisitionMode === "demo";

  return {
    patient_id: session.patientId,
    acquisition_mode: acquisitionMode,
    is_demo: acquisitionMode === "demo",
    test_type: String(session.testType ?? "").toLowerCase() === "dynamic" ? "dynamic" : "static",
    support_ring: String(session.supportRing ?? "").toLowerCase() === "removed" ? "removed" : "installed",
    visual_condition: String(session.condition ?? "").toLowerCase().includes("closed") ? "eyes_closed" : "eyes_open",
    duration_seconds: session.durationSeconds ?? 30,
    notes: session.notes ?? null,
    status: session.status,
    total_balance_score: session.totalScore ?? results.totalBalanceScore ?? null,
    board_stability_score: session.boardScore ?? results.boardStabilityScore ?? null,
    posture_stability_score: session.postureScore ?? results.postureStabilityScore ?? null,
    mean_sway_ap: results.meanSwayAp ?? null,
    mean_sway_ml: results.meanSwayMl ?? null,
    max_sway_ap: results.maxSwayAp ?? null,
    max_sway_ml: results.maxSwayMl ?? null,
    mean_resultant_sway: results.meanResultantSway ?? null,
    max_resultant_sway: results.maxResultantSway ?? null,
    rms_sway: results.rmsSway ?? null,
    path_length: results.pathLength ?? null,
    sensor_quality: results.sensorQuality ?? null,
    sway_velocity: results.swayVelocity ?? null,
    instability_events: results.instabilityEvents ?? null,
    trunk_deviation: results.trunkDeviation ?? results.trunkInclination ?? null,
    shoulder_asymmetry: results.shoulderAsymmetry ?? null,
    hip_asymmetry: results.hipAsymmetry ?? null,
    body_center_deviation: results.bodyCenterDeviation ?? null,
    interpretation: session.interpretation ?? session.clinician_impression ?? results.interpretation ?? null,
    posture_samples: postureSourceSamples
      .filter((sample) => sample.posture != null || sample.postureScore != null || sample.trunkInclination != null || sample.trunkDeviation != null || sample.bodyCenterX != null)
      .map((sample, index) => ({
        timestamp_ms: Number.isFinite(Number(sample.timestampMs)) ? Math.round(Number(sample.timestampMs)) : Math.round((sample.t ?? index) * 1000),
        trunk_inclination: sample.trunkInclination ?? sample.trunkDeviation ?? results.trunkDeviation ?? results.trunkInclination ?? null,
        shoulder_asymmetry: sample.shoulderAsymmetry ?? results.shoulderAsymmetry ?? null,
        hip_asymmetry: sample.hipAsymmetry ?? results.hipAsymmetry ?? null,
        body_center_deviation: sample.bodyCenterDeviation ?? results.bodyCenterDeviation ?? null,
        posture_score: sample.posture ?? sample.postureScore ?? session.postureScore ?? null,
        stability_score: sample.stability ?? sample.stabilityScore ?? results.stabilityScore ?? null,
        body_center_x: sample.bodyCenterX ?? null,
        body_center_y: sample.bodyCenterY ?? null,
        shoulder_center_x: sample.shoulderCenterX ?? null,
        shoulder_center_y: sample.shoulderCenterY ?? null,
        hip_center_x: sample.hipCenterX ?? null,
        hip_center_y: sample.hipCenterY ?? null,
        head_center_x: sample.headCenterX ?? null,
        head_center_y: sample.headCenterY ?? null,
        estimated_body_sway: sample.estimatedBodySway ?? null,
        hand_arm_compensation: sample.handArmCompensation ?? null,
        movement_label: sample.movementLabel ?? null,
        movement_intent: sample.movementIntent ?? null,
        label_confidence: sample.labelConfidence ?? null,
        raw_landmarks_json: sample.rawLandmarks ? JSON.stringify(sample.rawLandmarks) : null,
      })),
    sensor_samples: canSendSensorSamples ? sensorSourceSamples
      .filter((sample) => sample.ap != null || sample.ml != null || sample.anteriorPosteriorSway != null || sample.medialLateralSway != null || sample.fl != null || sample.frontLeft != null || sample.front_left != null)
      .map((sample, index) => ({
        timestamp_ms: Number.isFinite(Number(sample.timestampMs)) ? Math.round(Number(sample.timestampMs)) : Math.round((sample.t ?? index) * 1000),
        anterior_posterior_sway: sample.ap ?? sample.anteriorPosteriorSway ?? sample.anterior_posterior_sway ?? null,
        medial_lateral_sway: sample.ml ?? sample.medialLateralSway ?? sample.medial_lateral_sway ?? null,
        stability_score: sample.stability ?? null,
        front_left: sample.fl ?? sample.frontLeft ?? sample.front_left ?? null,
        front_right: sample.fr ?? sample.frontRight ?? sample.front_right ?? null,
        rear_left: sample.rl ?? sample.rearLeft ?? sample.rear_left ?? null,
        rear_right: sample.rr ?? sample.rearRight ?? sample.rear_right ?? null,
      })) : [],
    recommendations: (results.recommendations ?? []).map((text) => ({
      category: "rehabilitation",
      recommendation_en: text,
      recommendation_fr: text,
      priority: "medium",
    })),
  };
}

export function reportFromApi(report) {
  return {
    id: report.report_id,
    reportId: report.report_id,
    patientId: report.patient_id,
    sessionId: report.session_id,
    createdAt: report.generated_at,
    generatedAt: formatDateTime(report.generated_at),
    downloadable: report.downloadable,
    language: String(report.language ?? "en").toUpperCase(),
    acquisitionMode: report.acquisition_mode,
    summary: report.summary,
    reportFilePath: report.report_file_path,
  };
}

export function reportToApi(report) {
  return {
    session_id: Number(report.sessionId),
    report_file_path: report.reportFilePath ?? null,
    language: String(report.language ?? "en").toLowerCase() === "fr" ? "fr" : "en",
    acquisition_mode: report.acquisitionModeKey ?? report.acquisitionMode ?? "webcam",
    summary: report.summary ?? null,
  };
}

export function reportDataFromApi(reportData) {
  const patient = patientFromApi(reportData.patient);
  const session = sessionFromApi(reportData.session, new Map([[patient.id, patient]]));

  return {
    patient,
    session,
    boardMetricsAvailable: reportData.board_metrics_available,
    acquisitionModeLabel: reportData.acquisition_mode_label,
    clinicalImpression: reportData.clinical_impression,
    recommendations: reportData.recommendations ?? [],
  };
}

export function rehabSessionFromApi(session) {
  return {
    id: session.id,
    patientId: session.patient_id,
    gameType: session.game_type,
    difficulty: session.difficulty,
    durationSeconds: session.duration_seconds,
    acquisitionMode: session.acquisition_mode,
    score: session.score,
    accuracy: session.accuracy,
    stability: session.stability,
    smoothness: session.smoothness,
    reactionTimeMs: session.reaction_time_ms,
    successRate: session.success_rate,
    trackingQuality: session.tracking_quality,
    exits: session.exits,
    targetsHit: session.targets_hit,
    targetsMissed: session.targets_missed,
    samples: parseJsonArray(session.samples_json),
    createdAt: session.created_at,
  };
}

export function rehabSessionToApi(session) {
  return {
    patient_id: session.patientId,
    game_type: session.gameType,
    difficulty: session.difficulty ?? "medium",
    duration_seconds: session.durationSeconds ?? 60,
    acquisition_mode: session.acquisitionMode ?? "webcam",
    score: session.score ?? null,
    accuracy: session.accuracy ?? null,
    stability: session.stability ?? null,
    smoothness: session.smoothness ?? null,
    reaction_time_ms: session.reactionTimeMs ?? null,
    success_rate: session.successRate ?? null,
    tracking_quality: session.trackingQuality ?? null,
    exits: session.exits ?? null,
    targets_hit: session.targetsHit ?? session.successfulTargets ?? null,
    targets_missed: session.targetsMissed ?? session.missedTargets ?? null,
    samples_json: session.samples ? JSON.stringify(session.samples.slice(-600)) : null,
  };
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function apiStatusToResultStatus(status) {
  if (status === "Stable" || status === "Improving") return "Stable";
  if (status === "Follow-up") return "Moderate instability";
  if (status === "Declining") return "High instability";
  return status ?? "Stable";
}

function mergeApiSamples(postureSamples, sensorSamples) {
  const merged = new Map();
  postureSamples.forEach((sample, index) => {
    const second = Math.round((sample.timestamp_ms ?? index * 1000) / 1000);
    merged.set(second, {
      t: second,
      ap: null,
      ml: null,
      posture: sample.posture_score,
      stability: sample.stability_score,
      trunkInclination: sample.trunk_inclination,
      trunkDeviation: sample.trunk_inclination,
      shoulderAsymmetry: sample.shoulder_asymmetry,
      hipAsymmetry: sample.hip_asymmetry,
      bodyCenterDeviation: sample.body_center_deviation,
      bodyCenterX: sample.body_center_x,
      bodyCenterY: sample.body_center_y,
      shoulderCenterX: sample.shoulder_center_x,
      shoulderCenterY: sample.shoulder_center_y,
      hipCenterX: sample.hip_center_x,
      hipCenterY: sample.hip_center_y,
      headCenterX: sample.head_center_x,
      headCenterY: sample.head_center_y,
      estimatedBodySway: sample.estimated_body_sway,
      apSwayProxy: webcamApProxyFromSample(sample),
      mlSwayProxy: webcamMlProxyFromSample(sample),
      handArmCompensation: sample.hand_arm_compensation,
      movementLabel: sample.movement_label,
      movementIntent: sample.movement_intent,
      labelConfidence: sample.label_confidence,
    });
  });
  sensorSamples.forEach((sample, index) => {
    const second = Math.round((sample.timestamp_ms ?? index * 1000) / 1000);
    merged.set(second, {
      ...(merged.get(second) ?? { t: second, posture: null }),
      fl: sample.front_left,
      fr: sample.front_right,
      rl: sample.rear_left,
      rr: sample.rear_right,
      ap: sample.anterior_posterior_sway,
      ml: sample.medial_lateral_sway,
      resultant: resultant(sample.anterior_posterior_sway, sample.medial_lateral_sway),
      stability: sample.stability_score ?? merged.get(second)?.stability,
    });
  });
  return [...merged.values()].sort((a, b) => Number(a.t) - Number(b.t));
}

function resultant(ap, ml) {
  const a = Number(ap);
  const m = Number(ml);
  return Number.isFinite(a) && Number.isFinite(m) ? Math.round(Math.hypot(a, m) * 10) / 10 : null;
}

function webcamApProxyFromSample(sample = {}) {
  return firstFinite(
    sample.ap_sway_proxy,
    sample.body_center_y != null ? (0.5 - Number(sample.body_center_y)) * 22 : null,
    sample.hip_center_y != null ? (0.5 - Number(sample.hip_center_y)) * 22 : null,
    sample.shoulder_center_y != null ? (0.5 - Number(sample.shoulder_center_y)) * 18 : null,
    sample.trunk_inclination != null ? Number(sample.trunk_inclination) * 0.45 : null,
  );
}

function webcamMlProxyFromSample(sample = {}) {
  return firstFinite(
    sample.ml_sway_proxy,
    sample.body_center_x != null ? (Number(sample.body_center_x) - 0.5) * 22 : null,
    sample.hip_center_x != null ? (Number(sample.hip_center_x) - 0.5) * 22 : null,
    sample.shoulder_center_x != null ? (Number(sample.shoulder_center_x) - 0.5) * 18 : null,
    sample.shoulder_asymmetry != null ? Number(sample.shoulder_asymmetry) * 0.35 : null,
  );
}

function firstFinite(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return Math.round(numeric * 10) / 10;
  }
  return null;
}

function titleCase(value) {
  const normalized = String(value ?? "");
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "";
}

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
