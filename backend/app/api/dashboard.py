from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from statistics import median

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Patient, Session as AssessmentSession


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def as_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def score_bucket(score: float | None) -> str:
    if score is None:
        return "No sessions"
    if score >= 75:
        return "Stable"
    if score >= 65:
        return "Improving"
    if score >= 50:
        return "Follow-up"
    return "Declining"


def patient_status(patient: Patient, sessions: list[AssessmentSession]) -> str:
    if not sessions:
        return "No sessions"
    latest = sessions[-1]
    if latest.status:
        return latest.status
    if len(sessions) >= 2 and (latest.total_balance_score or 0) < (sessions[-2].total_balance_score or 0) - 4:
        return "Declining"
    return score_bucket(latest.total_balance_score)


def session_payload(session: AssessmentSession) -> dict:
    return {
        "id": session.id,
        "patient_id": session.patient_id,
        "date": session.created_at,
        "test_type": session.test_type,
        "vision_condition": session.visual_condition,
        "acquisition_mode": session.acquisition_mode,
        "balance_score": session.total_balance_score,
        "posture_score": session.posture_stability_score,
        "stability_score": session.board_stability_score,
        "ap_sway": session.mean_sway_ap,
        "ml_sway": session.mean_sway_ml,
        "sway_velocity": session.sway_velocity,
        "instability_events": session.instability_events,
        "trunk_deviation": session.trunk_deviation,
        "status": session.status,
    }


def sessions_by_patient(db: Session) -> tuple[list[Patient], dict[int, list[AssessmentSession]]]:
    patients = list(db.scalars(select(Patient).order_by(Patient.id)))
    sessions = list(db.scalars(select(AssessmentSession).order_by(AssessmentSession.created_at.asc())))
    grouped: dict[int, list[AssessmentSession]] = defaultdict(list)
    for session in sessions:
        grouped[session.patient_id].append(session)
    return patients, grouped


@router.get("/kpis")
def dashboard_kpis(db: Session = Depends(get_db)) -> dict:
    patients, grouped = sessions_by_patient(db)
    sessions = [session for items in grouped.values() for session in items if session.total_balance_score is not None]
    now = now_utc()
    week_start = now - timedelta(days=7)
    month_start = now - timedelta(days=30)
    previous_month_start = now - timedelta(days=60)
    week_sessions = [session for session in sessions if as_aware(session.created_at) >= week_start]
    today_sessions = [session for session in sessions if as_aware(session.created_at).date() == now.date()]
    month_scores = [session.total_balance_score for session in sessions if as_aware(session.created_at) >= month_start]
    previous_scores = [
        session.total_balance_score
        for session in sessions
        if previous_month_start <= as_aware(session.created_at) < month_start
    ]
    avg_score = round(sum(month_scores) / len(month_scores), 1) if month_scores else None
    previous_avg = round(sum(previous_scores) / len(previous_scores), 1) if previous_scores else avg_score
    trend_value = round((avg_score or 0) - (previous_avg or 0), 1) if avg_score is not None and previous_avg is not None else 0
    status_counts = Counter(patient_status(patient, grouped.get(patient.id, [])) for patient in patients)
    no_recent = sum(
        1
        for patient in patients
        if not grouped.get(patient.id)
        or as_aware(grouped[patient.id][-1].created_at) < month_start
    )
    follow_up_queue = status_counts["Follow-up"] + status_counts["Declining"] + no_recent
    sparkline = weekly_trend(sessions, 8)
    last_7_days = []
    for offset in range(6, -1, -1):
        date = now.date() - timedelta(days=offset)
        last_7_days.append(
            {
                "label": date.strftime("%a"),
                "date": date.isoformat(),
                "count": sum(1 for session in sessions if as_aware(session.created_at).date() == date),
            }
        )
    return {
        "total_patients": len(patients),
        "active_patients": sum(1 for items in grouped.values() if items and as_aware(items[-1].created_at) >= month_start),
        "follow_up_queue": follow_up_queue,
        "average_score": avg_score,
        "sessions_today": len(today_sessions),
        "sessions_this_week": len(week_sessions),
        "trend_direction": "up" if trend_value >= 0 else "down",
        "trend_value": abs(trend_value),
        "declining_count": status_counts["Declining"],
        "no_recent_count": no_recent,
        "score_sparkline": sparkline,
        "weekly_bars": last_7_days,
    }


@router.get("/clinic-trend")
def clinic_trend(weeks: int = Query(default=12, ge=4, le=26), db: Session = Depends(get_db)) -> list[dict]:
    sessions = list(db.scalars(select(AssessmentSession).where(AssessmentSession.total_balance_score.is_not(None))))
    return weekly_trend(sessions, weeks)


def weekly_trend(sessions: list[AssessmentSession], weeks: int) -> list[dict]:
    now = now_utc()
    start = now - timedelta(weeks=weeks - 1)
    buckets: list[dict] = []
    for index in range(weeks):
        week_start = (start + timedelta(weeks=index)).date()
        week_end = week_start + timedelta(days=7)
        scores = [
            session.total_balance_score
            for session in sessions
            if session.total_balance_score is not None and week_start <= as_aware(session.created_at).date() < week_end
        ]
        buckets.append(
            {
                "week_label": week_start.strftime("%b %d"),
                "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
                "median_score": round(median(scores), 1) if scores else None,
                "session_count": len(scores),
            }
        )
    return buckets


@router.get("/patient-status-distribution")
def patient_status_distribution(db: Session = Depends(get_db)) -> dict:
    patients, grouped = sessions_by_patient(db)
    counts = Counter(patient_status(patient, grouped.get(patient.id, [])) for patient in patients)
    return {
        "stable": counts["Stable"],
        "improving": counts["Improving"],
        "follow_up": counts["Follow-up"],
        "declining": counts["Declining"],
        "no_sessions": counts["No sessions"],
    }


@router.get("/score-distribution")
def score_distribution(db: Session = Depends(get_db)) -> list[dict]:
    patients, grouped = sessions_by_patient(db)
    bins = [("0-20", 0, 20), ("20-40", 20, 40), ("40-60", 40, 60), ("60-80", 60, 80), ("80-100", 80, 101)]
    latest_scores = [items[-1].total_balance_score for patient in patients if (items := grouped.get(patient.id, []))]
    return [
        {
            "range_label": label,
            "count": sum(1 for score in latest_scores if score is not None and low <= score < high),
        }
        for label, low, high in bins
    ]


@router.get("/pathology-breakdown")
def pathology_breakdown(db: Session = Depends(get_db)) -> list[dict]:
    patients = list(db.scalars(select(Patient)))
    counts = Counter(patient.pathology or "Unspecified" for patient in patients)
    return [{"pathology": pathology, "count": count} for pathology, count in counts.most_common()]


@router.get("/recent-assessments")
def recent_assessments(limit: int = Query(default=8, ge=1, le=20), db: Session = Depends(get_db)) -> list[dict]:
    sessions = list(
        db.scalars(
            select(AssessmentSession)
            .where(AssessmentSession.total_balance_score.is_not(None))
            .order_by(AssessmentSession.created_at.desc())
            .limit(limit)
        )
    )
    payloads = []
    for session in sessions:
        patient = db.get(Patient, session.patient_id)
        history = list(
            db.scalars(
                select(AssessmentSession)
                .where(AssessmentSession.patient_id == session.patient_id)
                .where(AssessmentSession.created_at <= session.created_at)
                .order_by(AssessmentSession.created_at.desc())
                .limit(4)
            )
        )
        item = session_payload(session)
        item["patient_name"] = patient.full_name if patient else "Unknown patient"
        item["patient_code"] = patient.patient_code if patient else ""
        item["score_history"] = [
            {"label": f"S{index + 1}", "score": value.total_balance_score}
            for index, value in enumerate(reversed(history))
            if value.total_balance_score is not None
        ]
        payloads.append(item)
    return payloads
