from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Patient
from app.models import PostureSample
from app.models import Recommendation
from app.models import Report
from app.models import SensorSample
from app.models import Session as AssessmentSession

PATHOLOGIES = [
    "Stroke",
    "Vestibular disorder",
    "Parkinson's disease",
    "Multiple sclerosis",
    "Cerebellar ataxia",
    "Peripheral neuropathy",
    "Post-surgery rehabilitation",
    "Orthopedic injury",
    "Ankle instability",
    "Fall prevention",
    "General balance training",
    "Other",
]

CLINICAL_GOALS = [
    "Improve static balance",
    "Improve dynamic balance",
    "Reduce fall risk",
    "Postural control training",
    "Proprioceptive training",
    "Rehabilitation follow-up",
]

NAMES = [
    "Nadia Benali",
    "Youssef Amrani",
    "Salma Idrissi",
    "Karim El Fassi",
    "Amina Rami",
    "Hicham Berrada",
    "Lina Haddad",
    "Samir Tazi",
    "Meriem Alaoui",
    "Omar Mansouri",
    "Imane Zahraoui",
    "Rachid Bennani",
    "Hanae Cherkaoui",
    "Mehdi Lahlou",
    "Fatima El Amrani",
    "Adil Skalli",
    "Sara Belkacem",
    "Nabil Guessous",
    "Leila Ouazzani",
    "Anas El Idrissi",
    "Sofia Bennis",
    "Mourad El Khatib",
    "Yasmina Filali",
    "Taha Mekouar",
    "Mouna Radi",
    "Reda Bouziane",
    "Nora Chraibi",
    "Hamza El Mansour",
    "Asmae Jalil",
    "Kamal Naciri",
    "Dounia Sefrioui",
    "Ilyas Fikri",
    "Zineb Mokri",
    "Tarik El Alami",
    "Rim Qadiri",
    "Amal Barakat",
    "Said Raji",
    "Maha Laaroussi",
    "Walid Sabri",
    "Khadija Mernissi",
    "Ayoub Tahiri",
    "Nawal Bakkali",
    "Jalal Mouline",
    "Houda Lamrani",
    "Bilal Fassi",
    "Malika Zerhouni",
    "Othmane Boussaid",
    "Ghita Lamari",
    "Mustapha Saidi",
    "Rania Kabbaj",
]

# French display names used for the free-text demo clinical notes (the
# pathology FIELD stays English — it is a data value translated by the UI).
PATHOLOGY_FR = {
    "Stroke": "accident vasculaire cérébral",
    "Vestibular disorder": "trouble vestibulaire",
    "Parkinson's disease": "maladie de Parkinson",
    "Multiple sclerosis": "sclérose en plaques",
    "Cerebellar ataxia": "ataxie cérébelleuse",
    "Peripheral neuropathy": "neuropathie périphérique",
    "Post-surgery rehabilitation": "rééducation postopératoire",
    "Orthopedic injury": "lésion orthopédique",
    "Ankle instability": "instabilité de la cheville",
    "Fall prevention": "prévention des chutes",
    "General balance training": "entraînement général de l'équilibre",
    "Other": "autre indication",
}

SEVERITY = {
    "Stroke": 14,
    "Vestibular disorder": 10,
    "Parkinson's disease": 13,
    "Multiple sclerosis": 12,
    "Cerebellar ataxia": 16,
    "Peripheral neuropathy": 11,
    "Post-surgery rehabilitation": 8,
    "Orthopedic injury": 7,
    "Ankle instability": 6,
    "Fall prevention": 9,
    "General balance training": 3,
    "Other": 5,
}


def seed_demo_data(db: Session, reset: bool = False) -> dict[str, int | str]:
    if reset:
        clear_demo_data(db)

    existing = db.scalar(select(Patient).limit(1))
    if existing:
        return {"status": "skipped", "patients": db.query(Patient).count()}

    patients = []
    for index, name in enumerate(NAMES):
        pathology = PATHOLOGIES[index % len(PATHOLOGIES)]
        sex = "Female" if index % 2 == 0 else "Male"
        age = 32 + ((index * 7) % 48)
        patient = Patient(
            patient_code=f"BR-{1064 + index}",
            full_name=name,
            age=age,
            sex=sex,
            height_cm=(156 + ((index * 5) % 18)) if sex == "Female" else (166 + ((index * 4) % 20)),
            weight_kg=(54 + ((index * 6) % 24)) if sex == "Female" else (66 + ((index * 7) % 28)),
            dominant_side="Left" if index % 9 == 0 else "Right",
            pathology=pathology,
            clinical_goal=CLINICAL_GOALS[index % len(CLINICAL_GOALS)],
            clinical_notes=f"Dossier de démonstration synthétique — suivi de rééducation ({PATHOLOGY_FR.get(pathology, pathology.lower())}).",
        )
        db.add(patient)
        patients.append(patient)

    db.flush()

    session_count = 0
    report_count = 0
    for index, patient in enumerate(patients):
        session_total = 2 + (index % 3)
        previous_score = None
        for session_index in range(session_total):
            session = build_session(patient, index, session_index, session_total, previous_score)
            previous_score = session.total_balance_score
            db.add(session)
            db.flush()
            add_samples(session, session_index)
            add_recommendations(session)
            session_count += 1

            if session_index == session_total - 1 or session.status == "Declining":
                db.add(
                    Report(
                        report_id=f"R-{300 + report_count}",
                        patient_id=patient.id,
                        session_id=session.id,
                        report_file_path="",
                        language="fr",
                        acquisition_mode=session.acquisition_mode,
                        downloadable=False,
                        summary=f"{session.test_type.title()} assessment: {session.total_balance_score}/100. {session.status}.",
                    )
                )
                report_count += 1

    db.commit()
    return {"status": "seeded", "patients": len(patients), "sessions": session_count, "reports": report_count}


def clear_demo_data(db: Session) -> None:
    for model in [Report, Recommendation, SensorSample, PostureSample, AssessmentSession, Patient]:
        db.query(model).delete()
    db.commit()


def build_session(patient: Patient, patient_index: int, session_index: int, session_total: int, previous_score: float | None) -> AssessmentSession:
    pathology = patient.pathology or "Other"
    trend = -2 if patient_index % 11 == 0 else 2 + (patient_index % 3)
    baseline = 86 - SEVERITY[pathology] - max(0, (patient.age or 45) - 45) / 5
    score = clamp(round(baseline + trend * session_index + (patient_index % 5) - 2), 45, 96)
    test_type = "dynamic" if (patient_index + session_index) % 3 == 0 else "static"
    visual_condition = "eyes_closed" if (patient_index + session_index) % 4 == 0 else "eyes_open"
    acquisition_mode = "demo" if patient_index % 4 else "webcam"
    board_available = acquisition_mode != "webcam"
    status = status_from_score(score, previous_score)
    dynamic_boost = 1.3 if test_type == "dynamic" else 1
    eyes_boost = 1.2 if visual_condition == "eyes_closed" else 1
    date = datetime(2026, 6, 3, 9, 0) - timedelta(days=(session_total - session_index - 1) * 8 + patient_index % 5)

    return AssessmentSession(
        patient_id=patient.id,
        acquisition_mode=acquisition_mode,
        is_demo=acquisition_mode == "demo",
        test_type=test_type,
        support_ring="removed" if test_type == "dynamic" else "installed",
        visual_condition=visual_condition,
        duration_seconds=30,
        status=status,
        total_balance_score=score,
        board_stability_score=round(score - 2, 1) if board_available else None,
        posture_stability_score=round(score + 1, 1),
        mean_sway_ap=round(7.5 * dynamic_boost * eyes_boost + (100 - score) * 0.11, 1) if board_available else None,
        mean_sway_ml=round(7.0 * dynamic_boost * eyes_boost + (100 - score) * 0.13, 1) if board_available else None,
        max_sway_ap=round(13.5 * dynamic_boost * eyes_boost + (100 - score) * 0.2, 1) if board_available else None,
        max_sway_ml=round(13.0 * dynamic_boost * eyes_boost + (100 - score) * 0.22, 1) if board_available else None,
        sway_velocity=round(18 * dynamic_boost * eyes_boost + (100 - score) * 0.3, 1) if board_available else None,
        instability_events=max(0, round((72 - score) / 5)) if board_available else None,
        trunk_deviation=round(3.2 + (100 - score) * 0.08, 1),
        shoulder_asymmetry=round(1.8 + (100 - score) * 0.05, 1),
        hip_asymmetry=round(1.7 + (100 - score) * 0.05, 1),
        body_center_deviation=round(3.5 + (100 - score) * 0.09, 1),
        interpretation=interpretation_for(score, acquisition_mode),
        created_at=date,
        updated_at=date,
    )


def add_samples(session: AssessmentSession, session_index: int) -> None:
    for sample_index in range(12):
        posture_score = clamp((session.posture_stability_score or 75) + ((sample_index % 5) - 2), 35, 99)
        session.posture_samples.append(
            PostureSample(
                timestamp_ms=sample_index * 2500,
                trunk_inclination=round((session.trunk_deviation or 4) + sample_index * 0.03, 1),
                shoulder_asymmetry=session.shoulder_asymmetry,
                hip_asymmetry=session.hip_asymmetry,
                body_center_deviation=session.body_center_deviation,
                posture_score=posture_score,
            )
        )
        if session.acquisition_mode != "webcam":
            session.sensor_samples.append(
                SensorSample(
                    timestamp_ms=sample_index * 2500,
                    front_left=round(14 + session_index + sample_index * 0.05, 1),
                    front_right=round(14.5 + session_index + sample_index * 0.04, 1),
                    rear_left=round(13.2 + session_index + sample_index * 0.03, 1),
                    rear_right=round(13.6 + session_index + sample_index * 0.04, 1),
                    anterior_posterior_sway=session.mean_sway_ap,
                    medial_lateral_sway=session.mean_sway_ml,
                    stability_score=session.board_stability_score,
                )
            )


def add_recommendations(session: AssessmentSession) -> None:
    recommendations = []
    if (session.trunk_deviation or 0) > 6:
        recommendations.append(("posture", "Continue trunk stabilization and postural alignment training.", "medium"))
    if session.test_type == "dynamic" and (session.total_balance_score or 0) < 72:
        recommendations.append(("dynamic", "Use static/support-ring work before increasing dynamic difficulty.", "high"))
    if session.visual_condition == "eyes_closed" and (session.total_balance_score or 0) < 75:
        recommendations.append(("vision", "Add proprioceptive training with safe therapist supervision.", "medium"))
    if not recommendations:
        recommendations.append(("progression", "Progress difficulty gradually while maintaining supervision.", "low"))

    for category, text, priority in recommendations:
        session.recommendations.append(
            Recommendation(
                category=category,
                recommendation_en=text,
                recommendation_fr=text,
                priority=priority,
            )
        )


def interpretation_for(score: float, acquisition_mode: str) -> str:
    if acquisition_mode == "webcam":
        return "Estimated webcam-based posture indicators suggest stable functional balance." if score >= 75 else "Estimated webcam-based posture indicators suggest follow-up attention."
    if score >= 80:
        return "Estimated functional balance indicators suggest controlled performance with continued monitoring."
    if score >= 65:
        return "Estimated functional balance indicators suggest moderate instability requiring rehabilitation follow-up."
    return "Estimated functional balance indicators suggest high instability requiring supervised progression."


def status_from_score(score: float, previous_score: float | None) -> str:
    if score < 62 or (previous_score is not None and score - previous_score < -3):
        return "Declining"
    if score < 70:
        return "Follow-up"
    if previous_score is not None and score - previous_score >= 2:
        return "Improving"
    return "Stable"


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))
