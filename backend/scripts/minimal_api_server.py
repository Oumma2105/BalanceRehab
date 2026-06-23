from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from statistics import median
from urllib.parse import parse_qs, urlparse

try:
    from serial.tools import list_ports as _serial_list_ports
except ImportError:
    _serial_list_ports = None


DB_PATH = Path(__file__).resolve().parents[1] / "data" / "balancerehab.db"


def rows(query: str, params=()):
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
      return [dict(row) for row in con.execute(query, params).fetchall()]
    finally:
      con.close()


def now_utc():
    return datetime.now(timezone.utc)


def parse_dt(value):
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def avg(values):
    clean = [float(value) for value in values if value is not None]
    return round(sum(clean) / len(clean), 1) if clean else None


def status_distribution():
    patients = rows("SELECT id, status FROM patients LEFT JOIN (SELECT patient_id, status, MAX(created_at) FROM sessions GROUP BY patient_id) latest ON latest.patient_id = patients.id")
    counts = {"stable": 0, "improving": 0, "follow_up": 0, "declining": 0, "no_sessions": 0}
    for patient in patients:
        status = patient.get("status") or "No sessions"
        if status == "Stable":
            counts["stable"] += 1
        elif status == "Improving":
            counts["improving"] += 1
        elif status == "Follow-up":
            counts["follow_up"] += 1
        elif status == "Declining":
            counts["declining"] += 1
        else:
            counts["no_sessions"] += 1
    return counts


def weekly_trend(weeks=12):
    sessions = rows("SELECT created_at, total_balance_score FROM sessions WHERE total_balance_score IS NOT NULL")
    now = now_utc()
    start = now - timedelta(weeks=weeks - 1)
    payload = []
    for index in range(weeks):
        week_start = (start + timedelta(weeks=index)).date()
        week_end = week_start + timedelta(days=7)
        scores = [
            float(session["total_balance_score"])
            for session in sessions
            if (dt := parse_dt(session["created_at"])) and week_start <= dt.date() < week_end
        ]
        payload.append(
            {
                "week_label": datetime.combine(week_start, datetime.min.time()).strftime("%b %d"),
                "avg_score": avg(scores),
                "median_score": round(median(scores), 1) if scores else None,
                "session_count": len(scores),
            }
        )
    return payload


def patient_json(row):
    return {
        "id": row["id"],
        "patient_code": row["patient_code"],
        "full_name": row["full_name"],
        "age": row["age"],
        "sex": row["sex"],
        "height_cm": row["height_cm"],
        "weight_kg": row["weight_kg"],
        "dominant_side": row["dominant_side"],
        "pathology": row["pathology"],
        "clinical_goal": row["clinical_goal"],
        "clinical_notes": row["clinical_notes"],
        "latest_score": row.get("latest_score"),
        "last_assessment_date": row.get("last_assessment_date"),
        "status": row.get("status") or "No sessions",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def session_json(row):
    row["sensor_samples"] = []
    row["posture_samples"] = []
    row["recommendations"] = []
    row["movement_labels"] = []
    return row


class Handler(BaseHTTPRequestHandler):
    def send_json(self, payload, status=200):
        data = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        path = url.path
        query = parse_qs(url.query)
        if path == "/api/health":
            return self.send_json({"status": "ok", "app": "BalanceRehab API", "database": "active", "default_mode": "webcam"})
        if path == "/api/settings/status":
            return self.send_json({"database": "active", "demo_mode": True, "webcam": "available", "esp32": "prototype", "acquisition_modes": ["webcam", "demo", "board", "combined"]})
        if path == "/api/patients":
            payload = rows(
                """
                SELECT p.*, s.total_balance_score latest_score, s.created_at last_assessment_date, s.status
                FROM patients p
                LEFT JOIN sessions s ON s.id = (
                  SELECT id FROM sessions WHERE patient_id = p.id ORDER BY created_at DESC LIMIT 1
                )
                ORDER BY p.created_at DESC
                """
            )
            return self.send_json([patient_json(row) for row in payload])
        if path == "/api/sessions":
            return self.send_json([session_json(row) for row in rows("SELECT * FROM sessions ORDER BY created_at DESC")])
        if path == "/api/reports":
            return self.send_json([])
        if path == "/api/rehab-games":
            return self.send_json(rows("SELECT * FROM rehab_game_sessions ORDER BY created_at DESC"))
        if path == "/api/dashboard/kpis":
            sessions = rows("SELECT * FROM sessions WHERE total_balance_score IS NOT NULL")
            patients = rows("SELECT id FROM patients")
            now = now_utc()
            week_start = now - timedelta(days=7)
            today = now.date()
            month_start = now - timedelta(days=30)
            previous_month = now - timedelta(days=60)
            month_scores = [s["total_balance_score"] for s in sessions if (dt := parse_dt(s["created_at"])) and dt >= month_start]
            previous_scores = [s["total_balance_score"] for s in sessions if (dt := parse_dt(s["created_at"])) and previous_month <= dt < month_start]
            average_score = avg(month_scores or [s["total_balance_score"] for s in sessions])
            previous_score = avg(previous_scores)
            trend = round((average_score or 0) - (previous_score or average_score or 0), 1)
            status_counts = status_distribution()
            return self.send_json({
                "total_patients": len(patients),
                "active_patients": len({s["patient_id"] for s in sessions if (dt := parse_dt(s["created_at"])) and dt >= month_start}),
                "follow_up_queue": status_counts["follow_up"] + status_counts["declining"],
                "average_score": average_score,
                "sessions_today": sum(1 for s in sessions if (dt := parse_dt(s["created_at"])) and dt.date() == today),
                "sessions_this_week": sum(1 for s in sessions if (dt := parse_dt(s["created_at"])) and dt >= week_start),
                "trend_direction": "up" if trend >= 0 else "down",
                "trend_value": abs(trend),
                "declining_count": status_counts["declining"],
                "no_recent_count": 0,
                "score_sparkline": weekly_trend(8),
                "weekly_bars": [],
            })
        if path == "/api/dashboard/clinic-trend":
            return self.send_json(weekly_trend(int(query.get("weeks", [12])[0])))
        if path == "/api/dashboard/patient-status-distribution":
            return self.send_json(status_distribution())
        if path == "/api/dashboard/score-distribution":
            scores = [row["total_balance_score"] for row in rows("SELECT s.total_balance_score FROM sessions s JOIN (SELECT patient_id, MAX(created_at) latest FROM sessions GROUP BY patient_id) x ON x.patient_id=s.patient_id AND x.latest=s.created_at")]
            bins = [("0-20", 0, 20), ("20-40", 20, 40), ("40-60", 40, 60), ("60-80", 60, 80), ("80-100", 80, 101)]
            return self.send_json([{"range_label": label, "count": sum(1 for score in scores if score is not None and low <= score < high)} for label, low, high in bins])
        if path == "/api/dashboard/pathology-breakdown":
            return self.send_json(rows("SELECT COALESCE(pathology, 'Unspecified') pathology, COUNT(*) count FROM patients GROUP BY pathology ORDER BY count DESC"))
        if path == "/api/dashboard/recent-assessments":
            limit = int(query.get("limit", [8])[0])
            payload = rows(
                """
                SELECT s.*, p.full_name patient_name, p.patient_code
                FROM sessions s JOIN patients p ON p.id = s.patient_id
                WHERE s.total_balance_score IS NOT NULL
                ORDER BY s.created_at DESC LIMIT ?
                """,
                (limit,),
            )
            return self.send_json([
                {
                    "id": row["id"],
                    "patient_id": row["patient_id"],
                    "patient_name": row["patient_name"],
                    "patient_code": row["patient_code"],
                    "date": row["created_at"],
                    "test_type": row["test_type"],
                    "vision_condition": row["visual_condition"],
                    "balance_score": row["total_balance_score"],
                    "status": row["status"],
                    "score_history": [
                        {"label": f"S{i+1}", "score": h["total_balance_score"]}
                        for i, h in enumerate(reversed(rows("SELECT total_balance_score FROM sessions WHERE patient_id=? AND created_at<=? ORDER BY created_at DESC LIMIT 4", (row["patient_id"], row["created_at"]))))
                    ],
                }
                for row in payload
            ])
        if path == "/api/esp32/ports":
            ports = []
            if _serial_list_ports is not None:
                ports = [
                    {"device": p.device, "name": p.name, "description": p.description, "hwid": p.hwid}
                    for p in _serial_list_ports.comports()
                ]
            return self.send_json({"ports": ports})
        if path == "/api/esp32/status":
            return self.send_json({"connected": False, "status": "disconnected", "port": None, "baud_rate": 115200, "latest_packet": None, "sensor_health": {}, "error": None})
        return self.send_json({"detail": "Not found"}, 404)

    def log_message(self, *args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8010), Handler).serve_forever()
