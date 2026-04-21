"""Pydantic request/response models for worker API endpoints."""

from pydantic import BaseModel, Field


class GlossaryTermInput(BaseModel):
    """A glossary term the BFF forwards to the Worker for injection into the prompt."""

    english: str = Field(..., min_length=1, max_length=200)
    translation: str = Field(..., min_length=1, max_length=500)
    category: str = Field("general", min_length=1, max_length=50)
    approved: bool = False


class TranslateChunkRequest(BaseModel):
    source_text: str = Field(..., min_length=1)
    target_lang: str = Field(..., min_length=2)
    glossary: list[GlossaryTermInput] | None = None


class TranslateChunkAsyncRequest(BaseModel):
    job_id: str = Field(..., min_length=1, max_length=128)
    source_text: str = Field(..., min_length=1)
    target_lang: str = Field(..., min_length=2)
    # When set, new_terms extracted during translation are POSTed back to
    # /api/internal/worker-callback/glossary for this project_id. Omit for
    # anonymous/test calls that don't want glossary growth.
    project_id: str | None = Field(None, min_length=1, max_length=128)
    glossary: list[GlossaryTermInput] | None = None


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
