from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Patient
from app.models import PostureSample
from app.models import Recommendation
from app.models import SensorSample
from app.models import Session as AssessmentSession
from app.schemas import SessionCreate, SessionRead

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[SessionRead])
def list_sessions(
    patient_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[AssessmentSession]:
    query = session_query().order_by(AssessmentSession.created_at.desc())
    if patient_id is not None:
        query = query.where(AssessmentSession.patient_id == patient_id)
    return list(db.scalars(query))


@router.post("", response_model=SessionRead, status_code=201)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)) -> AssessmentSession:
    if db.get(Patient, payload.patient_id) is None:
        raise HTTPException(status_code=404, detail="Patient not found")

    data = payload.model_dump(exclude={"sensor_samples", "posture_samples", "recommendations"})
    if data.get("status") is None:
        data["status"] = status_from_score(data.get("total_balance_score"))

    session = AssessmentSession(**data)
    session.sensor_samples = [SensorSample(**sample.model_dump()) for sample in payload.sensor_samples]
    session.posture_samples = [PostureSample(**sample.model_dump()) for sample in payload.posture_samples]
    session.recommendations = [
        Recommendation(
            category=recommendation.category,
            recommendation_en=recommendation.recommendation_en,
            recommendation_fr=recommendation.recommendation_fr or recommendation.recommendation_en,
            priority=recommendation.priority,
        )
        for recommendation in payload.recommendations
    ]

    db.add(session)
    db.commit()
    db.refresh(session)
    return load_session(session.id, db)


@router.get("/{session_id}", response_model=SessionRead)
def get_session(session_id: int, db: Session = Depends(get_db)) -> AssessmentSession:
    return load_session(session_id, db)


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: int, db: Session = Depends(get_db)) -> None:
    session = load_session(session_id, db)
    db.delete(session)
    db.commit()


def load_session(session_id: int, db: Session) -> AssessmentSession:
    session = db.scalars(session_query().where(AssessmentSession.id == session_id)).first()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def session_query():
    return select(AssessmentSession).options(
        selectinload(AssessmentSession.sensor_samples),
        selectinload(AssessmentSession.posture_samples),
        selectinload(AssessmentSession.recommendations),
    )


def status_from_score(score: float | None) -> str | None:
    if score is None:
        return None
    if score >= 80:
        return "Stable"
    if score >= 65:
        return "Follow-up"
    return "Declining"
