import math
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

FRAME_VALUES = 30 * 126
MAX_ABS_VALUE = 2.0


class SampleIn(BaseModel):
    label: str = Field(min_length=1, max_length=50)
    frames: list[float] = Field(min_length=FRAME_VALUES, max_length=FRAME_VALUES)

    @field_validator("frames")
    @classmethod
    def _finite_and_bounded(cls, v: list[float]) -> list[float]:
        if any(not math.isfinite(x) or abs(x) > MAX_ABS_VALUE for x in v):
            raise ValueError("Valores no válidos: deben ser finitos y estar entre -2 y 2")
        return v


class SampleCreated(BaseModel):
    id: uuid.UUID


class SampleSummary(BaseModel):
    counts: dict[str, int]


class ReadyModelOut(BaseModel):
    id: uuid.UUID
    labels: list[str]
    metrics: dict
    created_at: datetime


class ModelJobOut(BaseModel):
    id: uuid.UUID
    status: str
    error: str | None
    created_at: datetime


class ModelStatusOut(BaseModel):
    ready: ReadyModelOut | None
    latest: ModelJobOut | None
