from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Patient
from app.models import Report
from app.models import Session as AssessmentSession

router = APIRouter(tags=["mvp-placeholders"])


@router.get("/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db)):
    today = datetime.utcnow().date()
    week_start = today - timedelta(days=6)
    sessions = list(db.scalars(select(AssessmentSession).order_by(AssessmentSession.created_at.desc())))
    patients = list(db.scalars(select(Patient)))
    reports = list(db.scalars(select(Report).order_by(Report.generated_at.desc()).limit(4)))
    patient_lookup = {patient.id: patient for patient in patients}
    scores = [session.total_balance_score for session in sessions if session.total_balance_score is not None]
    follow_up_patient_ids = {
        session.patient_id
        for session in sessions
        if session.status in {"Follow-up", "Declining"} or (session.total_balance_score is not None and session.total_balance_score < 70)
    }
    today_count = sum(1 for session in sessions if session.created_at.date() == today)
    week_count = sum(1 for session in sessions if week_start <= session.created_at.date() <= today)
    latest_by_patient: dict[int, AssessmentSession] = {}
    for session in sessions:
        latest_by_patient.setdefault(session.patient_id, session)
    declining_patients = sum(1 for session in latest_by_patient.values() if session.status == "Declining")
    recent_assessments = [
        {
            "id": session.id,
            "patient_id": session.patient_id,
            "patient": patient_lookup.get(session.patient_id).full_name if patient_lookup.get(session.patient_id) else "",
            "patient_code": patient_lookup.get(session.patient_id).patient_code if patient_lookup.get(session.patient_id) else "",
            "date": session.created_at,
            "test_type": session.test_type,
            "visual_condition": session.visual_condition,
            "acquisition_mode": session.acquisition_mode,
            "total_score": session.total_balance_score,
            "status": session.status,
        }
        for session in sessions[:5]
    ]
    score_distribution = {
        "lt_60": len([score for score in scores if score < 60]),
        "60_69": len([score for score in scores if 60 <= score < 70]),
        "70_79": len([score for score in scores if 70 <= score < 80]),
        "80_plus": len([score for score in scores if score >= 80]),
    }

    patient_improvements = []
    for patient in patients:
        patient_sessions = sorted(
            [s for s in sessions if s.patient_id == patient.id],
            key=lambda s: str(s.created_at),
        )
        if len(patient_sessions) >= 2:
            first_score = patient_sessions[0].total_balance_score
            last_score = patient_sessions[-1].total_balance_score
            if first_score is not None and last_score is not None:
                patient_improvements.append(last_score - first_score)
    average_improvement = round(sum(patient_improvements) / len(patient_improvements), 1) if patient_improvements else None

    return {
        "total_patients": len(patients),
        "active_patients": len([patient for patient in patients if patient.id in latest_by_patient]),
        "total_sessions": len(sessions),
        "assessments_today": today_count,
        "assessments_this_week": week_count,
        "average_stability_score": round(sum(scores) / len(scores), 1) if scores else None,
        "follow_up_queue": len(follow_up_patient_ids),
        "declining_patients": declining_patients,
        "recent_assessments": recent_assessments,
        "score_distribution": score_distribution,
        "static_average": average_score([session for session in sessions if session.test_type == "static"]),
        "dynamic_average": average_score([session for session in sessions if session.test_type == "dynamic"]),
        "eyes_open_average": average_score([session for session in sessions if session.visual_condition == "eyes_open"]),
        "eyes_closed_average": average_score([session for session in sessions if session.visual_condition == "eyes_closed"]),
        "score_trend": [
            {
                "label": f"S{index + 1}",
                "session_id": session.id,
                "value": session.total_balance_score,
                "date": session.created_at,
            }
            for index, session in enumerate(list(reversed(sessions[:6])))
        ],
        "recent_reports": [
            {
                "report_id": report.report_id,
                "patient_id": report.patient_id,
                "patient": patient_lookup.get(report.patient_id).full_name if patient_lookup.get(report.patient_id) else "",
                "patient_code": patient_lookup.get(report.patient_id).patient_code if patient_lookup.get(report.patient_id) else "",
                "session_id": report.session_id,
                "generated_at": report.generated_at,
                "summary": report.summary,
                "acquisition_mode": report.acquisition_mode,
            }
            for report in reports
        ],
        "last_assessment": sessions[0].created_at if sessions else None,
        "average_improvement": average_improvement,
        "mode": "backend",
    }


def average_score(sessions: list[AssessmentSession]) -> float | None:
    scores = [session.total_balance_score for session in sessions if session.total_balance_score is not None]
    if not scores:
        return None
    return round(sum(scores) / len(scores), 1)
