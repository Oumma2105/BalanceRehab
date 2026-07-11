from __future__ import annotations

import random
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import hypot
from pathlib import Path


DB_PATH = Path(__file__).resolve().parents[1] / "data" / "balancerehab.db"
RNG = random.Random(20260622)


@dataclass(frozen=True)
class Archetype:
    key: str
    status: str
    session_min: int
    session_max: int


ARCHETYPES = {
    "good_responder": Archetype("good_responder", "Improving", 8, 12),
    "plateau": Archetype("plateau", "Stable", 8, 11),
    "struggling": Archetype("struggling", "Follow-up", 8, 12),
    "recent_admission": Archetype("recent_admission", "Follow-up", 1, 3),
    "declining": Archetype("declining", "Declining", 8, 12),
}


def clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, value))


def interpolate_scores(start: float, end: float, count: int, noise: float) -> list[float]:
    if count == 1:
        return [round(clamp(end), 1)]
    return [
        round(clamp(start + ((end - start) * index / (count - 1)) + RNG.uniform(-noise, noise), 40, 95), 1)
        for index in range(count)
    ]


def generate_score_path(archetype: Archetype) -> list[float]:
    count = RNG.randint(archetype.session_min, archetype.session_max)
    if archetype.key == "recent_admission":
        return [round(RNG.uniform(40, 65), 1) for _ in range(count)]
    if archetype.key == "good_responder":
        return interpolate_scores(RNG.uniform(45, 65), RNG.uniform(75, 92), count, 2.2)
    if archetype.key == "plateau":
        start = RNG.uniform(55, 70)
        plateau = RNG.uniform(72, 85)
        scores = []
        for index in range(count):
            if index < 5:
                scores.append(start + ((plateau - start) * index / 4) + RNG.uniform(-1.8, 1.8))
            else:
                scores.append(plateau + RNG.uniform(-3, 3))
        return [round(clamp(value, 38, 95), 1) for value in scores]
    if archetype.key == "struggling":
        scores = interpolate_scores(RNG.uniform(30, 50), RNG.uniform(50, 68), count, 3.5)
        return [
            round(clamp(score - RNG.uniform(8, 12), 40, 78), 1) if (index + 1) % 3 == 0 else score
            for index, score in enumerate(scores)
        ]

    start = RNG.uniform(65, 75)
    peak = RNG.uniform(80, 85)
    end = RNG.uniform(50, 60)
    scores = []
    for index in range(count):
        if index < 5:
            scores.append(start + ((peak - start) * index / 4) + RNG.uniform(-1.5, 1.5))
        else:
            remaining = max(1, count - 6)
            scores.append(peak + ((end - peak) * (index - 5) / remaining) + RNG.uniform(-2.5, 2.5))
    return [round(clamp(value, 40, 95), 1) for value in scores]


def assign_archetypes(patients: list[sqlite3.Row]) -> dict[int, Archetype]:
    declining_names = {"Anas El Idrissi", "Yasmina Filali"}
    assignments: dict[int, Archetype] = {}
    quotas = {"good_responder": 20, "plateau": 13, "struggling": 8, "recent_admission": 5, "declining": 5}
    used = {key: 0 for key in quotas}

    for patient in patients:
        if patient["full_name"] in declining_names:
            assignments[patient["id"]] = ARCHETYPES["declining"]
            used["declining"] += 1

    pathology_weights = {
        "Stroke": ["good_responder", "good_responder", "plateau", "struggling"],
        "Vestibular disorder": ["good_responder", "plateau", "recent_admission"],
        "Parkinson's disease": ["plateau", "struggling", "declining", "good_responder"],
        "Multiple sclerosis": ["plateau", "struggling", "declining", "good_responder"],
        "Cerebellar ataxia": ["struggling", "plateau", "good_responder", "declining"],
        "Peripheral neuropathy": ["plateau", "good_responder", "struggling"],
    }
    for patient in patients:
        if patient["id"] in assignments:
            continue
        choices = pathology_weights.get(patient["pathology"] or "", ["good_responder", "plateau", "recent_admission"])
        available = [choice for choice in choices if used[choice] < quotas[choice]]
        if not available:
            available = [key for key, quota in quotas.items() if used[key] < quota]
        key = RNG.choice(available)
        used[key] += 1
        assignments[patient["id"]] = ARCHETYPES[key]
    return assignments


def session_dates(archetype: Archetype, count: int) -> list[datetime]:
    now = datetime.now(timezone.utc).replace(minute=RNG.choice([0, 10, 20, 30, 40, 50]), second=0, microsecond=0)
    if archetype.key == "recent_admission":
        first = now - timedelta(days=RNG.randint(1, 6))
        dates = [first + timedelta(days=index * RNG.randint(2, 3)) for index in range(count)]
    else:
        latest = now - timedelta(days=RNG.randint(0, 6))
        dates = [latest]
        for _ in range(count - 1):
            dates.append(dates[-1] - timedelta(days=RNG.randint(3, 10)))
        dates.reverse()
    return [date.replace(hour=RNG.randint(8, 16)) for date in dates]


def metrics_for_score(score: float) -> dict[str, float | int]:
    target = clamp(score + RNG.uniform(-1.2, 1.2), 40, 95)
    deficit = 100 - target
    trunk = clamp(deficit * 0.08 + RNG.uniform(-0.35, 0.45), 0.6, 12)
    instability = int(clamp(round(deficit * 0.045 + RNG.uniform(-0.7, 0.8)), 0, 8))
    ml = clamp(deficit * 0.028 + RNG.uniform(-0.15, 0.2), 0.3, 3.5)
    ap = clamp((deficit - (ml * 6) - (instability * 3) - (trunk * 2)) / 8, 0.5, 5.5)
    sway_velocity = clamp(0.55 + deficit * 0.026 + RNG.uniform(-0.15, 0.18), 0.5, 3.4)
    shoulder = clamp(trunk * RNG.uniform(0.75, 1.15) + RNG.uniform(0.2, 1.4), 0.5, 20)
    hip = clamp(trunk * RNG.uniform(0.55, 0.95) + RNG.uniform(0.1, 1.1), 0.3, 15)
    center = clamp(hypot(ap, ml) * RNG.uniform(4.5, 7.0) + trunk * 0.7, 2, 40)
    balance = clamp(100 - (ap * 8) - (ml * 6) - (instability * 3) - (trunk * 2))
    posture = clamp(100 - (trunk * 4) - (shoulder * 1.5) - (hip * 1.5))
    stability = clamp(100 - (sway_velocity * 15) - (instability * 4))
    resultant = hypot(ap, ml)
    return {
        "total_balance_score": round(balance, 1),
        "posture_stability_score": round(posture, 1),
        "board_stability_score": round(stability, 1),
        "mean_sway_ap": round(ap, 2),
        "mean_sway_ml": round(ml, 2),
        "max_sway_ap": round(ap * RNG.uniform(1.7, 2.6), 2),
        "max_sway_ml": round(ml * RNG.uniform(1.7, 2.6), 2),
        "mean_resultant_sway": round(resultant, 2),
        "max_resultant_sway": round(resultant * RNG.uniform(1.8, 2.7), 2),
        "rms_sway": round(resultant * RNG.uniform(0.9, 1.2), 2),
        "path_length": round((sway_velocity * 30) + RNG.uniform(8, 22), 1),
        "sensor_quality": round(RNG.uniform(82, 98), 1),
        "sway_velocity": round(sway_velocity, 2),
        "instability_events": instability,
        "trunk_deviation": round(trunk, 1),
        "shoulder_asymmetry": round(shoulder, 1),
        "hip_asymmetry": round(hip, 1),
        "body_center_deviation": round(center, 1),
        "sample_count": RNG.randint(400, 450),
        "tracking_quality": round(RNG.uniform(0.75, 0.98), 3),
    }


def interpretation(status: str, score: float) -> str:
    if status == "Declining":
        return "Recent assessment trend shows reduced postural control; prioritize supervised balance progression and reassessment."
    if score >= 75:
        return "Assessment indicators are within target range for functional balance progression."
    if score >= 60:
        return "Moderate instability detected; continue targeted stability and proprioceptive rehabilitation."
    return "High instability detected; recommend therapist-supervised follow-up and conservative progression."


def clear_existing_demo(conn: sqlite3.Connection) -> None:
    for table in ["recommendations", "movement_labels", "posture_samples", "sensor_samples", "reports"]:
        conn.execute(f"DELETE FROM {table}")
    conn.execute("DELETE FROM rehab_game_sessions")
    conn.execute("DELETE FROM sessions")


def insert_session(conn: sqlite3.Connection, patient_id: int, archetype: Archetype, date: datetime, index: int, metrics: dict) -> int:
    payload = {
        "patient_id": patient_id,
        "acquisition_mode": "combined" if RNG.random() < 0.16 else "webcam",
        "is_demo": 1,
        "test_type": "static" if index % 2 == 0 else "dynamic",
        "support_ring": "installed",
        "visual_condition": "eyes_open" if index % 2 == 0 else "eyes_closed",
        "duration_seconds": 30,
        "notes": f"{archetype.key.replace('_', ' ').title()} demo trajectory",
        "status": archetype.status,
        "session_status": "complete",
        "interpretation": interpretation(archetype.status, metrics["total_balance_score"]),
        "created_at": date.isoformat(sep=" "),
        "updated_at": date.isoformat(sep=" "),
        **metrics,
    }
    columns = ", ".join(payload.keys())
    placeholders = ", ".join("?" for _ in payload)
    conn.execute(f"INSERT INTO sessions ({columns}) VALUES ({placeholders})", list(payload.values()))
    return int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])


def create_rehab_sessions(conn: sqlite3.Connection, patient_id: int, sessions: list[dict]) -> int:
    if not sessions:
        return 0
    total = 0
    selected = sessions[-min(len(sessions), RNG.randint(1, 3)) :]
    for session in selected:
        score = clamp(session["score"] + RNG.uniform(-15, 15), 20, 100)
        created_at = session["date"] + timedelta(days=RNG.randint(1, 3), hours=RNG.randint(0, 4))
        payload = {
            "patient_id": patient_id,
            "game_type": "balance_freeze" if RNG.random() < 0.7 else "weight_shift",
            "difficulty": RNG.choice(["intro", "medium", "medium", "advanced"]),
            "duration_seconds": RNG.randint(45, 120),
            "acquisition_mode": "webcam",
            "score": round(score, 1),
            "accuracy": round(clamp(score + RNG.uniform(-8, 8)), 1),
            "stability": round(clamp(score + RNG.uniform(-10, 6)), 1),
            "smoothness": round(clamp(score + RNG.uniform(-6, 10)), 1),
            "reaction_time_ms": round(RNG.uniform(520, 1100), 1),
            "success_rate": round(clamp(score + RNG.uniform(-12, 12)), 1),
            "tracking_quality": round(RNG.uniform(0.78, 0.98), 3),
            "exits": RNG.randint(0, 5),
            "targets_hit": RNG.randint(8, 24),
            "targets_missed": RNG.randint(0, 8),
            "created_at": created_at.isoformat(sep=" "),
        }
        columns = ", ".join(payload.keys())
        placeholders = ", ".join("?" for _ in payload)
        conn.execute(f"INSERT INTO rehab_game_sessions ({columns}) VALUES ({placeholders})", list(payload.values()))
        total += 1
    return total


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        patients = conn.execute("SELECT * FROM patients ORDER BY id").fetchall()
        assignments = assign_archetypes(patients)
        clear_existing_demo(conn)

        session_total = 0
        rehab_total = 0
        scores: list[float] = []
        archetype_counts = {key: 0 for key in ARCHETYPES}

        for patient in patients:
            archetype = assignments[patient["id"]]
            archetype_counts[archetype.key] += 1
            path = generate_score_path(archetype)
            dates = session_dates(archetype, len(path))
            patient_sessions = []
            for index, score in enumerate(path):
                metrics = metrics_for_score(score)
                insert_session(conn, patient["id"], archetype, dates[index], index, metrics)
                patient_sessions.append({"score": metrics["total_balance_score"], "date": dates[index]})
                scores.append(metrics["total_balance_score"])
                session_total += 1
            rehab_total += create_rehab_sessions(conn, patient["id"], patient_sessions)

        conn.commit()
        print(f"Total sessions generated: {session_total}")
        print(f"Total rehab sessions generated: {rehab_total}")
        print(f"Average balance score: {sum(scores) / len(scores):.1f}")
        print(f"Patients with improving trajectory: {archetype_counts['good_responder']}")
        print(f"Patients with declining trajectory: {archetype_counts['declining']}")
        print(f"Archetype counts: {archetype_counts}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
