"""Pydantic request/response models for worker API endpoints."""

from pydantic import BaseModel


class TranslateChunkRequest(BaseModel):
    project_id: str
    chunk_id: str


class TranslateChunkResponse(BaseModel):
    job_id: str
    status: str = "queued"


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    error: str | None = None


class HealthResponse(BaseModel):
    status: str


class ErrorResponse(BaseModel):
    detail: str
