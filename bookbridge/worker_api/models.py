"""Pydantic request/response models for worker API endpoints."""

from pydantic import BaseModel


class TranslateChunkRequest(BaseModel):
    chunk_id: str


class TranslateChunkResponse(BaseModel):
    job_id: str


class JobStatusResponse(BaseModel):
    status: str
    result: str | None = None


class HealthResponse(BaseModel):
    status: str


class ErrorResponse(BaseModel):
    detail: str
