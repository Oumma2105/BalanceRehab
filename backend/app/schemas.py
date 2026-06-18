from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


AcquisitionMode = Literal["webcam", "demo", "board", "combined", "board_future", "combined_future"]
TestType = Literal["static", "dynamic"]
SupportRing = Literal["installed", "removed"]
VisualCondition = Literal["eyes_open", "eyes_closed"]
SessionStatus = Literal["Stable", "Improving", "Follow-up", "Declining"]
RecommendationPriority = Literal["low", "medium", "high"]
MovementLabelName = Literal[
    "voluntary",
    "involuntary",
    "compensation",
    "normal_correction",
    "loss_of_balance",
    "tracking_failure",
    "unknown",
]
MovementIntent = Literal["voluntary", "involuntary", "unknown"]


class HealthResponse(BaseModel):
    status: str
    app: str
    database: str
    default_mode: AcquisitionMode


class SystemStatus(BaseModel):
    database: str
    demo_mode: bool
    webcam: str
    esp32: str
    acquisition_modes: list[AcquisitionMode]


class PatientBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    patient_code: str | None = Field(default=None, min_length=1, max_length=32)
    full_name: str = Field(min_length=1, max_length=160)
    age: int | None = Field(default=None, ge=0, le=120)
    sex: str | None = None
    height_cm: float | None = Field(default=None, gt=0, le=260)
    weight_kg: float | None = Field(default=None, gt=0, le=350)
    dominant_side: str | None = None
    pathology: str | None = None
    clinical_goal: str | None = None
    clinical_notes: str | None = None


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    full_name: str | None = Field(default=None, min_length=1, max_length=160)
    age: int | None = Field(default=None, ge=0, le=120)
    sex: str | None = None
    height_cm: float | None = Field(default=None, gt=0, le=260)
    weight_kg: float | None = Field(default=None, gt=0, le=350)
    dominant_side: str | None = None
    pathology: str | None = None
    clinical_goal: str | None = None
    clinical_notes: str | None = None


class PatientRead(PatientBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_code: str
    latest_score: float | None = None
    last_assessment_date: datetime | None = None
    status: str | None = None
    created_at: datetime
    updated_at: datetime


class SensorSampleBase(BaseModel):
    timestamp_ms: int = Field(ge=0)
    front_left: float | None = None
    front_right: float | None = None
    rear_left: float | None = None
    rear_right: float | None = None
    anterior_posterior_sway: float | None = None
    medial_lateral_sway: float | None = None
    stability_score: float | None = None


class SensorSampleRead(SensorSampleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int


class PostureSampleBase(BaseModel):
    timestamp_ms: int = Field(ge=0)
    trunk_inclination: float | None = Field(default=None, ge=0)
    shoulder_asymmetry: float | None = Field(default=None, ge=0)
    hip_asymmetry: float | None = Field(default=None, ge=0)
    body_center_deviation: float | None = Field(default=None, ge=0)
    posture_score: float | None = Field(default=None, ge=0, le=100)
    stability_score: float | None = Field(default=None, ge=0, le=100)
    body_center_x: float | None = None
    body_center_y: float | None = None
    shoulder_center_x: float | None = None
    shoulder_center_y: float | None = None
    hip_center_x: float | None = None
    hip_center_y: float | None = None
    head_center_x: float | None = None
    head_center_y: float | None = None
    estimated_body_sway: float | None = Field(default=None, ge=0)
    hand_arm_compensation: float | None = Field(default=None, ge=0)
    movement_label: MovementLabelName | None = None
    movement_intent: MovementIntent | None = None
    label_confidence: float | None = None
    raw_landmarks_json: str | None = None


class PostureSampleRead(PostureSampleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int


class RecommendationBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    category: str = Field(min_length=1, max_length=80)
    recommendation_en: str = Field(min_length=1)
    recommendation_fr: str | None = None
    priority: RecommendationPriority = "medium"


class RecommendationRead(RecommendationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int


class MovementLabelBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    label: MovementLabelName
    intent: MovementIntent | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    notes: str | None = None

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.end_ms < self.start_ms:
            raise ValueError("end_ms must be greater than or equal to start_ms")
        return self


class MovementLabelCreate(MovementLabelBase):
    pass


class MovementLabelRead(MovementLabelBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    created_at: datetime


class MovementFeaturesRead(BaseModel):
    session_id: int
    model_status: str
    intent_estimate: MovementIntent
    intent_confidence: float | None = None
    tracking_quality: dict[str, Any]
    features: dict[str, float | int | str | None]
    training_ready: bool
    labels_count: int
    note: str


class MovementTrainingDatasetRow(BaseModel):
    session_id: int
    patient_id: int
    label_id: int
    label: MovementLabelName
    intent: MovementIntent | None = None
    confidence: float | None = None
    start_ms: int
    end_ms: int
    tracking_quality: dict[str, Any]
    features: dict[str, float | int | str | None]


class MovementTrainingReadiness(BaseModel):
    labeled_sessions: int
    labeled_segments: int
    usable_labeled_segments: int
    label_counts: dict[str, int]
    intent_counts: dict[str, int]
    ready_for_training: bool
    recommended_min_segments: int
    note: str


class MovementModelRead(BaseModel):
    trained: bool
    model_type: str | None = None
    created_at: str | None = None
    training_samples: int = 0
    class_counts: dict[str, int] = Field(default_factory=dict)
    evaluation: dict[str, Any] | None = None
    note: str | None = None
    reason: str | None = None


class SessionBase(BaseModel):
    patient_id: int
    acquisition_mode: AcquisitionMode = "webcam"
    is_demo: bool = False
    test_type: TestType
    support_ring: SupportRing
    visual_condition: VisualCondition
    duration_seconds: int = Field(default=30, gt=0, le=600)
    notes: str | None = None
    status: SessionStatus | None = None
    total_balance_score: float | None = Field(default=None, ge=0, le=100)
    board_stability_score: float | None = Field(default=None, ge=0, le=100)
    posture_stability_score: float | None = Field(default=None, ge=0, le=100)
    mean_sway_ap: float | None = Field(default=None, ge=0)
    mean_sway_ml: float | None = Field(default=None, ge=0)
    max_sway_ap: float | None = Field(default=None, ge=0)
    max_sway_ml: float | None = Field(default=None, ge=0)
    mean_resultant_sway: float | None = Field(default=None, ge=0)
    max_resultant_sway: float | None = Field(default=None, ge=0)
    rms_sway: float | None = Field(default=None, ge=0)
    path_length: float | None = Field(default=None, ge=0)
    sensor_quality: float | None = Field(default=None, ge=0, le=100)
    sway_velocity: float | None = Field(default=None, ge=0)
    instability_events: int | None = Field(default=None, ge=0)
    trunk_deviation: float | None = Field(default=None, ge=0)
    shoulder_asymmetry: float | None = Field(default=None, ge=0)
    hip_asymmetry: float | None = Field(default=None, ge=0)
    body_center_deviation: float | None = Field(default=None, ge=0)
    interpretation: str | None = None


class SessionCreate(SessionBase):
    sensor_samples: list[SensorSampleBase] = Field(default_factory=list)
    posture_samples: list[PostureSampleBase] = Field(default_factory=list)
    recommendations: list[RecommendationBase] = Field(default_factory=list)
    movement_labels: list[MovementLabelCreate] = Field(default_factory=list)


class SessionUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    notes: str | None = None
    interpretation: str | None = None
    status: SessionStatus | None = None


class SensorSamplesAppend(BaseModel):
    samples: list[SensorSampleBase] = Field(min_length=1)


class SessionRead(SessionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    sensor_samples: list[SensorSampleRead] = Field(default_factory=list)
    posture_samples: list[PostureSampleRead] = Field(default_factory=list)
    recommendations: list[RecommendationRead] = Field(default_factory=list)
    movement_labels: list[MovementLabelRead] = Field(default_factory=list)


class ReportBase(BaseModel):
    session_id: int
    report_file_path: str | None = None
    language: Literal["en", "fr"] = "en"
    acquisition_mode: AcquisitionMode = "webcam"
    summary: str | None = None


class ReportCreate(ReportBase):
    pass


class ReportRead(ReportBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    report_id: str
    patient_id: int
    downloadable: bool
    generated_at: datetime


class ProgressPoint(BaseModel):
    session_id: int
    label: str
    date: datetime
    test_type: str
    visual_condition: str
    acquisition_mode: AcquisitionMode | str
    status: str | None = None
    total_score: float | None = None
    posture_score: float | None = None
    trunk_deviation: float | None = None
    shoulder_asymmetry: float | None = None
    hip_asymmetry: float | None = None
    body_center_deviation: float | None = None


class ProgressAnalyticsRead(BaseModel):
    patient_id: int
    patient_code: str
    patient_name: str
    latest_score: float | None = None
    session_count: int
    score_change: float | None = None
    static_average: float | None = None
    dynamic_average: float | None = None
    eyes_open_average: float | None = None
    eyes_closed_average: float | None = None
    follow_up_count: int
    declining_count: int
    trend: list[ProgressPoint] = Field(default_factory=list)


class SessionReportData(BaseModel):
    patient: PatientRead
    session: SessionRead
    board_metrics_available: bool
    acquisition_mode_label: str
    clinical_impression: str | None = None
    recommendations: list[str] = Field(default_factory=list)
