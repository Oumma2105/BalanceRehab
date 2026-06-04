from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Report
from app.models import Session as AssessmentSession
from app.schemas import ReportCreate, ReportRead

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("", response_model=list[ReportRead])
def list_reports(
    patient_id: int | None = Query(default=None),
    session_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[Report]:
    query = select(Report).order_by(Report.generated_at.desc())
    if patient_id is not None:
        query = query.where(Report.patient_id == patient_id)
    if session_id is not None:
        query = query.where(Report.session_id == session_id)
    return list(db.scalars(query))


@router.post("", response_model=ReportRead, status_code=201)
def create_report(payload: ReportCreate, db: Session = Depends(get_db)) -> Report:
    session = db.get(AssessmentSession, payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    report = Report(
        report_id=next_report_id(),
        patient_id=session.patient_id,
        session_id=session.id,
        report_file_path=payload.report_file_path or "",
        language=payload.language,
        acquisition_mode=payload.acquisition_mode,
        downloadable=bool(payload.report_file_path),
        summary=payload.summary,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("/{report_id}", response_model=ReportRead)
def get_report(report_id: int, db: Session = Depends(get_db)) -> Report:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.delete("/{report_id}", status_code=204)
def delete_report(report_id: int, db: Session = Depends(get_db)) -> None:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    db.delete(report)
    db.commit()


def next_report_id() -> str:
    return f"R-{datetime.utcnow().strftime('%y%m%d%H%M%S%f')[-10:]}"
