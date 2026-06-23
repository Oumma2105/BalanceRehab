import random
from math import hypot, sin, sqrt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Patient
from app.models import MovementLabel
from app.models import PostureSample
from app.models import Recommendation
from app.models import SensorSample
from app.models import Session as AssessmentSession
from app.schemas import MovementFeaturesRead, MovementLabelCreate, MovementLabelRead, SensorSamplesAppend, SessionCreate, SessionRead, SessionReportData, SessionUpdate
from app.services.board_metrics import compute_board_metrics, normalize_board_samples
from app.services.movement_features import build_movement_feature_payload

router = APIRouter(prefix="/sessions", tags=["sessions"])

BOARD_METRIC_FIELDS = [
    "board_stability_score",
    "mean_sway_ap",
    "mean_sway_ml",
    "max_sway_ap",
    "max_sway_ml",
    "mean_resultant_sway",
    "max_resultant_sway",
    "rms_sway",
    "path_length",
    "sensor_quality",
    "sway_velocity",
    "instability_events",
]
FUTURE_MODES = {"board", "combined"}
BOARD_MODES = {"board", "combined", "board_future", "combined_future", "demo"}


@router.get("", response_model=list[SessionRead])
def list_sessions(
    patient_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[AssessmentSession]:
    query = session_query().order_by(AssessmentSession.created_at.desc())
    if patient_id is not None:
        query = query.where(AssessmentSession.patient_id == patient_id)
    return list(db.scalars(query))


@router.post("", response_model=SessionRead, status_code=201)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)) -> AssessmentSession:
    if db.get(Patient, payload.patient_id) is None:
        raise HTTPException(status_code=404, detail="Patient not found")

    data = payload.model_dump(exclude={"sensor_samples", "posture_samples", "recommendations", "movement_labels"})
    validate_acquisition_payload(payload, data)
    apply_webcam_computation(payload, data)
    apply_board_computation(payload.sensor_samples, data)

    if data.get("status") is None:
        previous = _latest_session_score(payload.patient_id, db)
        data["status"] = status_with_trend(data.get("total_balance_score"), previous)

    posture_sample_count = len(payload.posture_samples)
    usable = sum(1 for s in payload.posture_samples if s.posture_score is not None or s.body_center_x is not None)
    tq = round(usable / posture_sample_count, 3) if posture_sample_count > 0 else 0.0
    data["sample_count"] = posture_sample_count
    data["tracking_quality"] = tq
    if data.get("acquisition_mode") == "demo":
        data["session_status"] = "demo"
    elif data.get("acquisition_mode") == "webcam" and (posture_sample_count == 0 or tq < 0.15):
        data["session_status"] = "incomplete"
        data["total_balance_score"] = None
        data["posture_stability_score"] = None
    else:
        data["session_status"] = "complete"

    session = AssessmentSession(**data)
    session.sensor_samples = [SensorSample(**sensor_sample_data(sample)) for sample in payload.sensor_samples]
    session.posture_samples = [PostureSample(**sample.model_dump()) for sample in payload.posture_samples]
    session.movement_labels = [MovementLabel(**label.model_dump()) for label in payload.movement_labels]
    recommendations = payload.recommendations or generate_recommendations(data)
    session.recommendations = [
        Recommendation(
            category=recommendation.category if hasattr(recommendation, "category") else recommendation["category"],
            recommendation_en=recommendation.recommendation_en if hasattr(recommendation, "recommendation_en") else recommendation["recommendation_en"],
            recommendation_fr=(
                recommendation.recommendation_fr if hasattr(recommendation, "recommendation_fr") else recommendation.get("recommendation_fr")
            )
            or (recommendation.recommendation_en if hasattr(recommendation, "recommendation_en") else recommendation["recommendation_en"]),
            priority=recommendation.priority if hasattr(recommendation, "priority") else recommendation["priority"],
        )
        for recommendation in recommendations
    ]

    db.add(session)
    db.commit()
    db.refresh(session)
    return load_session(session.id, db)


@router.get("/{session_id}", response_model=SessionRead)
def get_session(session_id: int, db: Session = Depends(get_db)) -> AssessmentSession:
    return load_session(session_id, db)


@router.get("/{session_id}/report-data", response_model=SessionReportData)
def get_session_report_data(session_id: int, db: Session = Depends(get_db)) -> SessionReportData:
    session = load_session(session_id, db)
    patient = db.get(Patient, session.patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")

    return SessionReportData(
        patient=patient,
        session=session,
        board_metrics_available=has_board_metrics(session),
        acquisition_mode_label=acquisition_mode_label(session.acquisition_mode),
        clinical_impression=session.interpretation,
        recommendations=[item.recommendation_en for item in session.recommendations],
    )


@router.get("/{session_id}/movement-features", response_model=MovementFeaturesRead)
def get_movement_features(session_id: int, db: Session = Depends(get_db)) -> dict:
    session = load_session(session_id, db)
    return build_movement_feature_payload(session)


@router.get("/{session_id}/sway-path")
def get_sway_path(session_id: int, db: Session = Depends(get_db)) -> list[dict]:
    session = load_session(session_id, db)
    return generate_sway_path(session)


@router.get("/{session_id}/full-results")
def get_full_results(session_id: int, db: Session = Depends(get_db)) -> dict:
    session = load_session(session_id, db)
    patient = db.get(Patient, session.patient_id)
    patient_sessions = list(
        db.scalars(
            select(AssessmentSession)
            .where(AssessmentSession.patient_id == session.patient_id)
            .order_by(AssessmentSession.created_at.asc())
        )
    )
    previous = None
    for index, item in enumerate(patient_sessions):
        if item.id == session.id and index > 0:
            previous = patient_sessions[index - 1]
            break
    comparison_sessions = [item for item in patient_sessions if item.id != session.id]
    averages = metric_averages(comparison_sessions)
    sway_series = generate_sway_series(session)
    return {
        "patient": {
            "id": patient.id if patient else None,
            "patient_code": patient.patient_code if patient else "",
            "full_name": patient.full_name if patient else "Unknown patient",
            "age": patient.age if patient else None,
            "sex": patient.sex if patient else None,
            "pathology": patient.pathology if patient else None,
        },
        "session": session_metric_payload(session),
        "previous_session": session_metric_payload(previous) if previous else None,
        "patient_average": averages,
        "population_norm": {
            "ap_sway": 1.2,
            "ml_sway": 0.8,
            "sway_velocity": 1.1,
            "trunk_deviation": 3.0,
        },
        "sway_path": generate_sway_path(session),
        "sway_series": sway_series,
        "clinical_findings": clinical_findings(session),
        "recommendations": [item.recommendation_en for item in session.recommendations],
    }


@router.post("/{session_id}/sensor-samples", response_model=SessionRead)
def append_sensor_samples(session_id: int, payload: SensorSamplesAppend, db: Session = Depends(get_db)) -> AssessmentSession:
    session = load_session(session_id, db)
    if session.acquisition_mode == "webcam":
        raise HTTPException(status_code=422, detail="Webcam-only sessions cannot include ESP32 board sensor samples.")

    for sample in payload.samples:
        session.sensor_samples.append(SensorSample(**sensor_sample_data(sample)))

    data = session_to_metric_data(session)
    apply_board_sample_computation(session, data)
    apply_session_metric_data(session, data)
    session.status = status_from_score(session.total_balance_score)

    db.commit()
    return load_session(session.id, db)


@router.get("/{session_id}/movement-labels", response_model=list[MovementLabelRead])
def list_movement_labels(session_id: int, db: Session = Depends(get_db)) -> list[MovementLabel]:
    session = load_session(session_id, db)
    return session.movement_labels


@router.post("/{session_id}/movement-labels", response_model=MovementLabelRead, status_code=201)
def create_movement_label(session_id: int, payload: MovementLabelCreate, db: Session = Depends(get_db)) -> MovementLabel:
    session = load_session(session_id, db)
    if payload.end_ms < payload.start_ms:
        raise HTTPException(status_code=422, detail="Movement label end_ms must be greater than or equal to start_ms.")
    label = MovementLabel(session_id=session.id, **payload.model_dump())
    db.add(label)
    db.commit()
    db.refresh(label)
    return label


@router.post("/{session_id}/compute", response_model=SessionRead)
def recompute_session(session_id: int, db: Session = Depends(get_db)) -> AssessmentSession:
    session = load_session(session_id, db)
    data = session_to_metric_data(session)
    if session.acquisition_mode == "webcam":
        apply_webcam_sample_computation(session, data)
        clear_board_metrics(session)
    elif session.acquisition_mode in BOARD_MODES:
        if session.acquisition_mode in {"combined", "combined_future"}:
            apply_webcam_sample_computation(session, data)
        apply_board_sample_computation(session, data)

    apply_session_metric_data(session, data)
    session.status = status_from_score(session.total_balance_score)
    session.interpretation = session.interpretation or interpretation_for_session(session)

    session.recommendations.clear()
    for recommendation in generate_recommendations(data):
        session.recommendations.append(
            Recommendation(
                category=recommendation["category"],
                recommendation_en=recommendation["recommendation_en"],
                recommendation_fr=recommendation["recommendation_fr"],
                priority=recommendation["priority"],
            )
        )

    db.commit()
    return load_session(session.id, db)


@router.patch("/{session_id}", response_model=SessionRead)
def update_session(session_id: int, payload: SessionUpdate, db: Session = Depends(get_db)) -> AssessmentSession:
    session = load_session(session_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(session, field, value)
    db.commit()
    return load_session(session.id, db)


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: int, db: Session = Depends(get_db)) -> None:
    session = load_session(session_id, db)
    db.delete(session)
    db.commit()


def load_session(session_id: int, db: Session) -> AssessmentSession:
    session = db.scalars(session_query().where(AssessmentSession.id == session_id)).first()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def session_query():
    return select(AssessmentSession).options(
        selectinload(AssessmentSession.sensor_samples),
        selectinload(AssessmentSession.posture_samples),
        selectinload(AssessmentSession.movement_labels),
        selectinload(AssessmentSession.recommendations),
    )


def validate_acquisition_payload(payload: SessionCreate, data: dict) -> None:
    mode = data.get("acquisition_mode")
    if mode == "webcam":
        board_values = {field: data.get(field) for field in BOARD_METRIC_FIELDS}
        provided_board_values = {field: value for field, value in board_values.items() if value is not None}
        if provided_board_values or payload.sensor_samples:
            raise HTTPException(
                status_code=422,
                detail="Webcam-only sessions cannot include board/sway metrics or sensor samples.",
            )
        data["is_demo"] = False
        for field in BOARD_METRIC_FIELDS:
            data[field] = None

    if mode == "demo":
        data["is_demo"] = True

    if mode in FUTURE_MODES:
        data["is_demo"] = False


def apply_board_computation(sensor_samples: list, data: dict) -> None:
    if data.get("acquisition_mode") not in BOARD_MODES or not sensor_samples:
        return

    board_metrics = compute_board_metrics(sensor_samples)
    for field, value in board_metrics.items():
        data[field] = data.get(field) if data.get(field) is not None else value

    board_score = data.get("board_stability_score")
    posture_score = data.get("posture_stability_score")
    if data.get("acquisition_mode") in {"combined", "combined_future"} and posture_score is not None and board_score is not None:
        if data.get("total_balance_score") is None:
            data["total_balance_score"] = round((board_score * 0.6) + (posture_score * 0.4), 1)
    elif board_score is not None:
        if data.get("total_balance_score") is None:
            data["total_balance_score"] = board_score

    if not data.get("interpretation"):
        data["interpretation"] = board_interpretation(data.get("total_balance_score"))


def sensor_sample_data(sample) -> dict:
    data = sample.model_dump()
    normalized = normalize_board_samples([sample])
    if normalized:
        data["anterior_posterior_sway"] = data.get("anterior_posterior_sway") if data.get("anterior_posterior_sway") is not None else normalized[0].anterior_posterior_sway
        data["medial_lateral_sway"] = data.get("medial_lateral_sway") if data.get("medial_lateral_sway") is not None else normalized[0].medial_lateral_sway
        data["stability_score"] = data.get("stability_score") if data.get("stability_score") is not None else normalized[0].stability_score
    # Older local SQLite databases created these columns as NOT NULL. Keep AP/ML-only
    # firmware payloads insertable while the current model remains nullable for new DBs.
    for field in ["front_left", "front_right", "rear_left", "rear_right"]:
        if data.get(field) is None:
            data[field] = 0
    return data


def apply_webcam_computation(payload: SessionCreate, data: dict) -> None:
    if data.get("acquisition_mode") not in {"webcam", "combined", "combined_future"} or not payload.posture_samples:
        return

    posture_scores = [sample.posture_score for sample in payload.posture_samples if sample.posture_score is not None]
    trunk_values = [sample.trunk_inclination for sample in payload.posture_samples if sample.trunk_inclination is not None]
    shoulder_values = [sample.shoulder_asymmetry for sample in payload.posture_samples if sample.shoulder_asymmetry is not None]
    hip_values = [sample.hip_asymmetry for sample in payload.posture_samples if sample.hip_asymmetry is not None]
    center_values = [sample.body_center_deviation for sample in payload.posture_samples if sample.body_center_deviation is not None]

    posture_score = data.get("posture_stability_score")
    if posture_score is None:
        posture_score = average(posture_scores)
    data["posture_stability_score"] = posture_score
    if data.get("total_balance_score") is None:
        data["total_balance_score"] = posture_score
    if data.get("trunk_deviation") is None:
        data["trunk_deviation"] = average(trunk_values)
    if data.get("shoulder_asymmetry") is None:
        data["shoulder_asymmetry"] = average(shoulder_values)
    if data.get("hip_asymmetry") is None:
        data["hip_asymmetry"] = average(hip_values)
    if data.get("body_center_deviation") is None:
        data["body_center_deviation"] = average(center_values)

    if not data.get("interpretation"):
        data["interpretation"] = webcam_interpretation(data.get("total_balance_score"))


def apply_webcam_sample_computation(session: AssessmentSession, data: dict) -> None:
    posture_scores = [sample.posture_score for sample in session.posture_samples if sample.posture_score is not None]
    trunk_values = [sample.trunk_inclination for sample in session.posture_samples if sample.trunk_inclination is not None]
    shoulder_values = [sample.shoulder_asymmetry for sample in session.posture_samples if sample.shoulder_asymmetry is not None]
    hip_values = [sample.hip_asymmetry for sample in session.posture_samples if sample.hip_asymmetry is not None]
    center_values = [sample.body_center_deviation for sample in session.posture_samples if sample.body_center_deviation is not None]

    _avg = average(posture_scores)
    posture_score = _avg if _avg is not None else session.posture_stability_score
    data["posture_stability_score"] = posture_score
    data["total_balance_score"] = posture_score
    _avg = average(trunk_values)
    data["trunk_deviation"] = _avg if _avg is not None else session.trunk_deviation
    _avg = average(shoulder_values)
    data["shoulder_asymmetry"] = _avg if _avg is not None else session.shoulder_asymmetry
    _avg = average(hip_values)
    data["hip_asymmetry"] = _avg if _avg is not None else session.hip_asymmetry
    _avg = average(center_values)
    data["body_center_deviation"] = _avg if _avg is not None else session.body_center_deviation


def apply_board_sample_computation(session: AssessmentSession, data: dict) -> None:
    board_metrics = compute_board_metrics(session.sensor_samples)
    data.update(board_metrics)
    board_score = data.get("board_stability_score")
    posture_score = data.get("posture_stability_score")
    if session.acquisition_mode in {"combined", "combined_future"} and posture_score is not None and board_score is not None:
        data["total_balance_score"] = round((board_score * 0.6) + (posture_score * 0.4), 1)
    else:
        data["total_balance_score"] = board_score


def apply_session_metric_data(session: AssessmentSession, data: dict) -> None:
    for field in [
        "posture_stability_score",
        "total_balance_score",
        "board_stability_score",
        "mean_sway_ap",
        "mean_sway_ml",
        "max_sway_ap",
        "max_sway_ml",
        "mean_resultant_sway",
        "max_resultant_sway",
        "rms_sway",
        "path_length",
        "sensor_quality",
        "sway_velocity",
        "instability_events",
        "trunk_deviation",
        "shoulder_asymmetry",
        "hip_asymmetry",
        "body_center_deviation",
        "sample_count",
        "tracking_quality",
        "session_status",
    ]:
        setattr(session, field, data.get(field))


def clear_board_metrics(session: AssessmentSession) -> None:
    for field in BOARD_METRIC_FIELDS:
        setattr(session, field, None)


def session_to_metric_data(session: AssessmentSession) -> dict:
    return {
        "acquisition_mode": session.acquisition_mode,
        "test_type": session.test_type,
        "visual_condition": session.visual_condition,
        "total_balance_score": session.total_balance_score,
        "posture_stability_score": session.posture_stability_score,
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
        "trunk_deviation": session.trunk_deviation,
        "shoulder_asymmetry": session.shoulder_asymmetry,
        "hip_asymmetry": session.hip_asymmetry,
        "body_center_deviation": session.body_center_deviation,
        "sample_count": session.sample_count,
        "tracking_quality": session.tracking_quality,
        "session_status": session.session_status,
    }


def has_board_metrics(session: AssessmentSession) -> bool:
    return any(getattr(session, field) is not None for field in BOARD_METRIC_FIELDS)


def acquisition_mode_label(mode: str) -> str:
    labels = {
        "webcam": "Webcam-Based Assessment",
        "demo": "Demo Assessment",
        "board": "Balance Board (ESP32)",
        "combined": "Webcam + ESP32 Board",
        "board_future": "Balance Board (ESP32)",
        "combined_future": "Webcam + ESP32 Board",
    }
    return labels.get(mode, mode)


def webcam_interpretation(score: float | None) -> str:
    if score is None:
        return "Webcam-based posture indicators were saved for clinical review."
    if score >= 80:
        return "Estimated webcam-based posture indicators suggest stable functional balance."
    if score >= 65:
        return "Estimated webcam-based posture indicators suggest moderate instability requiring rehabilitation follow-up."
    return "Estimated webcam-based posture indicators suggest high instability requiring supervised progression."


def board_interpretation(score: float | None) -> str:
    if score is None:
        return "ESP32 board sensor samples were saved for rehabilitation-support review."
    if score >= 80:
        return "ESP32 board indicators suggest stable stance during this prototype assessment."
    if score >= 65:
        return "ESP32 board indicators suggest moderate instability during this prototype assessment."
    return "ESP32 board indicators suggest high instability requiring supervised rehabilitation follow-up."


def interpretation_for_session(session: AssessmentSession) -> str:
    if session.acquisition_mode == "webcam":
        return webcam_interpretation(session.total_balance_score)
    return board_interpretation(session.total_balance_score)


def average(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 1)


def generate_recommendations(data: dict) -> list[dict[str, str]]:
    recommendations: list[dict[str, str]] = []
    if data.get("trunk_deviation") is not None and data["trunk_deviation"] > 8:
        recommendations.append(
            {
                "category": "posture",
                "recommendation_en": "Trunk deviation increased: include trunk stabilization and postural alignment exercises.",
                "recommendation_fr": "Deviation du tronc augmentee : inclure des exercices de stabilisation du tronc et d'alignement postural.",
                "priority": "high",
            }
        )
    if data.get("shoulder_asymmetry") is not None and data["shoulder_asymmetry"] > 5:
        recommendations.append(
            {
                "category": "posture",
                "recommendation_en": "Shoulder asymmetry increased: monitor upper-body alignment during balance tasks.",
                "recommendation_fr": "Asymetrie des epaules augmentee : surveiller l'alignement du haut du corps pendant les taches d'equilibre.",
                "priority": "medium",
            }
        )
    if data.get("hip_asymmetry") is not None and data["hip_asymmetry"] > 5:
        recommendations.append(
            {
                "category": "posture",
                "recommendation_en": "Hip asymmetry increased: include symmetrical stance and controlled weight-transfer exercises.",
                "recommendation_fr": "Asymetrie des hanches augmentee : inclure des exercices d'appui symetrique et de transfert controle du poids.",
                "priority": "medium",
            }
        )
    if data.get("visual_condition") == "eyes_closed" and data.get("total_balance_score") is not None and data["total_balance_score"] < 75:
        recommendations.append(
            {
                "category": "vision",
                "recommendation_en": "Eyes-closed instability is present: consider proprioceptive training with safe therapist supervision.",
                "recommendation_fr": "Instabilite yeux fermes presente : envisager un entrainement proprioceptif avec supervision therapeutique securisee.",
                "priority": "medium",
            }
        )
    if not recommendations:
        recommendations.append(
            {
                "category": "progression",
                "recommendation_en": "Current indicators are stable: progress difficulty gradually while maintaining therapist supervision.",
                "recommendation_fr": "Les indicateurs actuels sont stables : augmenter progressivement la difficulte en maintenant la supervision therapeutique.",
                "priority": "low",
            }
        )
    return recommendations


def _latest_session_score(patient_id: int, db: Session) -> float | None:
    last = db.scalars(
        select(AssessmentSession)
        .where(AssessmentSession.patient_id == patient_id)
        .order_by(AssessmentSession.created_at.desc())
        .limit(1)
    ).first()
    return last.total_balance_score if last else None


def status_with_trend(score: float | None, previous_score: float | None) -> str | None:
    base = status_from_score(score)
    if (
        base in {"Stable", "Follow-up"}
        and score is not None
        and previous_score is not None
        and score >= previous_score + 5
    ):
        return "Improving"
    return base


def status_from_score(score: float | None) -> str | None:
    if score is None:
        return None
    if score >= 70:
        return "Stable"
    if score >= 62:
        return "Follow-up"
    return "Declining"


def session_metric_payload(session: AssessmentSession) -> dict:
    return {
        "id": session.id,
        "patient_id": session.patient_id,
        "date": session.created_at,
        "test_type": session.test_type,
        "vision_condition": session.visual_condition,
        "acquisition_mode": session.acquisition_mode,
        "duration_seconds": session.duration_seconds,
        "status": session.status,
        "session_status": session.session_status,
        "balance_score": session.total_balance_score,
        "posture_score": session.posture_stability_score,
        "stability_score": session.board_stability_score,
        "ap_sway": session.mean_sway_ap,
        "ml_sway": session.mean_sway_ml,
        "sway_velocity": session.sway_velocity,
        "instability_events": session.instability_events,
        "trunk_deviation": session.trunk_deviation,
        "shoulder_asymmetry": session.shoulder_asymmetry,
        "hip_asymmetry": session.hip_asymmetry,
        "body_center_deviation": session.body_center_deviation,
        "sample_count": session.sample_count,
        "tracking_quality": session.tracking_quality,
        "interpretation": session.interpretation,
    }


def metric_averages(sessions: list[AssessmentSession]) -> dict:
    fields = {
        "ap_sway": "mean_sway_ap",
        "ml_sway": "mean_sway_ml",
        "sway_velocity": "sway_velocity",
        "trunk_deviation": "trunk_deviation",
        "balance_score": "total_balance_score",
    }
    payload = {}
    for label, field in fields.items():
        values = [getattr(session, field) for session in sessions if getattr(session, field) is not None]
        payload[label] = round(sum(values) / len(values), 2) if values else None
    return payload


def generate_sway_path(session: AssessmentSession) -> list[dict]:
    sample_count = min(session.sample_count or 400, 300)
    rng = random.Random(session.id * 7919)
    ap_sway = max(session.mean_sway_ap or 1.2, 0.1)
    ml_sway = max(session.mean_sway_ml or 0.8, 0.1)
    x = 0.0
    y = 0.0
    points = []
    for index in range(sample_count):
        x += rng.gauss(0, ml_sway / 30)
        y += rng.gauss(0, ap_sway / 30)
        points.append([x, y])
    mean_x = sum(point[0] for point in points) / len(points)
    mean_y = sum(point[1] for point in points) / len(points)
    max_x = max(abs(point[0] - mean_x) for point in points) or 1
    max_y = max(abs(point[1] - mean_y) for point in points) or 1
    return [
        {
            "x": round(((point[0] - mean_x) / max_x) * ml_sway, 3),
            "y": round(((point[1] - mean_y) / max_y) * ap_sway, 3),
            "index": index,
        }
        for index, point in enumerate(points)
    ]


def generate_sway_series(session: AssessmentSession) -> list[dict]:
    duration = session.duration_seconds or 30
    sample_count = 180
    rng = random.Random(session.id * 1543)
    ap_sway = session.mean_sway_ap or 1.2
    ml_sway = session.mean_sway_ml or 0.8
    velocity = session.sway_velocity or 1.1
    resultant_values = []
    series = []
    for index in range(sample_count):
        time = duration * index / (sample_count - 1)
        ap = ap_sway * sin(time * 2.6) + rng.gauss(0, 0.2)
        ml = ml_sway * sin(time * 2.1 + 0.8) + rng.gauss(0, 0.18)
        resultant = sqrt(ap * ap + ml * ml)
        resultant_values.append(resultant)
        series.append(
            {
                "time": round(time, 1),
                "ap": round(ap, 2),
                "ml": round(ml, 2),
                "resultant": round(resultant, 2),
                "velocity": velocity,
            }
        )
    mean = sum(resultant_values) / len(resultant_values)
    variance = sum((value - mean) ** 2 for value in resultant_values) / len(resultant_values)
    threshold = mean + 2 * sqrt(variance)
    events = session.instability_events or 0
    markers = {
        round(duration * (index + 1) / (events + 1), 1)
        for index in range(min(events, 8))
    }
    for item in series:
        item["threshold"] = round(threshold, 2)
        item["event"] = item["time"] in markers
    return series


def clinical_findings(session: AssessmentSession) -> list[dict]:
    findings = []
    if (session.mean_sway_ap or 0) > 3 or (session.mean_sway_ml or 0) > 2:
        findings.append({"severity": "high", "label": "Elevated sway amplitude", "detail": "Sway exceeds typical quiet stance reference ranges."})
    if (session.trunk_deviation or 0) > 8:
        findings.append({"severity": "high", "label": "Trunk deviation", "detail": "Postural alignment requires targeted trunk stabilization."})
    if (session.instability_events or 0) >= 5:
        findings.append({"severity": "medium", "label": "Repeated instability events", "detail": "Multiple balance corrections were detected during the session."})
    if not findings:
        findings.append({"severity": "low", "label": "Controlled postural response", "detail": "Metrics are consistent with supervised progression."})
    return findings
