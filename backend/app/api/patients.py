from datetime import datetime, timezone
from math import hypot

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Patient, RehabGameSession, Session as AssessmentSession
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
    existing = db.scalar(select(Patient).where(Patient.patient_code == data["patient_code"]))
    if existing is not None:
        raise HTTPException(status_code=409, detail="Patient code already exists")
    patient = Patient(**data)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient_summary(patient, db)


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(patient_id: int, db: Session = Depends(get_db)) -> PatientRead:
    return patient_summary(find_patient(patient_id, db), db)


@router.get("/{patient_id}/sessions", response_model=list[SessionRead])
def get_patient_sessions(
    patient_id: int,
    include_metrics: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[AssessmentSession]:
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


@router.get("/{patient_id}/profile")
def get_patient_profile(patient_id: int, db: Session = Depends(get_db)) -> dict:
    patient = find_patient(patient_id, db)
    sessions = patient_sessions_asc(patient_id, db)
    rehab_sessions = list(
        db.scalars(
            select(RehabGameSession)
            .where(RehabGameSession.patient_id == patient_id)
            .order_by(RehabGameSession.created_at.asc())
        )
    )
    completed = [session for session in sessions if session.total_balance_score is not None]
    scores = [session.total_balance_score for session in completed]
    latest = completed[-1] if completed else None
    first = completed[0] if completed else None
    best = max(completed, key=lambda item: item.total_balance_score, default=None)
    worst = min(completed, key=lambda item: item.total_balance_score, default=None)
    now = datetime.now(timezone.utc)
    first_date = first.created_at.replace(tzinfo=timezone.utc) if first and first.created_at.tzinfo is None else first.created_at if first else None
    program_duration = (now - first_date).days if first_date else 0
    avg = round(sum(scores) / len(scores), 1) if scores else None
    return {
        "patient": PatientRead.model_validate(
            {
                **patient.__dict__,
                "latest_score": latest.total_balance_score if latest else None,
                "last_assessment_date": latest.created_at if latest else None,
                "status": (latest.status or "Stable") if latest else "No sessions",
            }
        ).model_dump(mode="json"),
        "stats": {
            "session_count": len(sessions),
            "rehab_session_count": len(rehab_sessions),
            "avg_score": avg,
            "best_score": best.total_balance_score if best else None,
            "best_date": best.created_at if best else None,
            "worst_score": worst.total_balance_score if worst else None,
            "worst_date": worst.created_at if worst else None,
            "first_session_date": first.created_at if first else None,
            "last_session_date": latest.created_at if latest else None,
            "program_duration_days": program_duration,
            "trend": round((latest.total_balance_score or 0) - (first.total_balance_score or 0), 1) if latest and first else None,
            "risk": risk_label(latest.total_balance_score if latest else None),
            "bmi": round(patient.weight_kg / ((patient.height_cm / 100) ** 2), 1)
            if patient.height_cm and patient.weight_kg
            else None,
        },
        "sessions": [session_chart_payload(session, index) for index, session in enumerate(sessions)],
        "rehab_sessions": [
            {
                "id": item.id,
                "game_type": item.game_type,
                "date": item.created_at,
                "duration_seconds": item.duration_seconds,
                "score": item.score,
                "accuracy": item.accuracy,
                "stability": item.stability,
                "smoothness": item.smoothness,
            }
            for item in rehab_sessions
        ],
    }


@router.get("/{patient_id}/session-trend")
def get_patient_session_trend(patient_id: int, db: Session = Depends(get_db)) -> list[dict]:
    find_patient(patient_id, db)
    return [session_chart_payload(session, index) for index, session in enumerate(patient_sessions_asc(patient_id, db))]


@router.get("/{patient_id}/radar-latest")
def get_patient_radar_latest(patient_id: int, db: Session = Depends(get_db)) -> dict:
    find_patient(patient_id, db)
    sessions = [session for session in patient_sessions_asc(patient_id, db) if session.total_balance_score is not None]
    latest = sessions[-1] if sessions else None
    previous = sessions[-2] if len(sessions) > 1 else None
    return {
        "latest": radar_payload(latest),
        "previous": radar_payload(previous),
    }


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
    completed = [session for session in sessions if session.total_balance_score is not None]
    latest = completed[-1] if completed else None
    first = completed[0] if completed else None

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
        .where(
            AssessmentSession.patient_id == patient.id,
            AssessmentSession.total_balance_score.is_not(None),
        )
        .order_by(AssessmentSession.created_at.desc())
        .limit(1)
    ).first()
    return PatientRead.model_validate(
        {
            **patient.__dict__,
            "latest_score": latest_session.total_balance_score if latest_session else None,
            "last_assessment_date": latest_session.created_at if latest_session else None,
            "status": (latest_session.status or "Stable") if latest_session else "No sessions",
        }
    )


def average_score(sessions: list[AssessmentSession]) -> float | None:
    scores = [session.total_balance_score for session in sessions if session.total_balance_score is not None]
    if not scores:
        return None
    return round(sum(scores) / len(scores), 1)


def patient_sessions_asc(patient_id: int, db: Session) -> list[AssessmentSession]:
    return list(
        db.scalars(
            select(AssessmentSession)
            .where(AssessmentSession.patient_id == patient_id)
            .order_by(AssessmentSession.created_at.asc())
        )
    )


def risk_label(score: float | None) -> str:
    if score is None:
        return "Unknown"
    if score >= 75:
        return "Low"
    if score >= 60:
        return "Moderate"
    return "High"


def session_chart_payload(session: AssessmentSession, index: int) -> dict:
    return {
        "id": session.id,
        "session_number": index + 1,
        "date": session.created_at,
        "test_type": session.test_type,
        "vision_condition": session.visual_condition,
        "acquisition_mode": session.acquisition_mode,
        "status": session.status,
        "balance_score": session.total_balance_score,
        "posture_score": session.posture_stability_score,
        "stability_score": session.board_stability_score,
        "ap_sway": session.mean_sway_ap,
        "ml_sway": session.mean_sway_ml,
        "sway_velocity": session.sway_velocity,
        "instability_events": session.instability_events,
        "trunk_deviation": session.trunk_deviation,
        "shoulder_asymmetry": session.shoulder_asymmetry,
        "hip_asymmetry": session.hip_asymmetry,
        "body_center_deviation": session.body_center_deviation,
        "resultant_sway": hypot(session.mean_sway_ap or 0, session.mean_sway_ml or 0),
    }


def normalize_positive(value: float | None, best: float, worst: float) -> float:
    if value is None:
        return 0
    return round(max(0, min(100, 100 - ((value - best) / max(0.01, worst - best)) * 100)), 1)


def radar_payload(session: AssessmentSession | None) -> list[dict]:
    if session is None:
        return []
    return [
        {"axis": "Balance", "value": session.total_balance_score or 0},
        {"axis": "Posture", "value": session.posture_stability_score or 0},
        {"axis": "Stability", "value": session.board_stability_score or 0},
        {"axis": "AP Control", "value": normalize_positive(session.mean_sway_ap, 0.5, 8)},
        {"axis": "ML Control", "value": normalize_positive(session.mean_sway_ml, 0.3, 6)},
        {"axis": "Alignment", "value": normalize_positive(session.trunk_deviation, 0, 20)},
    ]
