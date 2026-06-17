from __future__ import annotations

import math
from statistics import mean, pstdev

from app.models import MovementLabel, PostureSample, Session
from app.services.movement_model import predict_intent_model


INTENT_NOTE = (
    "Experimental rules-only intent estimate. It is not a trained or clinically "
    "validated classifier; use clinician labels to build and validate a real model."
)


def build_movement_feature_payload(session: Session) -> dict:
    samples = sorted(session.posture_samples, key=lambda sample: sample.timestamp_ms)
    labels = list(session.movement_labels)
    quality = tracking_quality(samples, session.duration_seconds)
    features = extract_features(samples, session.duration_seconds)
    intent_estimate, confidence, model_status = estimate_intent(features, quality, labels)

    return {
        "session_id": session.id,
        "model_status": model_status,
        "intent_estimate": intent_estimate,
        "intent_confidence": confidence,
        "tracking_quality": quality,
        "features": features,
        "training_ready": quality["sufficient"] and len(labels) > 0,
        "labels_count": len(labels),
        "note": INTENT_NOTE,
    }


def tracking_quality(samples: list[PostureSample], duration_seconds: int | None) -> dict:
    duration = max(float(duration_seconds or 30), 1.0)
    usable = [
        sample
        for sample in samples
        if sample.body_center_x is not None
        and sample.body_center_y is not None
        and sample.shoulder_center_x is not None
        and sample.hip_center_x is not None
    ]
    span_seconds = ((samples[-1].timestamp_ms - samples[0].timestamp_ms) / 1000) if len(samples) > 1 else 0
    usable_percent = round((len(usable) / max(len(samples), 1)) * 100)
    sample_rate = round(len(samples) / duration, 2)
    sufficient = len(samples) >= 20 and usable_percent >= 80 and sample_rate >= 2 and span_seconds >= duration * 0.45
    return {
        "sufficient": sufficient,
        "sample_count": len(samples),
        "usable_percent": usable_percent,
        "sample_rate_hz": sample_rate,
        "span_seconds": round(span_seconds, 2),
        "message": "OK" if sufficient else "tracking quality insufficient",
    }


def extract_features(samples: list[PostureSample], duration_seconds: int | None) -> dict:
    duration = max(float(duration_seconds or 30), 1.0)
    body_points = points(samples, "body_center_x", "body_center_y")
    shoulder_points = points(samples, "shoulder_center_x", "shoulder_center_y")
    hip_points = points(samples, "hip_center_x", "hip_center_y")
    head_points = points(samples, "head_center_x", "head_center_y")
    body_distances = distances_from_first(body_points)
    body_steps = step_distances(body_points)
    body_accel = differences(body_steps)
    trunk_values = finite_values(sample.trunk_inclination for sample in samples)
    shoulder_values = finite_values(sample.shoulder_asymmetry for sample in samples)
    hip_values = finite_values(sample.hip_asymmetry for sample in samples)
    compensation_values = finite_values(sample.hand_arm_compensation for sample in samples)

    return {
        "estimated_body_sway": rounded(rms(body_distances)),
        "body_sway_path": rounded(sum(body_steps)),
        "body_sway_velocity": rounded(sum(body_steps) / duration),
        "shoulder_center_movement": rounded(point_range(shoulder_points)),
        "hip_center_movement": rounded(point_range(hip_points)),
        "head_movement": rounded(point_range(head_points)),
        "movement_smoothness": rounded(mean_abs(body_accel)),
        "movement_jerk": rounded(pstdev(body_accel) if len(body_accel) > 1 else 0),
        "dominant_frequency_hz": rounded(estimate_dominant_frequency(body_distances, duration)),
        "mean_trunk_inclination": rounded(mean_or_none(trunk_values)),
        "mean_shoulder_asymmetry": rounded(mean_or_none(shoulder_values)),
        "mean_hip_asymmetry": rounded(mean_or_none(hip_values)),
        "posture_symmetry": rounded(posture_symmetry(shoulder_values, hip_values)),
        "hand_arm_compensation": rounded(mean_or_none(compensation_values)),
    }


def estimate_intent(features: dict, quality: dict, labels: list[MovementLabel]) -> tuple[str, float | None, str]:
    if not quality["sufficient"]:
        return "unknown", None, "insufficient_tracking_quality"
    if labels:
        voluntary = sum(1 for label in labels if label.intent == "voluntary" or label.label == "voluntary")
        involuntary = sum(1 for label in labels if label.intent == "involuntary" or label.label == "involuntary")
        if voluntary > involuntary:
            return "voluntary", round(voluntary / len(labels), 2), "clinician_labeled"
        if involuntary > voluntary:
            return "involuntary", round(involuntary / len(labels), 2), "clinician_labeled"

    model_prediction = predict_intent_model(features)
    if model_prediction is not None:
        return model_prediction

    frequency = numeric(features.get("dominant_frequency_hz"))
    jerk = numeric(features.get("movement_jerk"))
    smoothness = numeric(features.get("movement_smoothness"))
    compensation = numeric(features.get("hand_arm_compensation"))
    sway_velocity = numeric(features.get("body_sway_velocity"))
    symmetry = numeric(features.get("posture_symmetry"))

    involuntary_score = 0.0
    voluntary_score = 0.0

    if frequency is not None and frequency >= 0.9:
        involuntary_score += min(0.35, frequency * 0.12)
    if jerk is not None and jerk >= 0.18:
        involuntary_score += min(0.25, jerk * 0.4)
    if smoothness is not None and smoothness >= 0.18:
        involuntary_score += min(0.2, smoothness * 0.35)
    if symmetry is not None and symmetry < 72:
        involuntary_score += 0.08

    if compensation is not None and compensation >= 18:
        voluntary_score += min(0.3, compensation / 120)
    if sway_velocity is not None and 0.6 <= sway_velocity <= 4.5:
        voluntary_score += 0.16
    if frequency is not None and frequency < 0.7:
        voluntary_score += 0.16
    if smoothness is not None and smoothness < 0.22:
        voluntary_score += 0.12

    if involuntary_score < 0.18 and voluntary_score < 0.18:
        return "unknown", 0.25, "experimental_rules_only"
    if involuntary_score > voluntary_score:
        return "involuntary", round(min(0.68, 0.35 + involuntary_score - voluntary_score), 2), "experimental_rules_only"
    return "voluntary", round(min(0.68, 0.35 + voluntary_score - involuntary_score), 2), "experimental_rules_only"


def points(samples: list[PostureSample], x_key: str, y_key: str) -> list[tuple[float, float]]:
    result: list[tuple[float, float]] = []
    for sample in samples:
        x = getattr(sample, x_key)
        y = getattr(sample, y_key)
        if x is not None and y is not None:
            result.append((float(x) * 100, float(y) * 100))
    return result


def distances_from_first(points_: list[tuple[float, float]]) -> list[float]:
    if not points_:
        return []
    first = points_[0]
    return [distance(point, first) for point in points_]


def step_distances(points_: list[tuple[float, float]]) -> list[float]:
    return [distance(points_[index], points_[index - 1]) for index in range(1, len(points_))]


def point_range(points_: list[tuple[float, float]]) -> float | None:
    if len(points_) < 2:
        return None
    xs = [point[0] for point in points_]
    ys = [point[1] for point in points_]
    return math.hypot(max(xs) - min(xs), max(ys) - min(ys))


def distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def differences(values: list[float]) -> list[float]:
    return [abs(values[index] - values[index - 1]) for index in range(1, len(values))]


def finite_values(values) -> list[float]:
    return [float(value) for value in values if value is not None and math.isfinite(float(value))]


def mean_or_none(values: list[float]) -> float | None:
    return mean(values) if values else None


def mean_abs(values: list[float]) -> float | None:
    return mean(abs(value) for value in values) if values else None


def rms(values: list[float]) -> float | None:
    return math.sqrt(mean(value * value for value in values)) if values else None


def posture_symmetry(shoulder_values: list[float], hip_values: list[float]) -> float | None:
    values = []
    if shoulder_values:
        values.append(mean(shoulder_values) * 7)
    if hip_values:
        values.append(mean(hip_values) * 7)
    return max(0, min(100, 100 - mean(values))) if values else None


def estimate_dominant_frequency(values: list[float], duration_seconds: float) -> float | None:
    if len(values) < 6 or duration_seconds <= 0:
        return None
    mean_value = mean(values)
    centered = [value - mean_value for value in values]
    zero_crossings = 0
    for index in range(1, len(centered)):
        if centered[index - 1] == 0:
            continue
        if centered[index - 1] * centered[index] < 0:
            zero_crossings += 1
    cycles = zero_crossings / 2
    return cycles / duration_seconds


def rounded(value: float | int | None) -> float | int | None:
    if value is None:
        return None
    return round(value, 3)


def numeric(value) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None
