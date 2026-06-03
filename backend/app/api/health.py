from fastapi import APIRouter

from app.schemas import HealthResponse, SystemStatus

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        app="BalanceRehab API",
        database="active",
        default_mode="demo",
    )


@router.get("/settings/status", response_model=SystemStatus)
def system_status() -> SystemStatus:
    return SystemStatus(
        database="active",
        demo_mode=True,
        webcam="demo_mode",
        esp32="demo_mode",
        acquisition_modes=["demo", "real"],
    )
