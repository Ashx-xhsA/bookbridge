"""Pydantic request/response models for worker API endpoints."""

from pydantic import BaseModel, Field


class TranslateChunkRequest(BaseModel):
    source_text: str = Field(..., min_length=1)
    target_lang: str = Field(..., min_length=2)


class LLMCredentials(BaseModel):
    """Optional per-request LLM credentials. Falls back to server env vars."""
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_model: str | None = None


class TranslateChunkAsyncRequest(BaseModel):
    job_id: str = Field(..., min_length=1, max_length=128)
    source_text: str = Field(..., min_length=1)
    target_lang: str = Field(..., min_length=2)
    context: str | None = None
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


class GlossaryExtractRequest(BaseModel):
    text: str = Field(..., min_length=1)
    target_lang: str = Field(default="zh-Hans")
    llm: LLMCredentials | None = None


class GlossaryTerm(BaseModel):
    english: str
    translation: str | None = None
    category: str = "general"


class GlossaryExtractResponse(BaseModel):
    terms: list[GlossaryTerm]
