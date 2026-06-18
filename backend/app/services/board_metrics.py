from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import mean


@dataclass(frozen=True)
class NormalizedBoardSample:
    timestamp_ms: int
    anterior_posterior_sway: float
    medial_lateral_sway: float
    stability_score: float


def normalize_board_samples(samples: list) -> list[NormalizedBoardSample]:
    normalized: list[NormalizedBoardSample] = []
    for sample in sorted(samples, key=lambda item: item.timestamp_ms):
        ap = sample.anterior_posterior_sway
        ml = sample.medial_lateral_sway

        if ap is None or ml is None:
            computed = sway_from_corner_loads(sample)
            if computed is None:
                continue
            ap = computed["ap"]
            ml = computed["ml"]

        stability = sample.stability_score
        if stability is None:
            stability = stability_from_sway(ap, ml)

        normalized.append(
            NormalizedBoardSample(
                timestamp_ms=sample.timestamp_ms,
                anterior_posterior_sway=round(ap, 3),
                medial_lateral_sway=round(ml, 3),
                stability_score=round(stability, 1),
            )
        )
    return normalized


def compute_board_metrics(samples: list) -> dict:
    normalized = normalize_board_samples(samples)
    if not normalized:
        return {
            "board_stability_score": None,
            "mean_sway_ap": None,
            "mean_sway_ml": None,
            "max_sway_ap": None,
            "max_sway_ml": None,
            "mean_resultant_sway": None,
            "max_resultant_sway": None,
            "rms_sway": None,
            "path_length": None,
            "sensor_quality": None,
            "sway_velocity": None,
            "instability_events": None,
        }

    ap_values = [sample.anterior_posterior_sway for sample in normalized]
    ml_values = [sample.medial_lateral_sway for sample in normalized]
    resultant_values = [math.hypot(sample.anterior_posterior_sway, sample.medial_lateral_sway) for sample in normalized]
    stability_scores = [sample.stability_score for sample in normalized]
    path_length = compute_path_length(normalized)

    return {
        "board_stability_score": round(mean(stability_scores), 1),
        "mean_sway_ap": round(mean(abs(value) for value in ap_values), 2),
        "mean_sway_ml": round(mean(abs(value) for value in ml_values), 2),
        "max_sway_ap": round(max(abs(value) for value in ap_values), 2),
        "max_sway_ml": round(max(abs(value) for value in ml_values), 2),
        "mean_resultant_sway": round(mean(resultant_values), 2),
        "max_resultant_sway": round(max(resultant_values), 2),
        "rms_sway": round(math.sqrt(mean(value * value for value in resultant_values)), 2),
        "path_length": round(path_length, 2),
        "sensor_quality": round(mean(stability_scores), 1),
        "sway_velocity": round(compute_sway_velocity(normalized), 2),
        "instability_events": count_instability_events(normalized),
    }


def sway_from_corner_loads(sample) -> dict[str, float] | None:
    corners = [sample.front_left, sample.front_right, sample.rear_left, sample.rear_right]
    if any(value is None for value in corners):
        return None

    front = sample.front_left + sample.front_right
    rear = sample.rear_left + sample.rear_right
    left = sample.front_left + sample.rear_left
    right = sample.front_right + sample.rear_right
    total = front + rear
    if total <= 0:
        return None

    # Prototype board estimate: normalized load imbalance, not true center of pressure.
    return {
        "ap": ((front - rear) / total) * 100,
        "ml": ((right - left) / total) * 100,
    }


def stability_from_sway(ap: float, ml: float) -> float:
    magnitude = math.hypot(ap, ml)
    return max(0, min(100, 100 - magnitude * 2.2))


def compute_sway_velocity(samples: list[NormalizedBoardSample]) -> float:
    path_length = compute_path_length(samples)
    if len(samples) < 2:
        return 0.0
    total_seconds = max(0, samples[-1].timestamp_ms - samples[0].timestamp_ms) / 1000
    return path_length / total_seconds if total_seconds > 0 else 0.0


def compute_path_length(samples: list[NormalizedBoardSample]) -> float:
    if len(samples) < 2:
        return 0.0

    total_distance = 0.0
    previous = samples[0]
    for current in samples[1:]:
        delta_ms = max(0, current.timestamp_ms - previous.timestamp_ms)
        if delta_ms == 0:
            previous = current
            continue
        total_distance += math.hypot(
            current.anterior_posterior_sway - previous.anterior_posterior_sway,
            current.medial_lateral_sway - previous.medial_lateral_sway,
        )
        previous = current
    return total_distance


def count_instability_events(samples: list[NormalizedBoardSample]) -> int:
    events = 0
    in_event = False
    for sample in samples:
        unstable = sample.stability_score < 65 or math.hypot(sample.anterior_posterior_sway, sample.medial_lateral_sway) > 16
        if unstable and not in_event:
            events += 1
        in_event = unstable
    return events
