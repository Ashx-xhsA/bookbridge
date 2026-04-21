"""Pydantic request/response models for worker API endpoints."""

from pydantic import BaseModel, Field


class GlossaryTermInput(BaseModel):
    """A glossary term the BFF forwards to the Worker for injection into the prompt."""

    english: str = Field(..., min_length=1, max_length=200)
    translation: str = Field(..., min_length=1, max_length=500)
    category: str = Field("general", min_length=1, max_length=50)
    approved: bool = False


class LLMCredentials(BaseModel):
    """Optional per-request LLM credentials. Falls back to server env vars."""

    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_model: str | None = None


class TranslateChunkRequest(BaseModel):
    source_text: str = Field(..., min_length=1)
    target_lang: str = Field(..., min_length=2)
    glossary: list[GlossaryTermInput] | None = None


class TranslateChunkAsyncRequest(BaseModel):
    job_id: str = Field(..., min_length=1, max_length=128)
    source_text: str = Field(..., min_length=1)
    target_lang: str = Field(..., min_length=2)
    # When set, new_terms extracted during translation are POSTed back to
    # /api/internal/worker-callback/glossary for this project_id.
    project_id: str | None = Field(None, min_length=1, max_length=128)
    glossary: list[GlossaryTermInput] | None = None
    # Adjacent-chapter summaries etc. that improve consistency. Rendered
    # into the system prompt alongside the glossary section.
    context: str | None = None
    # Per-user LLM credentials. When provided the Worker uses these in place
    # of the server-wide env vars — required for the free-tier / BYO-key flow.
    llm: LLMCredentials | None = None


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


class SummarizeRequest(BaseModel):
    text: str = Field(..., min_length=1)
    max_words: int = Field(default=100, ge=20, le=300)
    llm: LLMCredentials | None = None


class SummarizeResponse(BaseModel):
    summary: str
