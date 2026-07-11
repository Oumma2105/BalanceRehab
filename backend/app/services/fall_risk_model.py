"""Random Forest fall-risk prototype (Phase 1 of the planned ML pipeline).

Scope and honesty
-----------------
- Trained on the sessions currently in the local database. With the demo
  dataset these are SYNTHETIC sessions; the label is RULE-DERIVED
  (elevated risk = total balance score < 65, the app's follow-up
  threshold), not clinical fall ground truth.
- The balance score itself is deliberately EXCLUDED from the features:
  the model learns to approximate the risk classification from raw sway
  and posture metrics, so the same pipeline can be retrained unchanged
  once clinician-confirmed fall labels exist.
- Every API payload carries a disclaimer; nothing here is a medical
  device or a validated clinical instrument.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

import joblib

from app.models import Session as AssessmentSession

MODEL_PATH = Path(__file__).resolve().parents[2] / "data" / "fall_risk_model.joblib"
RISK_SCORE_THRESHOLD = 65.0
MIN_TRAINING_SESSIONS = 40

DISCLAIMER = (
    "Prototype trained on locally recorded (demo) sessions with rule-derived labels. "
    "Not clinically validated; do not use for medical decisions."
)

FEATURE_COLUMNS = [
    "mean_sway_ap",
    "mean_sway_ml",
    "max_sway_ap",
    "max_sway_ml",
    "mean_resultant_sway",
    "max_resultant_sway",
    "rms_sway",
    "path_length",
    "sway_velocity",
    "instability_events",
    "trunk_deviation",
    "shoulder_asymmetry",
    "hip_asymmetry",
    "body_center_deviation",
]

_lock = Lock()
_cache: dict | None = None


def session_features(session: AssessmentSession) -> list[float] | None:
    values = []
    for column in FEATURE_COLUMNS:
        value = getattr(session, column, None)
        if value is None:
            value = 0.0
        try:
            values.append(float(value))
        except (TypeError, ValueError):
            return None
    return values


def build_dataset(sessions: list[AssessmentSession]) -> tuple[list[list[float]], list[int]]:
    features: list[list[float]] = []
    labels: list[int] = []
    for session in sessions:
        if session.total_balance_score is None:
            continue
        row = session_features(session)
        if row is None:
            continue
        features.append(row)
        labels.append(1 if float(session.total_balance_score) < RISK_SCORE_THRESHOLD else 0)
    return features, labels


def train_fall_risk_model(sessions: list[AssessmentSession]) -> dict:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
    from sklearn.model_selection import train_test_split

    features, labels = build_dataset(sessions)
    if len(features) < MIN_TRAINING_SESSIONS or len(set(labels)) < 2:
        return {
            "trained": False,
            "reason": (
                f"Need at least {MIN_TRAINING_SESSIONS} completed sessions with both risk classes; "
                f"found {len(features)} usable sessions."
            ),
            "dataset_size": len(features),
            "disclaimer": DISCLAIMER,
        }

    x_train, x_test, y_train, y_test = train_test_split(
        features, labels, test_size=0.25, random_state=42, stratify=labels
    )
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=None,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
    )
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)

    metrics = {
        "accuracy": round(float(accuracy_score(y_test, predictions)), 3),
        "precision": round(float(precision_score(y_test, predictions, zero_division=0)), 3),
        "recall": round(float(recall_score(y_test, predictions, zero_division=0)), 3),
        "f1": round(float(f1_score(y_test, predictions, zero_division=0)), 3),
    }
    importances = sorted(
        zip(FEATURE_COLUMNS, (round(float(v), 4) for v in model.feature_importances_)),
        key=lambda item: item[1],
        reverse=True,
    )

    payload = {
        "trained": True,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset_size": len(features),
        "train_size": len(x_train),
        "test_size": len(x_test),
        "positive_rate": round(sum(labels) / len(labels), 3),
        "label_rule": f"elevated_risk = total_balance_score < {RISK_SCORE_THRESHOLD:g}",
        "metrics": metrics,
        "feature_importances": [{"feature": name, "importance": value} for name, value in importances],
        "disclaimer": DISCLAIMER,
    }

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _lock:
        joblib.dump({"model": model, "summary": payload}, MODEL_PATH)
        global _cache
        _cache = {"model": model, "summary": payload}
    return payload


def _load() -> dict | None:
    global _cache
    with _lock:
        if _cache is not None:
            return _cache
        if not MODEL_PATH.exists():
            return None
        try:
            _cache = joblib.load(MODEL_PATH)
        except Exception:
            return None
        return _cache


def fall_risk_status() -> dict:
    stored = _load()
    if stored is None:
        return {"trained": False, "reason": "No trained model. Run training first.", "disclaimer": DISCLAIMER}
    return stored["summary"]


def predict_fall_risk(session: AssessmentSession) -> dict | None:
    stored = _load()
    if stored is None:
        return None
    row = session_features(session)
    if row is None:
        return None
    model = stored["model"]
    probability = float(model.predict_proba([row])[0][1])
    return {
        "session_id": session.id,
        "elevated_risk": probability >= 0.5,
        "risk_probability": round(probability, 3),
        "model_trained_at": stored["summary"].get("trained_at"),
        "disclaimer": DISCLAIMER,
    }


def reset_model_cache() -> None:
    """Test hook: drop the in-memory cache so tests can isolate model files."""
    global _cache
    with _lock:
        _cache = None
