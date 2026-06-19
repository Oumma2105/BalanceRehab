def create_patient(client, **overrides):
    payload = {
        "full_name": "Test Patient",
        "age": 42,
        "sex": "Female",
        "height_cm": 168,
        "weight_kg": 64,
        **overrides,
    }
    response = client.post("/api/patients", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_health_check(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "app": "BalanceRehab API",
        "database": "active",
        "default_mode": "webcam",
    }


def test_database_health_reports_unavailable_on_query_error():
    from sqlalchemy.exc import SQLAlchemyError

    from app.api.health import database_health

    class BrokenSession:
        def execute(self, statement):
            raise SQLAlchemyError("database is offline")

    assert database_health(BrokenSession()) == "unavailable"


def test_create_patient_generates_code_and_rejects_duplicate(client):
    patient = create_patient(client, patient_code="BR-2000")

    assert patient["patient_code"] == "BR-2000"

    duplicate = client.post(
        "/api/patients",
        json={"patient_code": "BR-2000", "full_name": "Duplicate Patient"},
    )

    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Patient code already exists"


def test_patient_validation_rejects_impossible_values(client):
    response = client.post(
        "/api/patients",
        json={"full_name": "Invalid Patient", "age": -1, "height_cm": 0, "weight_kg": -5},
    )

    assert response.status_code == 422


def test_patient_validation_rejects_blank_name_after_trimming(client):
    response = client.post(
        "/api/patients",
        json={"full_name": "   "},
    )

    assert response.status_code == 422


def test_patient_strings_are_trimmed(client):
    patient = create_patient(client, patient_code=" BR-2001 ", full_name="  Trimmed Patient  ")

    assert patient["patient_code"] == "BR-2001"
    assert patient["full_name"] == "Trimmed Patient"


def test_webcam_session_computes_posture_metrics(client):
    patient = create_patient(client)
    response = client.post(
        "/api/sessions",
        json={
            "patient_id": patient["id"],
            "acquisition_mode": "webcam",
            "test_type": "static",
            "support_ring": "installed",
            "visual_condition": "eyes_open",
            "duration_seconds": 30,
            "posture_samples": [
                {
                    "timestamp_ms": 0,
                    "trunk_inclination": 4,
                    "shoulder_asymmetry": 2,
                    "hip_asymmetry": 3,
                    "body_center_deviation": 5,
                    "posture_score": 80,
                },
                {
                    "timestamp_ms": 1000,
                    "trunk_inclination": 6,
                    "shoulder_asymmetry": 4,
                    "hip_asymmetry": 5,
                    "body_center_deviation": 7,
                    "posture_score": 90,
                },
            ],
        },
    )

    assert response.status_code == 201, response.text
    session = response.json()
    assert session["is_demo"] is False
    assert session["total_balance_score"] == 85
    assert session["posture_stability_score"] == 85
    assert session["trunk_deviation"] == 5
    assert session["status"] == "Stable"
    assert len(session["recommendations"]) == 1


def test_webcam_session_rejects_board_samples(client):
    patient = create_patient(client)
    response = client.post(
        "/api/sessions",
        json={
            "patient_id": patient["id"],
            "acquisition_mode": "webcam",
            "test_type": "static",
            "support_ring": "installed",
            "visual_condition": "eyes_open",
            "sensor_samples": [
                {
                    "timestamp_ms": 0,
                    "front_left": 20,
                    "front_right": 20,
                    "rear_left": 20,
                    "rear_right": 20,
                }
            ],
        },
    )

    assert response.status_code == 422
    assert "Webcam-only sessions" in response.json()["detail"]


def test_board_session_computes_metrics_and_report_summary(client):
    patient = create_patient(client)
    session_response = client.post(
        "/api/sessions",
        json={
            "patient_id": patient["id"],
            "acquisition_mode": "board",
            "test_type": "dynamic",
            "support_ring": "removed",
            "visual_condition": "eyes_closed",
            "duration_seconds": 30,
            "sensor_samples": [
                {
                    "timestamp_ms": 0,
                    "front_left": 30,
                    "front_right": 30,
                    "rear_left": 20,
                    "rear_right": 20,
                },
                {
                    "timestamp_ms": 1000,
                    "front_left": 20,
                    "front_right": 30,
                    "rear_left": 25,
                    "rear_right": 25,
                },
            ],
        },
    )
    assert session_response.status_code == 201, session_response.text
    session = session_response.json()

    assert session["is_demo"] is False
    assert session["board_stability_score"] is not None
    assert session["total_balance_score"] == session["board_stability_score"]
    assert session["mean_sway_ap"] is not None
    assert session["sway_velocity"] is not None

    report_response = client.post(
        "/api/reports",
        json={"session_id": session["id"], "language": "en"},
    )
    assert report_response.status_code == 201, report_response.text
    report = report_response.json()
    assert report["patient_id"] == patient["id"]
    assert "Dynamic Eyes closed assessment" in report["summary"]


def test_session_validation_rejects_bad_ranges(client):
    patient = create_patient(client)
    response = client.post(
        "/api/sessions",
        json={
            "patient_id": patient["id"],
            "acquisition_mode": "webcam",
            "test_type": "static",
            "support_ring": "installed",
            "visual_condition": "eyes_open",
            "duration_seconds": 0,
            "total_balance_score": 101,
            "posture_samples": [{"timestamp_ms": -1, "posture_score": 80}],
        },
    )

    assert response.status_code == 422


def test_append_sensor_samples_recomputes_board_session(client):
    patient = create_patient(client)
    session_response = client.post(
        "/api/sessions",
        json={
            "patient_id": patient["id"],
            "acquisition_mode": "board",
            "test_type": "dynamic",
            "support_ring": "removed",
            "visual_condition": "eyes_open",
            "duration_seconds": 30,
        },
    )
    assert session_response.status_code == 201, session_response.text
    session = session_response.json()
    assert session["total_balance_score"] is None

    append_response = client.post(
        f"/api/sessions/{session['id']}/sensor-samples",
        json={
            "samples": [
                {
                    "timestamp_ms": 0,
                    "front_left": 30,
                    "front_right": 30,
                    "rear_left": 20,
                    "rear_right": 20,
                },
                {
                    "timestamp_ms": 1000,
                    "front_left": 20,
                    "front_right": 30,
                    "rear_left": 25,
                    "rear_right": 25,
                },
            ]
        },
    )

    assert append_response.status_code == 200, append_response.text
    updated = append_response.json()
    assert len(updated["sensor_samples"]) == 2
    assert updated["board_stability_score"] is not None
    assert updated["total_balance_score"] == updated["board_stability_score"]
    assert updated["status"] in {"Stable", "Follow-up", "Declining"}


def test_append_sensor_samples_rejects_webcam_session(client):
    patient = create_patient(client)
    session_response = client.post(
        "/api/sessions",
        json={
            "patient_id": patient["id"],
            "acquisition_mode": "webcam",
            "test_type": "static",
            "support_ring": "installed",
            "visual_condition": "eyes_open",
            "duration_seconds": 30,
        },
    )
    assert session_response.status_code == 201, session_response.text
    session = session_response.json()

    response = client.post(
        f"/api/sessions/{session['id']}/sensor-samples",
        json={
            "samples": [
                {
                    "timestamp_ms": 0,
                    "front_left": 30,
                    "front_right": 30,
                    "rear_left": 20,
                    "rear_right": 20,
                }
            ]
        },
    )

    assert response.status_code == 422
    assert "Webcam-only sessions" in response.json()["detail"]


def test_movement_label_validation_rejects_invalid_time_range(client):
    patient = create_patient(client)
    session_response = client.post(
        "/api/sessions",
        json={
            "patient_id": patient["id"],
            "acquisition_mode": "webcam",
            "test_type": "static",
            "support_ring": "installed",
            "visual_condition": "eyes_open",
        },
    )
    assert session_response.status_code == 201, session_response.text
    session = session_response.json()

    response = client.post(
        f"/api/sessions/{session['id']}/movement-labels",
        json={
            "start_ms": 2000,
            "end_ms": 1000,
            "label": "voluntary",
            "intent": "voluntary",
            "confidence": 0.8,
        },
    )

    assert response.status_code == 422


def test_update_session_can_clear_nullable_fields(client):
    patient = create_patient(client)
    session_response = client.post(
        "/api/sessions",
        json={
            "patient_id": patient["id"],
            "acquisition_mode": "webcam",
            "test_type": "static",
            "support_ring": "installed",
            "visual_condition": "eyes_open",
            "notes": "Initial note",
            "status": "Follow-up",
            "interpretation": "Initial interpretation",
        },
    )
    assert session_response.status_code == 201, session_response.text
    session = session_response.json()

    update_response = client.patch(
        f"/api/sessions/{session['id']}",
        json={"notes": None, "interpretation": None, "status": None},
    )

    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()
    assert updated["notes"] is None
    assert updated["interpretation"] is None
    assert updated["status"] is None


def test_update_session_omitted_fields_are_preserved(client):
    patient = create_patient(client)
    session_response = client.post(
        "/api/sessions",
        json={
            "patient_id": patient["id"],
            "acquisition_mode": "webcam",
            "test_type": "static",
            "support_ring": "installed",
            "visual_condition": "eyes_open",
            "notes": "Keep this note",
            "status": "Follow-up",
            "interpretation": "Keep this interpretation",
        },
    )
    assert session_response.status_code == 201, session_response.text
    session = session_response.json()

    update_response = client.patch(
        f"/api/sessions/{session['id']}",
        json={"notes": "Updated note"},
    )

    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()
    assert updated["notes"] == "Updated note"
    assert updated["interpretation"] == "Keep this interpretation"
    assert updated["status"] == "Follow-up"


def test_update_session_strings_are_trimmed(client):
    patient = create_patient(client)
    session_response = client.post(
        "/api/sessions",
        json={
            "patient_id": patient["id"],
            "acquisition_mode": "webcam",
            "test_type": "static",
            "support_ring": "installed",
            "visual_condition": "eyes_open",
        },
    )
    assert session_response.status_code == 201, session_response.text
    session = session_response.json()

    update_response = client.patch(
        f"/api/sessions/{session['id']}",
        json={"notes": "  Updated note  ", "interpretation": "  Updated interpretation  "},
    )

    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()
    assert updated["notes"] == "Updated note"
    assert updated["interpretation"] == "Updated interpretation"


def test_minimal_sessions_get_independent_empty_collections(client):
    patient = create_patient(client)

    first = client.post(
        "/api/sessions",
        json={
            "patient_id": patient["id"],
            "acquisition_mode": "webcam",
            "test_type": "static",
            "support_ring": "installed",
            "visual_condition": "eyes_open",
        },
    )
    second = client.post(
        "/api/sessions",
        json={
            "patient_id": patient["id"],
            "acquisition_mode": "webcam",
            "test_type": "dynamic",
            "support_ring": "removed",
            "visual_condition": "eyes_closed",
        },
    )

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert first.json()["sensor_samples"] == []
    assert first.json()["posture_samples"] == []
    assert second.json()["sensor_samples"] == []
    assert second.json()["posture_samples"] == []


def test_board_packet_persists_sample_and_updates_session_metrics(monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app.api import board
    from app.database import Base
    from app.models import Patient, SensorSample
    from app.models import Session as AssessmentSession

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(board, "SessionLocal", TestingSessionLocal)

    with TestingSessionLocal() as db:
        patient = Patient(patient_code="BR-3000", full_name="Board Patient")
        db.add(patient)
        db.flush()
        session = AssessmentSession(
            patient_id=patient.id,
            acquisition_mode="board",
            is_demo=False,
            test_type="dynamic",
            support_ring="removed",
            visual_condition="eyes_open",
            duration_seconds=30,
        )
        db.add(session)
        db.commit()
        session_id = session.id

    result = board._process_packet(
        session_id,
        {
            "timestamp_ms": 0,
            "front_left": 30,
            "front_right": 30,
            "rear_left": 20,
            "rear_right": 20,
            "anterior_posterior_sway": None,
            "medial_lateral_sway": None,
        },
    )

    assert result["persisted"] is True
    assert result["session_metrics"]["board_stability_score"] is not None
    assert result["session_metrics"]["total_balance_score"] == result["session_metrics"]["board_stability_score"]

    with TestingSessionLocal() as db:
        updated = db.get(AssessmentSession, session_id)
        samples = db.query(SensorSample).filter(SensorSample.session_id == session_id).all()

    assert len(samples) == 1
    assert updated.board_stability_score == result["session_metrics"]["board_stability_score"]
    assert updated.status in {"Stable", "Follow-up", "Declining"}


def test_board_packet_normalizes_compact_esp32_payload():
    from app.api.board import _normalize_packet

    packet = _normalize_packet(
        {
            "t": 1234,
            "fl": 0.12,
            "fr": -0.04,
            "rl": 0.02,
            "rr": -0.08,
            "ap": 0.09,
            "ml": -0.13,
        }
    )

    assert packet == {
        "timestamp_ms": 1234,
        "front_left": 0.12,
        "front_right": -0.04,
        "rear_left": 0.02,
        "rear_right": -0.08,
        "anterior_posterior_sway": 0.09,
        "medial_lateral_sway": -0.13,
    }


def test_board_packet_does_not_persist_to_webcam_session(monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app.api import board
    from app.database import Base
    from app.models import Patient, SensorSample
    from app.models import Session as AssessmentSession

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(board, "SessionLocal", TestingSessionLocal)

    with TestingSessionLocal() as db:
        patient = Patient(patient_code="BR-3001", full_name="Webcam Patient")
        db.add(patient)
        db.flush()
        session = AssessmentSession(
            patient_id=patient.id,
            acquisition_mode="webcam",
            is_demo=False,
            test_type="static",
            support_ring="installed",
            visual_condition="eyes_open",
            duration_seconds=30,
        )
        db.add(session)
        db.commit()
        session_id = session.id

    result = board._process_packet(
        session_id,
        {
            "timestamp_ms": 0,
            "front_left": 30,
            "front_right": 30,
            "rear_left": 20,
            "rear_right": 20,
            "anterior_posterior_sway": None,
            "medial_lateral_sway": None,
        },
    )

    assert result["persisted"] is False
    assert result["error"] == "webcam-only sessions cannot include board samples"

    with TestingSessionLocal() as db:
        samples = db.query(SensorSample).filter(SensorSample.session_id == session_id).all()

    assert samples == []
