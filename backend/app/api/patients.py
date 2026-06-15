from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Patient, Session as AssessmentSession
from app.schemas import PatientCreate, PatientRead, PatientUpdate, ProgressAnalyticsRead, ProgressPoint, SessionRead

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=list[PatientRead])
def list_patients(
    q: str | None = Query(default=None, description="Search by patient name or patient code."),
    db: Session = Depends(get_db),
) -> list[PatientRead]:
    query = select(Patient).order_by(Patient.created_at.desc())
    if q:
        like = f"%{q.strip()}%"
        query = query.where((Patient.full_name.ilike(like)) | (Patient.patient_code.ilike(like)))
    patients = list(db.scalars(query))
    return [patient_summary(patient, db) for patient in patients]


@router.post("", response_model=PatientRead, status_code=201)
def create_patient(payload: PatientCreate, db: Session = Depends(get_db)) -> Patient:
    data = payload.model_dump()
    data["patient_code"] = data.get("patient_code") or next_patient_code(db)
    patient = Patient(**data)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient_summary(patient, db)


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(patient_id: int, db: Session = Depends(get_db)) -> PatientRead:
    return patient_summary(find_patient(patient_id, db), db)


@router.get("/{patient_id}/sessions", response_model=list[SessionRead])
def get_patient_sessions(patient_id: int, db: Session = Depends(get_db)) -> list[AssessmentSession]:
    find_patient(patient_id, db)
    return list(
        db.scalars(
            select(AssessmentSession)
            .where(AssessmentSession.patient_id == patient_id)
            .options(
                selectinload(AssessmentSession.sensor_samples),
                selectinload(AssessmentSession.posture_samples),
                selectinload(AssessmentSession.recommendations),
            )
            .order_by(AssessmentSession.created_at.desc())
        )
    )


@router.get("/{patient_id}/progress", response_model=ProgressAnalyticsRead)
def get_patient_progress(patient_id: int, db: Session = Depends(get_db)) -> ProgressAnalyticsRead:
    patient = find_patient(patient_id, db)
    sessions = list(
        db.scalars(
            select(AssessmentSession)
            .where(AssessmentSession.patient_id == patient_id)
            .order_by(AssessmentSession.created_at.asc())
        )
    )
    latest = sessions[-1] if sessions else None
    first = sessions[0] if sessions else None

    return ProgressAnalyticsRead(
        patient_id=patient.id,
        patient_code=patient.patient_code,
        patient_name=patient.full_name,
        latest_score=latest.total_balance_score if latest else None,
        session_count=len(sessions),
        score_change=round((latest.total_balance_score or 0) - (first.total_balance_score or 0), 1) if latest and first else None,
        static_average=average_score([session for session in sessions if session.test_type == "static"]),
        dynamic_average=average_score([session for session in sessions if session.test_type == "dynamic"]),
        eyes_open_average=average_score([session for session in sessions if session.visual_condition == "eyes_open"]),
        eyes_closed_average=average_score([session for session in sessions if session.visual_condition == "eyes_closed"]),
        follow_up_count=sum(1 for session in sessions if session.status == "Follow-up"),
        declining_count=sum(1 for session in sessions if session.status == "Declining"),
        trend=[
            ProgressPoint(
                session_id=session.id,
                label=f"S{index + 1}",
                date=session.created_at,
                test_type=session.test_type,
                visual_condition=session.visual_condition,
                acquisition_mode=session.acquisition_mode,
                status=session.status,
                total_score=session.total_balance_score,
                posture_score=session.posture_stability_score,
                trunk_deviation=session.trunk_deviation,
                shoulder_asymmetry=session.shoulder_asymmetry,
                hip_asymmetry=session.hip_asymmetry,
                body_center_deviation=session.body_center_deviation,
            )
            for index, session in enumerate(sessions)
        ],
    )


@router.patch("/{patient_id}", response_model=PatientRead)
def update_patient(patient_id: int, payload: PatientUpdate, db: Session = Depends(get_db)) -> PatientRead:
    patient = find_patient(patient_id, db)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(patient, key, value)
    db.commit()
    db.refresh(patient)
    return patient_summary(patient, db)


@router.delete("/{patient_id}", status_code=204)
def delete_patient(patient_id: int, db: Session = Depends(get_db)) -> None:
    patient = find_patient(patient_id, db)
    db.delete(patient)
    db.commit()


def find_patient(patient_id: int, db: Session) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


def next_patient_code(db: Session) -> str:
    codes = db.scalars(select(Patient.patient_code)).all()
    max_code = 1063
    for code in codes:
        if not code:
            continue
        prefix, _, suffix = code.partition("-")
        if prefix == "BR" and suffix.isdigit():
            max_code = max(max_code, int(suffix))
    return f"BR-{max_code + 1}"


def patient_summary(patient: Patient, db: Session) -> PatientRead:
    latest_session = db.scalars(
        select(AssessmentSession)
        .where(AssessmentSession.patient_id == patient.id)
        .order_by(AssessmentSession.created_at.desc())
        .limit(1)
    ).first()
    return PatientRead.model_validate(
        {
            **patient.__dict__,
            "latest_score": latest_session.total_balance_score if latest_session else None,
            "last_assessment_date": latest_session.created_at if latest_session else None,
            "status": latest_session.status if latest_session else "No sessions",
        }
    )


def average_score(sessions: list[AssessmentSession]) -> float | None:
    scores = [session.total_balance_score for session in sessions if session.total_balance_score is not None]
    if not scores:
        return None
    return round(sum(scores) / len(scores), 1)
