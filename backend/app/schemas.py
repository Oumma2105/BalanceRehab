from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


AcquisitionMode = Literal["demo", "real"]
TestType = Literal["static", "dynamic"]
SupportRing = Literal["installed", "removed"]
VisualCondition = Literal["eyes_open", "eyes_closed"]


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
    patient_code: str
    full_name: str
    age: int | None = None
    sex: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    pathology: str | None = None
    clinical_notes: str | None = None


class PatientCreate(PatientBase):
    pass


class PatientRead(PatientBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
