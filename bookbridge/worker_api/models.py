"""Pydantic request/response models for worker API endpoints."""

from pydantic import BaseModel, Field


class TranslateChunkRequest(BaseModel):
    project_id: str
    chunk_id: str
    source_text: str = Field(..., min_length=1)
    target_lang: str = Field(..., min_length=2)


class TranslateChunkResponse(BaseModel):
    job_id: str
    status: str = "queued"
    translation: str | None = None


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    error: str | None = None


class HealthResponse(BaseModel):
    status: str


class ErrorResponse(BaseModel):
    detail: str
