import random

import pytest

from app.models import Session as AssessmentSession
from app.services import fall_risk_model
from app.services.fall_risk_model import (
    DISCLAIMER,
    FEATURE_COLUMNS,
    RISK_SCORE_THRESHOLD,
    build_dataset,
    predict_fall_risk,
    session_features,
    train_fall_risk_model,
)


def make_session(score: float, seed: int = 0) -> AssessmentSession:
    rng = random.Random(seed)
    # Raw metrics correlated with the score so the model has real signal:
    # lower scores -> larger sway / velocity / deviations.
    severity = max(0.0, (100.0 - score) / 100.0)
    session = AssessmentSession(
        patient_id=1,
        total_balance_score=score,
        mean_sway_ap=round(1.0 + severity * 10 + rng.uniform(-0.4, 0.4), 2),
        mean_sway_ml=round(0.8 + severity * 8 + rng.uniform(-0.3, 0.3), 2),
        max_sway_ap=round(2.0 + severity * 14 + rng.uniform(-0.5, 0.5), 2),
        max_sway_ml=round(1.6 + severity * 11 + rng.uniform(-0.5, 0.5), 2),
        mean_resultant_sway=round(1.5 + severity * 12 + rng.uniform(-0.4, 0.4), 2),
        max_resultant_sway=round(2.5 + severity * 16 + rng.uniform(-0.6, 0.6), 2),
        rms_sway=round(1.2 + severity * 9 + rng.uniform(-0.3, 0.3), 2),
        path_length=round(20 + severity * 220 + rng.uniform(-5, 5), 1),
        sway_velocity=round(0.4 + severity * 4 + rng.uniform(-0.1, 0.1), 2),
        instability_events=int(severity * 8 + rng.uniform(0, 1.5)),
        trunk_deviation=round(1 + severity * 12 + rng.uniform(-0.5, 0.5), 2),
        shoulder_asymmetry=round(0.5 + severity * 9 + rng.uniform(-0.3, 0.3), 2),
        hip_asymmetry=round(0.4 + severity * 7 + rng.uniform(-0.3, 0.3), 2),
        body_center_deviation=round(1 + severity * 14 + rng.uniform(-0.5, 0.5), 2),
    )
    return session


@pytest.fixture
def training_sessions():
    sessions = []
    for index in range(60):
        score = 80 + (index % 15) if index % 2 == 0 else 45 + (index % 18)
        sessions.append(make_session(float(score), seed=index))
    return sessions


@pytest.fixture(autouse=True)
def isolated_model_file(tmp_path, monkeypatch):
    monkeypatch.setattr(fall_risk_model, "MODEL_PATH", tmp_path / "fall_risk_model.joblib")
    fall_risk_model.reset_model_cache()
    yield
    fall_risk_model.reset_model_cache()


def test_session_features_extracts_all_columns():
    session = make_session(70.0)
    row = session_features(session)
    assert row is not None
    assert len(row) == len(FEATURE_COLUMNS)


def test_build_dataset_labels_by_threshold(training_sessions):
    features, labels = build_dataset(training_sessions)
    assert len(features) == len(labels) == len(training_sessions)
    for session, label in zip(training_sessions, labels):
        assert label == (1 if session.total_balance_score < RISK_SCORE_THRESHOLD else 0)


def test_training_refuses_insufficient_data():
    result = train_fall_risk_model([make_session(80.0, seed=i) for i in range(5)])
    assert result["trained"] is False
    assert "reason" in result
    assert result["disclaimer"] == DISCLAIMER


def test_training_produces_metrics_and_model(training_sessions):
    result = train_fall_risk_model(training_sessions)
    assert result["trained"] is True
    assert result["dataset_size"] == len(training_sessions)
    assert set(result["metrics"]) == {"accuracy", "precision", "recall", "f1"}
    # Sway metrics correlate strongly with the rule-derived label, so the
    # holdout accuracy should be well above chance.
    assert result["metrics"]["accuracy"] >= 0.75
    assert result["label_rule"].startswith("elevated_risk")
    assert result["disclaimer"] == DISCLAIMER
    assert len(result["feature_importances"]) == len(FEATURE_COLUMNS)


def test_predict_after_training(training_sessions):
    train_fall_risk_model(training_sessions)

    risky = predict_fall_risk(make_session(42.0, seed=999))
    steady = predict_fall_risk(make_session(92.0, seed=998))

    assert risky is not None and steady is not None
    assert 0.0 <= risky["risk_probability"] <= 1.0
    assert risky["risk_probability"] > steady["risk_probability"]
    assert risky["disclaimer"] == DISCLAIMER


def test_predict_without_model_returns_none():
    assert predict_fall_risk(make_session(60.0)) is None
