from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.models import SensorSample
from app.models import Session as AssessmentSession
from app.services.board_metrics import compute_board_metrics, sway_from_corner_loads, stability_from_sway

router = APIRouter(tags=["board"])


class _BoardConnectionManager:
    def __init__(self) -> None:
        self._clients: dict[int, list[WebSocket]] = {}

    async def connect(self, session_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.setdefault(session_id, []).append(ws)

    def disconnect(self, session_id: int, ws: WebSocket) -> None:
        clients = self._clients.get(session_id, [])
        if ws in clients:
            clients.remove(ws)
        if not clients:
            self._clients.pop(session_id, None)

    async def broadcast(self, session_id: int, message: dict[str, Any]) -> None:
        for ws in list(self._clients.get(session_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(session_id, ws)

    def has_clients(self, session_id: int | None = None) -> bool:
        if session_id is not None:
            return bool(self._clients.get(session_id))
        return bool(self._clients)

    def active_session_ids(self) -> list[int]:
        return list(self._clients.keys())


manager = _BoardConnectionManager()


@router.websocket("/ws/board/{session_id}")
async def board_stream(session_id: int, ws: WebSocket) -> None:
    await manager.connect(session_id, ws)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                await ws.send_json({"error": "invalid JSON"})
                continue

            packet = _normalize_packet(data)
            if packet is None:
                await ws.send_json({"error": "unrecognized packet format"})
                continue

            result = _process_packet(session_id, packet)
            await manager.broadcast(session_id, result)
    except WebSocketDisconnect:
        manager.disconnect(session_id, ws)


@router.get("/board/status")
def board_status() -> dict:
    return {
        "connected_sessions": manager.active_session_ids(),
        "any_connected": manager.has_clients(),
    }


def _normalize_packet(data: dict) -> dict | None:
    ts = data.get("timestamp_ms") if data.get("timestamp_ms") is not None else data.get("t")
    if ts is None:
        return None
    ts = int(ts)

    fl = data.get("front_left") if data.get("front_left") is not None else data.get("fl")
    fr = data.get("front_right") if data.get("front_right") is not None else data.get("fr")
    rl = data.get("rear_left") if data.get("rear_left") is not None else data.get("rl")
    rr = data.get("rear_right") if data.get("rear_right") is not None else data.get("rr")
    ap = data.get("anterior_posterior_sway") if data.get("anterior_posterior_sway") is not None else data.get("ap")
    ml = data.get("medial_lateral_sway") if data.get("medial_lateral_sway") is not None else data.get("ml")

    return {
        "timestamp_ms": ts,
        "front_left": fl,
        "front_right": fr,
        "rear_left": rl,
        "rear_right": rr,
        "anterior_posterior_sway": ap,
        "medial_lateral_sway": ml,
    }


def _process_packet(session_id: int, packet: dict) -> dict:
    ap = packet["anterior_posterior_sway"]
    ml = packet["medial_lateral_sway"]

    if ap is None or ml is None:
        proxy = _CornersProxy(packet)
        computed = sway_from_corner_loads(proxy)
        if computed:
            ap, ml = computed["ap"], computed["ml"]

    stability = stability_from_sway(ap, ml) if (ap is not None and ml is not None) else None

    with SessionLocal() as db:
        session = db.get(AssessmentSession, session_id)
        if session is None:
            return {
                "session_id": session_id,
                "timestamp_ms": packet["timestamp_ms"],
                "ap": round(ap, 3) if ap is not None else None,
                "ml": round(ml, 3) if ml is not None else None,
                "stability": round(stability, 1) if stability is not None else None,
                "persisted": False,
                "error": "session not found",
            }

        if session.acquisition_mode == "webcam":
            return {
                "session_id": session_id,
                "timestamp_ms": packet["timestamp_ms"],
                "ap": round(ap, 3) if ap is not None else None,
                "ml": round(ml, 3) if ml is not None else None,
                "stability": round(stability, 1) if stability is not None else None,
                "persisted": False,
                "error": "webcam-only sessions cannot include board samples",
            }

        sample = SensorSample(
            session_id=session_id,
            timestamp_ms=packet["timestamp_ms"],
            front_left=packet["front_left"] or 0,
            front_right=packet["front_right"] or 0,
            rear_left=packet["rear_left"] or 0,
            rear_right=packet["rear_right"] or 0,
            anterior_posterior_sway=round(ap, 3) if ap is not None else None,
            medial_lateral_sway=round(ml, 3) if ml is not None else None,
            stability_score=round(stability, 1) if stability is not None else None,
        )
        db.add(sample)
        db.flush()
        _update_session_metrics(session)
        session_metrics = {
            "total_balance_score": session.total_balance_score,
            "board_stability_score": session.board_stability_score,
            "mean_sway_ap": session.mean_sway_ap,
            "mean_sway_ml": session.mean_sway_ml,
            "max_sway_ap": session.max_sway_ap,
            "max_sway_ml": session.max_sway_ml,
            "mean_resultant_sway": session.mean_resultant_sway,
            "max_resultant_sway": session.max_resultant_sway,
            "rms_sway": session.rms_sway,
            "path_length": session.path_length,
            "sensor_quality": session.sensor_quality,
            "sway_velocity": session.sway_velocity,
            "instability_events": session.instability_events,
            "status": session.status,
        }
        db.commit()

    return {
        "session_id": session_id,
        "timestamp_ms": packet["timestamp_ms"],
        "ap": round(ap, 3) if ap is not None else None,
        "ml": round(ml, 3) if ml is not None else None,
        "stability": round(stability, 1) if stability is not None else None,
        "persisted": True,
        "session_metrics": session_metrics,
    }


def _update_session_metrics(session: AssessmentSession) -> None:
    metrics = compute_board_metrics(session.sensor_samples)
    for field, value in metrics.items():
        setattr(session, field, value)

    board_score = session.board_stability_score
    posture_score = session.posture_stability_score
    if session.acquisition_mode in {"combined", "combined_future"} and board_score is not None and posture_score is not None:
        session.total_balance_score = round((board_score * 0.6) + (posture_score * 0.4), 1)
    else:
        session.total_balance_score = board_score
    session.status = _status_from_score(session.total_balance_score)


def _status_from_score(score: float | None) -> str | None:
    if score is None:
        return None
    if score >= 80:
        return "Stable"
    if score >= 65:
        return "Follow-up"
    return "Declining"


class _CornersProxy:
    __slots__ = ("front_left", "front_right", "rear_left", "rear_right")

    def __init__(self, d: dict) -> None:
        self.front_left = d.get("front_left")
        self.front_right = d.get("front_right")
        self.rear_left = d.get("rear_left")
        self.rear_right = d.get("rear_right")
