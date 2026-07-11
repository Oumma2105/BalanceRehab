from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Session as AssessmentSession
from app.schemas import MovementModelRead, MovementTrainingDatasetRow, MovementTrainingReadiness
from app.services.movement_features import build_movement_feature_payload
from app.services.movement_model import model_summary, train_model
from app.services.fall_risk_model import (
    fall_risk_status,
    predict_fall_risk,
    train_fall_risk_model,
)


router = APIRouter(prefix="/ml", tags=["ml"])

RECOMMENDED_MIN_SEGMENTS = 50


@router.get("/movement-training/readiness", response_model=MovementTrainingReadiness)
def movement_training_readiness(db: Session = Depends(get_db)) -> dict:
    rows = movement_training_rows(db)
    label_counts = Counter(row["label"] for row in rows)
    intent_counts = Counter(row["intent"] or "unknown" for row in rows)
    usable_rows = [row for row in rows if row["tracking_quality"].get("sufficient")]
    labeled_sessions = len({row["session_id"] for row in rows})
    ready = len(usable_rows) >= RECOMMENDED_MIN_SEGMENTS and len(intent_counts) >= 2

    return {
        "labeled_sessions": labeled_sessions,
        "labeled_segments": len(rows),
        "usable_labeled_segments": len(usable_rows),
        "label_counts": dict(label_counts),
        "intent_counts": dict(intent_counts),
        "ready_for_training": ready,
        "recommended_min_segments": RECOMMENDED_MIN_SEGMENTS,
        "note": (
            "Use this dataset for prototype model training only after clinician review. "
            "More balanced labels improve voluntary/involuntary estimates."
        ),
    }


@router.get("/movement-training/dataset", response_model=list[MovementTrainingDatasetRow])
def movement_training_dataset(db: Session = Depends(get_db)) -> list[dict]:
    return movement_training_rows(db)


@router.get("/movement-training/model", response_model=MovementModelRead)
def movement_model_status() -> dict:
    return model_summary()


@router.post("/movement-training/train", response_model=MovementModelRead)
def train_movement_model(db: Session = Depends(get_db)) -> dict:
    return train_model(movement_training_rows(db))


@router.get("/fall-risk/status")
def get_fall_risk_status() -> dict:
    return fall_risk_status()


@router.post("/fall-risk/train")
def train_fall_risk(db: Session = Depends(get_db)) -> dict:
    sessions = list(
        db.scalars(select(AssessmentSession).where(AssessmentSession.total_balance_score.is_not(None)))
    )
    return train_fall_risk_model(sessions)


@router.get("/fall-risk/predict/{session_id}")
def predict_fall_risk_for_session(session_id: int, db: Session = Depends(get_db)) -> dict:
    session = db.get(AssessmentSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    prediction = predict_fall_risk(session)
    if prediction is None:
        raise HTTPException(status_code=409, detail="No trained fall-risk model. Run training first.")
    return prediction


def movement_training_rows(db: Session) -> list[dict]:
    sessions = list(
        db.scalars(
            select(AssessmentSession)
            .options(
                selectinload(AssessmentSession.posture_samples),
                selectinload(AssessmentSession.movement_labels),
            )
            .where(AssessmentSession.acquisition_mode == "webcam")
        )
    )
    rows: list[dict] = []
    for session in sessions:
        if not session.movement_labels:
            continue
        feature_payload = build_movement_feature_payload(session)
        for label in session.movement_labels:
            rows.append(
                {
                    "session_id": session.id,
                    "patient_id": session.patient_id,
                    "label_id": label.id,
                    "label": label.label,
                    "intent": label.intent,
                    "confidence": label.confidence,
                    "start_ms": label.start_ms,
                    "end_ms": label.end_ms,
                    "tracking_quality": feature_payload["tracking_quality"],
                    "features": feature_payload["features"],
                }
            )
    return rows
