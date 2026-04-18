"""Pydantic request/response models for worker API endpoints."""

from pydantic import BaseModel


class TranslateChunkRequest(BaseModel):
    project_id: str
    chunk_id: str


class ChunkData(BaseModel):
    chunk_id: int
    title: str
    start_page: int
    end_page: int
    page_count: int


class TranslateChunkResponse(BaseModel):
    job_id: str
    status: str = "queued"
    chunks: list[ChunkData] | None = None


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    error: str | None = None
    chunks: list[ChunkData] | None = None


class HealthResponse(BaseModel):
    status: str


class ErrorResponse(BaseModel):
    detail: str
