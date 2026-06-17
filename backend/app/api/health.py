from fastapi import APIRouter

from app.schemas import HealthResponse, SystemStatus

router = APIRouter(tags=["health"])


def _get_board_manager():
    from app.api.board import manager
    return manager


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        app="BalanceRehab API",
        database="active",
        default_mode="webcam",
    )


@router.get("/settings/status", response_model=SystemStatus)
def system_status() -> SystemStatus:
    board_connected = _get_board_manager().has_clients()
    return SystemStatus(
        database="active",
        demo_mode=True,
        webcam="available",
        esp32="connected" if board_connected else "not_connected",
        acquisition_modes=["webcam", "demo", "board", "combined"],
    )
