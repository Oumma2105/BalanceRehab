from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.serial_acquisition import serial_service

router = APIRouter(prefix="/esp32", tags=["esp32-serial"])


class SerialConnectRequest(BaseModel):
    port: str = Field(min_length=1)
    baud_rate: int = Field(default=115200, ge=9600, le=921600)
    session_id: int | None = None


class SerialSessionRequest(BaseModel):
    session_id: int | None = None


class CalibrationRequest(BaseModel):
    duration_seconds: float = Field(default=4.0, ge=1.0, le=10.0)


@router.get("/ports")
def scan_ports() -> dict:
    return {"ports": serial_service.list_ports()}


@router.post("/connect")
def connect_serial(payload: SerialConnectRequest) -> dict:
    try:
        return serial_service.connect(payload.port, payload.baud_rate, payload.session_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/disconnect")
def disconnect_serial() -> dict:
    return serial_service.disconnect()


@router.get("/status")
def serial_status() -> dict:
    return serial_service.status()


@router.post("/session")
def attach_session(payload: SerialSessionRequest) -> dict:
    return serial_service.attach_session(payload.session_id)


@router.post("/calibrate")
def start_calibration(payload: CalibrationRequest) -> dict:
    return serial_service.start_calibration(payload.duration_seconds)


@router.post("/zero")
def zero_baseline() -> dict:
    try:
        return serial_service.zero_baseline()
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
