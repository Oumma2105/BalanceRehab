from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import HealthResponse, SystemStatus

router = APIRouter(tags=["health"])


def _get_board_manager():
    from app.api.board import manager
    return manager


def _get_serial_service():
    from app.services.serial_acquisition import serial_service
    return serial_service


@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)) -> HealthResponse:
    database_status = database_health(db)
    return HealthResponse(
        status="ok" if database_status == "active" else "degraded",
        app="BalanceRehab API",
        database=database_status,
        default_mode="webcam",
    )


@router.get("/settings/status", response_model=SystemStatus)
def system_status(db: Session = Depends(get_db)) -> SystemStatus:
    board_connected = _get_board_manager().has_clients()
    serial_connected = _get_serial_service().status()["connected"]
    return SystemStatus(
        database=database_health(db),
        demo_mode=False,
        webcam="available",
        esp32="connected" if board_connected or serial_connected else "not_connected",
        acquisition_modes=["webcam", "demo", "board", "combined"],
    )


def database_health(db: Session) -> str:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return "unavailable"
    return "active"
