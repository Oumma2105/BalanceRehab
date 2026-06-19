from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Patient, RehabGameSession
from app.schemas import RehabGameSessionCreate, RehabGameSessionRead

router = APIRouter(prefix="/rehab-games", tags=["rehab-games"])


@router.get("", response_model=list[RehabGameSessionRead])
def list_rehab_sessions(
    patient_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[RehabGameSession]:
    query = select(RehabGameSession).order_by(RehabGameSession.created_at.desc())
    if patient_id is not None:
        query = query.where(RehabGameSession.patient_id == patient_id)
    return list(db.scalars(query))


@router.post("", response_model=RehabGameSessionRead, status_code=201)
def create_rehab_session(
    payload: RehabGameSessionCreate,
    db: Session = Depends(get_db),
) -> RehabGameSession:
    if db.get(Patient, payload.patient_id) is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    session = RehabGameSession(**payload.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=204)
def delete_rehab_session(session_id: int, db: Session = Depends(get_db)) -> None:
    session = db.get(RehabGameSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
