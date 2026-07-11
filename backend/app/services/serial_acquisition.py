from __future__ import annotations

import json
import math
import threading
import time
from dataclasses import dataclass, field
from statistics import mean
from typing import Any

try:
    import serial
    from serial.tools import list_ports
except ImportError:  # pragma: no cover - exercised when dependency is absent locally
    serial = None
    list_ports = None

from app.api.board import _normalize_packet, _process_packet


CHANNELS = ("front_left", "front_right", "rear_left", "rear_right")
COMPACT_KEYS = {"front_left": "fl", "front_right": "fr", "rear_left": "rl", "rear_right": "rr"}
DIRECTIONAL_CHANNELS = ("front", "rear", "left", "right")


@dataclass
class SerialState:
    connected: bool = False
    port: str | None = None
    baud_rate: int = 115200
    session_id: int | None = None
    status: str = "disconnected"
    error: str | None = None
    latest_packet: dict[str, Any] | None = None
    latest_result: dict[str, Any] | None = None
    sensor_health: dict[str, str] = field(default_factory=lambda: {key: "unknown" for key in CHANNELS})
    baseline: dict[str, float] = field(default_factory=dict)
    calibration: dict[str, Any] = field(default_factory=lambda: {"active": False, "samples": 0, "duration_seconds": 0})
    samples_read: int = 0
    invalid_json_count: int = 0
    _consecutive_errors: int = 0
    started_at: float | None = None


class SerialAcquisitionService:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._state = SerialState()
        self._serial = None
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._ema: dict[str, float] = {}
        self._calibration_until = 0.0
        self._calibration_samples: list[dict[str, float]] = []

    def list_ports(self) -> list[dict[str, Any]]:
        if list_ports is None:
            return []
        return [
            {
                "device": port.device,
                "name": port.name,
                "description": port.description,
                "hwid": port.hwid,
            }
            for port in list_ports.comports()
        ]

    def connect(self, port: str, baud_rate: int = 115200, session_id: int | None = None) -> dict[str, Any]:
        if serial is None:
            raise RuntimeError("pyserial is not installed. Install backend requirements and restart the API.")
        if self.status()["connected"]:
            self.disconnect()

        try:
            handle = serial.Serial(port=port, baudrate=baud_rate, timeout=1, write_timeout=1)
            time.sleep(1.8)
            handle.reset_input_buffer()
        except Exception as exc:
            with self._lock:
                self._state.status = "error"
                self._state.error = f"Could not open {port}: {exc}"
            raise RuntimeError(self._state.error) from exc

        with self._lock:
            self._serial = handle
            self._stop_event.clear()
            self._ema = {}
            self._calibration_samples = []
            self._state = SerialState(
                connected=True,
                port=port,
                baud_rate=baud_rate,
                session_id=session_id,
                status="connected",
                started_at=time.time(),
            )

        self._thread = threading.Thread(target=self._read_loop, name="esp32-serial-reader", daemon=True)
        self._thread.start()
        return self.status()

    def disconnect(self) -> dict[str, Any]:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        with self._lock:
            if self._serial:
                try:
                    self._serial.close()
                except Exception:
                    pass
            self._serial = None
            self._thread = None
            self._state.connected = False
            self._state.status = "disconnected"
            self._state.error = None
        return self.status()

    def attach_session(self, session_id: int | None) -> dict[str, Any]:
        with self._lock:
            self._state.session_id = session_id
        return self.status()

    def start_calibration(self, duration_seconds: float = 4.0) -> dict[str, Any]:
        with self._lock:
            self._calibration_samples = []
            self._calibration_until = time.time() + max(1.0, min(10.0, float(duration_seconds)))
            self._state.calibration = {"active": True, "samples": 0, "duration_seconds": duration_seconds}
            self._state.status = "calibrating"
        return self.status()

    def zero_baseline(self) -> dict[str, Any]:
        with self._lock:
            latest = self._state.latest_packet or {}
            raw = latest.get("raw") if isinstance(latest.get("raw"), dict) else latest
            keys = DIRECTIONAL_CHANNELS if all(key in raw for key in DIRECTIONAL_CHANNELS) else CHANNELS
            baseline = {key: float(raw[key]) for key in keys if _is_number(raw.get(key))}
            if len(baseline) != len(CHANNELS):
                if len(baseline) == len(DIRECTIONAL_CHANNELS):
                    self._state.baseline = baseline
                    self._ema = {}
                    return self.status()
                raise RuntimeError("Cannot zero baseline until a valid packet from all four sensors is available.")
            self._state.baseline = baseline
            self._ema = {}
        return self.status()

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "connected": self._state.connected,
                "port": self._state.port,
                "baud_rate": self._state.baud_rate,
                "session_id": self._state.session_id,
                "status": self._state.status,
                "error": self._state.error,
                "latest_packet": self._state.latest_packet,
                "latest_result": self._state.latest_result,
                "sensor_health": self._state.sensor_health,
                "baseline": self._state.baseline,
                "calibration": self._state.calibration,
                "samples_read": self._state.samples_read,
                "invalid_json_count": self._state.invalid_json_count,
                "ports_available": len(self.list_ports()),
            }

    def _read_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                raw = self._serial.readline() if self._serial else b""
            except Exception as exc:
                with self._lock:
                    self._state.connected = False
                    self._state.status = "error"
                    self._state.error = f"Serial board disconnected or busy: {exc}"
                break

            if not raw:
                continue
            line = raw.decode("latin-1").encode("ascii", errors="ignore").decode("ascii").strip()
            if not line:
                continue
            self._handle_line(line)

    def _handle_line(self, line: str) -> None:
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            with self._lock:
                self._state.invalid_json_count += 1
                self._state._consecutive_errors += 1
                if self._state._consecutive_errors >= 5:
                    self._state.error = f"Invalid JSON from ESP32: {line[:120]}"
            return

        packet = self._normalize_serial_packet(data)
        if packet is None:
            with self._lock:
                self._state.error = "Missing timestamp or one of FL/FR/RL/RR in ESP32 packet."
            return

        with self._lock:
            self._state.samples_read += 1
            self._state.latest_packet = packet
            self._state.sensor_health = packet.get("quality", {})
            self._state._consecutive_errors = 0
            self._state.error = None
            self._maybe_update_calibration(packet)
            session_id = self._state.session_id

        if session_id:
            result = _process_packet(session_id, packet)
            with self._lock:
                self._state.latest_result = result
                if result.get("error"):
                    self._state.error = result["error"]
                elif not self._state.calibration.get("active"):
                    self._state.status = "connected"

    def _normalize_serial_packet(self, data: dict[str, Any]) -> dict[str, Any] | None:
        directional = self._normalize_directional_packet(data)
        if directional is not None:
            return directional

        normalized = _normalize_packet(data)
        if normalized is None:
            return None

        raw_values = {}
        health = {}
        for key in CHANNELS:
            value = normalized.get(key)
            if not _is_number(value):
                value = _error_value(data, key)
            if not _is_number(value):
                return None
            numeric = float(value)
            raw_values[key] = numeric
            health[key] = "ok" if 2.0 <= numeric <= 250.0 else "out_of_range"

        relative = self._relative_values(raw_values)
        fl, fr, rl, rr = (relative[key] for key in CHANNELS)
        ap = ((fl + fr) * 0.5) - ((rl + rr) * 0.5)
        ml = ((fl + rl) * 0.5) - ((fr + rr) * 0.5)

        packet = {
            "timestamp_ms": normalized["timestamp_ms"],
            "front_left": round(fl, 3),
            "front_right": round(fr, 3),
            "rear_left": round(rl, 3),
            "rear_right": round(rr, 3),
            "anterior_posterior_sway": round(ap, 3),
            "medial_lateral_sway": round(ml, 3),
            "resultant_sway": round(math.hypot(ap, ml), 3),
            "quality": health,
            "raw": raw_values,
            "status": data.get("status") or ("ok" if all(v == "ok" for v in health.values()) else "sensor_warning"),
        }
        return packet

    def _normalize_directional_packet(self, data: dict[str, Any]) -> dict[str, Any] | None:
        ts = data.get("timestamp_ms") if data.get("timestamp_ms") is not None else data.get("t")
        if ts is None or not all(key in data for key in DIRECTIONAL_CHANNELS):
            return None

        raw_values = {}
        health = {}
        for key in DIRECTIONAL_CHANNELS:
            value = data.get(key)
            if not _is_number(value):
                value = _error_value(data, key)
            if not _is_number(value):
                return None
            numeric = float(value)
            raw_values[key] = numeric
            health[key] = "ok" if 2.0 <= numeric <= 250.0 else "out_of_range"

        relative = self._relative_directional_values(raw_values)
        front = relative["front"]
        rear = relative["rear"]
        left = relative["left"]
        right = relative["right"]
        ap = front - rear
        ml = left - right

        # Store directional deltas in the existing SensorSample corner columns
        # so old database/report paths remain compatible.
        packet = {
            "timestamp_ms": int(ts),
            "front_left": round(front, 3),
            "front_right": round(right, 3),
            "rear_left": round(left, 3),
            "rear_right": round(rear, 3),
            "anterior_posterior_sway": round(ap, 3),
            "medial_lateral_sway": round(ml, 3),
            "resultant_sway": round(math.hypot(ap, ml), 3),
            "quality": health,
            "raw": raw_values,
            "layout": "directional",
            "status": data.get("status") or ("ok" if all(v == "ok" for v in health.values()) else "sensor_warning"),
        }
        return packet

    def _relative_values(self, raw_values: dict[str, float]) -> dict[str, float]:
        with self._lock:
            baseline = dict(self._state.baseline)
        values = {}
        for key, value in raw_values.items():
            relative = value - baseline.get(key, value)
            previous = self._ema.get(key)
            smoothed = relative if previous is None else (previous * 0.72) + (relative * 0.28)
            self._ema[key] = smoothed
            values[key] = smoothed
        return values

    def _relative_directional_values(self, raw_values: dict[str, float]) -> dict[str, float]:
        with self._lock:
            baseline = dict(self._state.baseline)
        values = {}
        for key, value in raw_values.items():
            relative = value - baseline.get(key, value)
            ema_key = f"directional_{key}"
            previous = self._ema.get(ema_key)
            smoothed = relative if previous is None else (previous * 0.72) + (relative * 0.28)
            self._ema[ema_key] = smoothed
            values[key] = smoothed
        return values

    def _maybe_update_calibration(self, packet: dict[str, Any]) -> None:
        if not self._state.calibration.get("active"):
            return
        raw_values = packet.get("raw") or {}
        calibration_keys = DIRECTIONAL_CHANNELS if all(key in raw_values for key in DIRECTIONAL_CHANNELS) else CHANNELS
        if len(raw_values) == len(calibration_keys) and all(_is_number(raw_values.get(key)) for key in calibration_keys):
            self._calibration_samples.append({key: float(raw_values[key]) for key in calibration_keys})
        remaining = self._calibration_until - time.time()
        self._state.calibration = {
            "active": remaining > 0,
            "samples": len(self._calibration_samples),
            "duration_seconds": self._state.calibration.get("duration_seconds", 0),
        }
        if remaining > 0:
            return
        if self._calibration_samples:
            self._state.baseline = {
                key: round(mean(sample[key] for sample in self._calibration_samples), 3)
                for key in self._calibration_samples[0].keys()
            }
            self._ema = {}
            self._state.error = None
        else:
            self._state.error = "Calibration failed: no valid ESP32 samples were received."
        self._state.status = "connected" if self._state.connected else "disconnected"
        self._state.calibration["active"] = False


def _error_value(data: dict[str, Any], key: str) -> float | None:
    errors = data.get("errors") if isinstance(data.get("errors"), dict) else {}
    value = errors.get(key) or errors.get(COMPACT_KEYS.get(key, ""))
    return float(value) if _is_number(value) else None


def _is_number(value: Any) -> bool:
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


serial_service = SerialAcquisitionService()
