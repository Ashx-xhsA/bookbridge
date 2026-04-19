"""Pydantic request/response models for worker API endpoints."""

from pydantic import BaseModel, Field


class TranslateChunkRequest(BaseModel):
    source_text: str = Field(..., min_length=1)
    target_lang: str = Field(..., min_length=2)


class ChunkData(BaseModel):
    chunk_id: int
    title: str
    start_page: int
    end_page: int
    page_count: int
    content: str | None = None


class TranslateChunkResponse(BaseModel):
    job_id: str
    status: str = "queued"
    chunks: list[ChunkData] | None = None
    translation: str | None = None


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    error: str | None = None
    chunks: list[ChunkData] | None = None


class HealthResponse(BaseModel):
    status: str


class ErrorResponse(BaseModel):
    detail: str
