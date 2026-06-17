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
from app.schemas import MovementFeaturesRead, MovementLabelCreate, MovementLabelRead, SessionCreate, SessionRead, SessionReportData
from app.services.movement_features import build_movement_feature_payload

router = APIRouter(prefix="/sessions", tags=["sessions"])

BOARD_METRIC_FIELDS = [
    "board_stability_score",
    "mean_sway_ap",
    "mean_sway_ml",
    "max_sway_ap",
    "max_sway_ml",
    "sway_velocity",
    "instability_events",
]
FUTURE_MODES = {"board_future", "combined_future"}


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

    if data.get("status") is None:
        data["status"] = status_from_score(data.get("total_balance_score"))

    session = AssessmentSession(**data)
    session.sensor_samples = [SensorSample(**sample.model_dump()) for sample in payload.sensor_samples]
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
    if session.acquisition_mode in FUTURE_MODES:
        raise HTTPException(status_code=400, detail="Future hardware modes cannot be computed in the current MVP.")

    data = session_to_metric_data(session)
    if session.acquisition_mode == "webcam":
        apply_webcam_sample_computation(session, data)
        clear_board_metrics(session)

    session.posture_stability_score = data.get("posture_stability_score")
    session.total_balance_score = data.get("total_balance_score")
    session.trunk_deviation = data.get("trunk_deviation")
    session.shoulder_asymmetry = data.get("shoulder_asymmetry")
    session.hip_asymmetry = data.get("hip_asymmetry")
    session.body_center_deviation = data.get("body_center_deviation")
    session.status = status_from_score(session.total_balance_score)
    session.interpretation = session.interpretation or webcam_interpretation(session.total_balance_score)

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
    if mode in FUTURE_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"{mode} is reserved for future hardware integration and is not available in the current MVP.",
        )

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


def apply_webcam_computation(payload: SessionCreate, data: dict) -> None:
    if data.get("acquisition_mode") != "webcam" or not payload.posture_samples:
        return

    posture_scores = [sample.posture_score for sample in payload.posture_samples if sample.posture_score is not None]
    trunk_values = [sample.trunk_inclination for sample in payload.posture_samples if sample.trunk_inclination is not None]
    shoulder_values = [sample.shoulder_asymmetry for sample in payload.posture_samples if sample.shoulder_asymmetry is not None]
    hip_values = [sample.hip_asymmetry for sample in payload.posture_samples if sample.hip_asymmetry is not None]
    center_values = [sample.body_center_deviation for sample in payload.posture_samples if sample.body_center_deviation is not None]

    posture_score = data.get("posture_stability_score") or average(posture_scores)
    data["posture_stability_score"] = posture_score
    data["total_balance_score"] = data.get("total_balance_score") or posture_score
    data["trunk_deviation"] = data.get("trunk_deviation") or average(trunk_values)
    data["shoulder_asymmetry"] = data.get("shoulder_asymmetry") or average(shoulder_values)
    data["hip_asymmetry"] = data.get("hip_asymmetry") or average(hip_values)
    data["body_center_deviation"] = data.get("body_center_deviation") or average(center_values)

    if not data.get("interpretation"):
        data["interpretation"] = webcam_interpretation(data.get("total_balance_score"))


def apply_webcam_sample_computation(session: AssessmentSession, data: dict) -> None:
    posture_scores = [sample.posture_score for sample in session.posture_samples if sample.posture_score is not None]
    trunk_values = [sample.trunk_inclination for sample in session.posture_samples if sample.trunk_inclination is not None]
    shoulder_values = [sample.shoulder_asymmetry for sample in session.posture_samples if sample.shoulder_asymmetry is not None]
    hip_values = [sample.hip_asymmetry for sample in session.posture_samples if sample.hip_asymmetry is not None]
    center_values = [sample.body_center_deviation for sample in session.posture_samples if sample.body_center_deviation is not None]

    posture_score = average(posture_scores) or session.posture_stability_score
    data["posture_stability_score"] = posture_score
    data["total_balance_score"] = posture_score
    data["trunk_deviation"] = average(trunk_values) or session.trunk_deviation
    data["shoulder_asymmetry"] = average(shoulder_values) or session.shoulder_asymmetry
    data["hip_asymmetry"] = average(hip_values) or session.hip_asymmetry
    data["body_center_deviation"] = average(center_values) or session.body_center_deviation


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
        "trunk_deviation": session.trunk_deviation,
        "shoulder_asymmetry": session.shoulder_asymmetry,
        "hip_asymmetry": session.hip_asymmetry,
        "body_center_deviation": session.body_center_deviation,
    }


def has_board_metrics(session: AssessmentSession) -> bool:
    return any(getattr(session, field) is not None for field in BOARD_METRIC_FIELDS)


def acquisition_mode_label(mode: str) -> str:
    labels = {
        "webcam": "Webcam-Based Assessment",
        "demo": "Demo Assessment",
        "board_future": "Board Sensors Only (future)",
        "combined_future": "Webcam + Board Sensors (future)",
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


def average(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 1)


def generate_recommendations(data: dict) -> list[dict[str, str]]:
    recommendations: list[dict[str, str]] = []
    if (data.get("trunk_deviation") or 0) > 8:
        recommendations.append(
            {
                "category": "posture",
                "recommendation_en": "Trunk deviation increased: include trunk stabilization and postural alignment exercises.",
                "recommendation_fr": "Deviation du tronc augmentee : inclure des exercices de stabilisation du tronc et d'alignement postural.",
                "priority": "high",
            }
        )
    if (data.get("shoulder_asymmetry") or 0) > 5:
        recommendations.append(
            {
                "category": "posture",
                "recommendation_en": "Shoulder asymmetry increased: monitor upper-body alignment during balance tasks.",
                "recommendation_fr": "Asymetrie des epaules augmentee : surveiller l'alignement du haut du corps pendant les taches d'equilibre.",
                "priority": "medium",
            }
        )
    if (data.get("hip_asymmetry") or 0) > 5:
        recommendations.append(
            {
                "category": "posture",
                "recommendation_en": "Hip asymmetry increased: include symmetrical stance and controlled weight-transfer exercises.",
                "recommendation_fr": "Asymetrie des hanches augmentee : inclure des exercices d'appui symetrique et de transfert controle du poids.",
                "priority": "medium",
            }
        )
    if data.get("visual_condition") == "eyes_closed" and (data.get("total_balance_score") or 0) < 75:
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


def status_from_score(score: float | None) -> str | None:
    if score is None:
        return None
    if score >= 80:
        return "Stable"
    if score >= 65:
        return "Follow-up"
    return "Declining"
