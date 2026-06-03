from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    patient_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160), index=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sex: Mapped[str | None] = mapped_column(String(32), nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    pathology: Mapped[str | None] = mapped_column(String(240), nullable=True)
    clinical_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    sessions: Mapped[list["Session"]] = relationship(back_populates="patient")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    acquisition_mode: Mapped[str] = mapped_column(String(16), default="demo")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    test_type: Mapped[str] = mapped_column(String(16))
    support_ring: Mapped[str] = mapped_column(String(16))
    visual_condition: Mapped[str] = mapped_column(String(32))
    duration_seconds: Mapped[int] = mapped_column(Integer, default=30)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_balance_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    board_stability_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    posture_stability_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    mean_sway_ap: Mapped[float | None] = mapped_column(Float, nullable=True)
    mean_sway_ml: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_sway_ap: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_sway_ml: Mapped[float | None] = mapped_column(Float, nullable=True)
    sway_velocity: Mapped[float | None] = mapped_column(Float, nullable=True)
    instability_events: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trunk_deviation: Mapped[float | None] = mapped_column(Float, nullable=True)
    shoulder_asymmetry: Mapped[float | None] = mapped_column(Float, nullable=True)
    hip_asymmetry: Mapped[float | None] = mapped_column(Float, nullable=True)
    interpretation: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    patient: Mapped["Patient"] = relationship(back_populates="sessions")
    sensor_samples: Mapped[list["SensorSample"]] = relationship(back_populates="session")
    posture_samples: Mapped[list["PostureSample"]] = relationship(back_populates="session")
    reports: Mapped[list["Report"]] = relationship(back_populates="session")
    recommendations: Mapped[list["Recommendation"]] = relationship(back_populates="session")


class SensorSample(Base):
    __tablename__ = "sensor_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    timestamp_ms: Mapped[int] = mapped_column(Integer)
    front_left: Mapped[float] = mapped_column(Float)
    front_right: Mapped[float] = mapped_column(Float)
    rear_left: Mapped[float] = mapped_column(Float)
    rear_right: Mapped[float] = mapped_column(Float)
    anterior_posterior_sway: Mapped[float] = mapped_column(Float)
    medial_lateral_sway: Mapped[float] = mapped_column(Float)
    stability_score: Mapped[float] = mapped_column(Float)

    session: Mapped["Session"] = relationship(back_populates="sensor_samples")


class PostureSample(Base):
    __tablename__ = "posture_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    timestamp_ms: Mapped[int] = mapped_column(Integer)
    trunk_inclination: Mapped[float] = mapped_column(Float)
    shoulder_asymmetry: Mapped[float] = mapped_column(Float)
    hip_asymmetry: Mapped[float] = mapped_column(Float)
    body_center_deviation: Mapped[float] = mapped_column(Float)
    posture_score: Mapped[float] = mapped_column(Float)

    session: Mapped["Session"] = relationship(back_populates="posture_samples")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    report_file_path: Mapped[str] = mapped_column(String(500))
    language: Mapped[str] = mapped_column(String(8), default="en")
    acquisition_mode: Mapped[str] = mapped_column(String(16), default="demo")
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["Session"] = relationship(back_populates="reports")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    category: Mapped[str] = mapped_column(String(80))
    recommendation_en: Mapped[str] = mapped_column(Text)
    recommendation_fr: Mapped[str] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(16), default="medium")

    session: Mapped["Session"] = relationship(back_populates="recommendations")
