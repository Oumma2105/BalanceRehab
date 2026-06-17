from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from statistics import mean

from app.database import DATA_DIR


MODEL_PATH = DATA_DIR / "movement_intent_model.json"
FEATURE_NAMES = [
    "estimated_body_sway",
    "body_sway_velocity",
    "shoulder_center_movement",
    "hip_center_movement",
    "head_movement",
    "movement_smoothness",
    "movement_jerk",
    "dominant_frequency_hz",
    "posture_symmetry",
    "hand_arm_compensation",
]


def load_model() -> dict | None:
    if not MODEL_PATH.exists():
        return None
    try:
        return json.loads(MODEL_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def train_model(rows: list[dict]) -> dict:
    usable_rows = [row for row in rows if row.get("tracking_quality", {}).get("sufficient") and row.get("intent") in {"voluntary", "involuntary"}]
    vectors_by_intent: dict[str, list[list[float]]] = defaultdict(list)
    for row in usable_rows:
        vector = feature_vector(row.get("features", {}))
        if vector is not None:
            vectors_by_intent[row["intent"]].append(vector)

    labels = sorted(vectors_by_intent)
    if len(labels) < 2:
        return {
            "trained": False,
            "reason": "Need at least two intent classes with usable labeled samples.",
            "usable_samples": sum(len(items) for items in vectors_by_intent.values()),
            "labels": labels,
        }

    centroids = {
        label: centroid(vectors)
        for label, vectors in vectors_by_intent.items()
        if vectors
    }
    model = {
        "trained": True,
        "model_type": "nearest_centroid_v1",
        "created_at": datetime.utcnow().isoformat(),
        "feature_names": FEATURE_NAMES,
        "centroids": centroids,
        "class_counts": {label: len(vectors) for label, vectors in vectors_by_intent.items()},
        "training_samples": sum(len(vectors) for vectors in vectors_by_intent.values()),
        "evaluation": leave_one_out_eval(usable_rows),
        "note": "Prototype classifier trained from clinician labels. Not clinically validated.",
    }
    MODEL_PATH.write_text(json.dumps(model, indent=2), encoding="utf-8")
    return model


def predict_intent_model(features: dict) -> tuple[str, float | None, str] | None:
    model = load_model()
    if not model or not model.get("trained"):
        return None
    vector = feature_vector(features)
    centroids = model.get("centroids") or {}
    if vector is None or len(centroids) < 2:
        return None

    distances = sorted(
        (euclidean(vector, centroid_values), label)
        for label, centroid_values in centroids.items()
    )
    best_distance, best_label = distances[0]
    second_distance = distances[1][0] if len(distances) > 1 else best_distance + 1
    margin = max(0.0, second_distance - best_distance)
    confidence = round(min(0.82, 0.45 + margin / (second_distance + 1e-6) * 0.35), 2)
    return best_label, confidence, "trained_nearest_centroid"


def model_summary() -> dict:
    model = load_model()
    if not model:
        return {
            "trained": False,
            "model_type": None,
            "training_samples": 0,
            "class_counts": {},
            "evaluation": None,
            "note": "No trained movement intent model yet.",
        }
    return model


def feature_vector(features: dict) -> list[float] | None:
    vector: list[float] = []
    for name in FEATURE_NAMES:
        value = features.get(name)
        if value is None:
            return None
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(number):
            return None
        vector.append(number)
    return vector


def centroid(vectors: list[list[float]]) -> list[float]:
    return [mean(values) for values in zip(*vectors)]


def euclidean(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((left - right) ** 2 for left, right in zip(a, b)))


def leave_one_out_eval(rows: list[dict]) -> dict:
    usable = [
        (row["intent"], feature_vector(row.get("features", {})))
        for row in rows
        if row.get("intent") in {"voluntary", "involuntary"}
    ]
    usable = [(label, vector) for label, vector in usable if vector is not None]
    if len(usable) < 4:
        return {
            "method": "leave_one_out",
            "accuracy": None,
            "samples": len(usable),
            "confusion": {},
            "note": "Not enough labeled samples for useful evaluation.",
        }

    correct = 0
    confusion: Counter[str] = Counter()
    for index, (true_label, vector) in enumerate(usable):
        train = usable[:index] + usable[index + 1 :]
        groups: dict[str, list[list[float]]] = defaultdict(list)
        for label, train_vector in train:
            groups[label].append(train_vector)
        if len(groups) < 2:
            continue
        centroids = {label: centroid(vectors) for label, vectors in groups.items()}
        predicted = min(((euclidean(vector, center), label) for label, center in centroids.items()))[1]
        correct += int(predicted == true_label)
        confusion[f"{true_label}->{predicted}"] += 1

    return {
        "method": "leave_one_out",
        "accuracy": round(correct / len(usable), 3),
        "samples": len(usable),
        "confusion": dict(confusion),
    }
