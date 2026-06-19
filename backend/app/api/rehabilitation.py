from collections import Counter
from math import hypot

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Patient, RehabilitationGameSample, RehabilitationGameSession, Session as AssessmentSession
from app.schemas import (
    RehabilitationAnalyticsRead,
    RehabilitationGameSessionCreate,
    RehabilitationGameSessionRead,
    RehabilitationGameSuggestion,
)

router = APIRouter(prefix="/rehabilitation", tags=["rehabilitation"])

GAME_TITLES = {
    "stability_challenge": "Stability Challenge",
    "weight_shift_trainer": "Weight Shift Trainer",
    "balloon_pop": "Balloon Pop",
    "path_following": "Path Following",
    "reach_touch": "Reach & Touch",
    "squat_trainer": "Squat Trainer",
    "single_leg_balance": "Single-Leg Balance Challenge",
    "obstacle_avoidance": "Obstacle Avoidance",
    "balance_maze": "Balance Maze",
}


@router.get("/games")
def list_games() -> list[dict]:
    return [
        {
            "game_type": "stability_challenge",
            "title": "Balance Freeze",
            "clinical_focus": "Static balance, postural control, sway reduction",
            "description": "Remain stable inside a target zone using body-center displacement from MediaPipe pose landmarks.",
        },
        {
            "game_type": "weight_shift_trainer",
            "title": "Weight Shift Trainer",
            "clinical_focus": "Directional weight transfer and reaction time",
            "description": "Lean left, right, forward, and backward to guide a balance cursor toward targets.",
        },
        {
            "game_type": "balloon_pop",
            "title": "Balloon Pop",
            "clinical_focus": "Upper-limb reach, reaction time, coordination",
            "description": "Pop targets using wrist/hand landmarks detected by MediaPipe.",
        },
        {
            "game_type": "path_following",
            "title": "Path Following",
            "clinical_focus": "Precision, smoothness, controlled sway",
            "description": "Follow a therapeutic path using body-center movement.",
        },
        {
            "game_type": "reach_touch",
            "title": "Reach & Touch",
            "clinical_focus": "Mobility, coordination, reaction speed",
            "description": "Touch targets around the screen using left or right hand landmarks.",
        },
        {
            "game_type": "squat_trainer",
            "title": "Squat Trainer",
            "clinical_focus": "Lower-limb strength, knee and hip control",
            "description": "Detect squat depth and movement quality from hip, knee, and ankle landmarks.",
        },
        {
            "game_type": "single_leg_balance",
            "title": "Single-Leg Balance Challenge",
            "clinical_focus": "Static stability and foot-lift control",
            "description": "Detect one-foot support and score balance duration and stability.",
        },
        {
            "game_type": "obstacle_avoidance",
            "title": "Obstacle Avoidance",
            "clinical_focus": "Dynamic balance and anticipatory postural control",
            "description": "Shift body position to avoid incoming objects.",
        },
        {
            "game_type": "balance_maze",
            "title": "Balance Maze",
            "clinical_focus": "Coordination and multi-directional balance control",
            "description": "Navigate a marker through a clinical maze with smooth balance control.",
        },
    ]


@router.get("/sessions", response_model=list[RehabilitationGameSessionRead])
def list_rehabilitation_sessions(
    patient_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[RehabilitationGameSession]:
    query = rehab_query().order_by(RehabilitationGameSession.created_at.desc())
    if patient_id is not None:
        query = query.where(RehabilitationGameSession.patient_id == patient_id)
    return list(db.scalars(query))


@router.post("/sessions", response_model=RehabilitationGameSessionRead, status_code=201)
def create_rehabilitation_session(
    payload: RehabilitationGameSessionCreate,
    db: Session = Depends(get_db),
) -> RehabilitationGameSession:
    if db.get(Patient, payload.patient_id) is None:
        raise HTTPException(status_code=404, detail="Patient not found")

    data = payload.model_dump(exclude={"samples"})
    fill_missing_scores(data, payload.samples)
    session = RehabilitationGameSession(**data)
    session.samples = [RehabilitationGameSample(**sample.model_dump()) for sample in payload.samples]
    db.add(session)
    db.commit()
    return load_rehab_session(session.id, db)


@router.get("/sessions/{session_id}", response_model=RehabilitationGameSessionRead)
def get_rehabilitation_session(session_id: int, db: Session = Depends(get_db)) -> RehabilitationGameSession:
    return load_rehab_session(session_id, db)


@router.get("/patients/{patient_id}/analytics", response_model=RehabilitationAnalyticsRead)
def rehabilitation_analytics(patient_id: int, db: Session = Depends(get_db)) -> RehabilitationAnalyticsRead:
    if db.get(Patient, patient_id) is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    sessions = list(
        db.scalars(
            select(RehabilitationGameSession)
            .where(RehabilitationGameSession.patient_id == patient_id)
            .order_by(RehabilitationGameSession.created_at.asc())
        )
    )
    scores = [session.score for session in sessions if session.score is not None]
    accuracies = [session.accuracy for session in sessions if session.accuracy is not None]
    stabilities = [session.stability for session in sessions if session.stability is not None]
    latest = sessions[-1] if sessions else None
    first = sessions[0] if sessions else None
    game_counts = Counter(session.game_type for session in sessions)

    return RehabilitationAnalyticsRead(
        patient_id=patient_id,
        session_count=len(sessions),
        latest_score=latest.score if latest else None,
        average_score=average(scores),
        score_change=round((latest.score or 0) - (first.score or 0), 1) if latest and first else None,
        average_accuracy=average(accuracies),
        average_stability=average(stabilities),
        most_trained_game=GAME_TITLES.get(game_counts.most_common(1)[0][0]) if game_counts else None,
        trend=[
            {
                "id": session.id,
                "label": f"R{index + 1}",
                "date": session.created_at,
                "game_type": session.game_type,
                "title": GAME_TITLES.get(session.game_type, session.game_type),
                "score": session.score,
                "accuracy": session.accuracy,
                "stability": session.stability,
                "smoothness": session.smoothness,
            }
            for index, session in enumerate(sessions)
        ],
        suggestions=suggest_games_for_patient(patient_id, db),
    )


@router.get("/patients/{patient_id}/suggestions", response_model=list[RehabilitationGameSuggestion])
def rehabilitation_suggestions(patient_id: int, db: Session = Depends(get_db)) -> list[RehabilitationGameSuggestion]:
    if db.get(Patient, patient_id) is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    return suggest_games_for_patient(patient_id, db)


def rehab_query():
    return select(RehabilitationGameSession).options(selectinload(RehabilitationGameSession.samples))


def load_rehab_session(session_id: int, db: Session) -> RehabilitationGameSession:
    session = db.scalars(rehab_query().where(RehabilitationGameSession.id == session_id)).first()
    if session is None:
        raise HTTPException(status_code=404, detail="Rehabilitation game session not found")
    return session


def fill_missing_scores(data: dict, samples: list) -> None:
    errors = [sample.error for sample in samples if sample.error is not None]
    in_target = [sample.in_target for sample in samples if sample.in_target is not None]
    marker_points = [(sample.marker_x, sample.marker_y) for sample in samples if sample.marker_x is not None and sample.marker_y is not None]
    path = 0
    for index in range(1, len(marker_points)):
        path += hypot(marker_points[index][0] - marker_points[index - 1][0], marker_points[index][1] - marker_points[index - 1][1])
    mean_error = average(errors) or 0
    accuracy = data.get("accuracy")
    if accuracy is None:
        accuracy = max(0, min(100, 100 - mean_error * 18))
        data["accuracy"] = round(accuracy, 1)
    if data.get("stability") is None:
        data["stability"] = round(max(0, min(100, 100 - path * 0.8 - mean_error * 8)), 1)
    if data.get("completion_rate") is None and in_target:
        data["completion_rate"] = round(sum(1 for value in in_target if value) / len(in_target) * 100, 1)
    if data.get("smoothness") is None:
        data["smoothness"] = round(max(0, min(100, 100 - path * 0.45)), 1)
    if data.get("score") is None:
        score_parts = [data.get("accuracy"), data.get("stability"), data.get("smoothness"), data.get("completion_rate")]
        data["score"] = average([value for value in score_parts if value is not None])


def suggest_games_for_patient(patient_id: int, db: Session) -> list[RehabilitationGameSuggestion]:
    latest = db.scalars(
        select(AssessmentSession)
        .where(AssessmentSession.patient_id == patient_id)
        .order_by(AssessmentSession.created_at.desc())
        .limit(1)
    ).first()
    if latest is None:
        return [
            RehabilitationGameSuggestion(
                game_type="stability_challenge",
                title="Stability Challenge",
                reason="Start with baseline static balance control before progressing to directional tasks.",
                priority="medium",
                difficulty="intro",
                clinical_focus="Static balance baseline",
            )
        ]

    suggestions: list[RehabilitationGameSuggestion] = []
    if (latest.mean_sway_ml or latest.body_center_deviation or 0) > 9:
        suggestions.append(
            RehabilitationGameSuggestion(
                game_type="weight_shift_trainer",
                title="Weight Shift Trainer",
                reason="Lateral or body-center sway is elevated; train controlled directional weight transfer.",
                priority="high",
                difficulty="standard",
                clinical_focus="Medial-lateral and anterior-posterior weight shift",
            )
        )
        suggestions.append(
            RehabilitationGameSuggestion(
                game_type="obstacle_avoidance",
                title="Obstacle Avoidance",
                reason="Body-center deviation is elevated; train anticipatory dynamic balance control.",
                priority="medium",
                difficulty="standard",
                clinical_focus="Dynamic postural response",
            )
        )
    if (latest.path_length or latest.max_resultant_sway or 0) > 18:
        suggestions.append(
            RehabilitationGameSuggestion(
                game_type="path_following",
                title="Path Following",
                reason="Sway trajectory is wide; train precision and smoothness through guided paths.",
                priority="high",
                difficulty="standard",
                clinical_focus="Precision and smooth postural correction",
            )
        )
        suggestions.append(
            RehabilitationGameSuggestion(
                game_type="single_leg_balance",
                title="Single-Leg Balance Challenge",
                reason="Sway path is wide; reinforce static control before progressing to faster tasks.",
                priority="medium",
                difficulty="intro",
                clinical_focus="Static single-leg stability",
            )
        )
    if (latest.total_balance_score or 100) < 70:
        suggestions.append(
            RehabilitationGameSuggestion(
                game_type="stability_challenge",
                title="Balance Freeze",
                reason="Global balance score suggests instability; reinforce safe static control.",
                priority="high",
                difficulty="intro",
                clinical_focus="Static stability and reduced sway",
            )
        )
    if (latest.trunk_deviation or latest.shoulder_asymmetry or 0) > 6:
        suggestions.append(
            RehabilitationGameSuggestion(
                game_type="reach_touch",
                title="Reach & Touch",
                reason="Upper-body alignment indicators suggest controlled reach and coordination practice.",
                priority="medium",
                difficulty="standard",
                clinical_focus="Upper-limb reach and coordination",
            )
        )
    if (latest.hip_asymmetry or 0) > 5:
        suggestions.append(
            RehabilitationGameSuggestion(
                game_type="squat_trainer",
                title="Squat Trainer",
                reason="Hip asymmetry is elevated; train controlled lower-limb movement quality.",
                priority="medium",
                difficulty="intro",
                clinical_focus="Hip, knee, and lower-limb control",
            )
        )
    suggestions.append(
        RehabilitationGameSuggestion(
            game_type="balance_maze",
            title="Balance Maze",
            reason="Use after baseline control improves to train multi-directional coordination.",
            priority="medium",
            difficulty="standard",
            clinical_focus="Coordination and controlled balance transitions",
        )
    )
    return suggestions[:4]


def average(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 1)
