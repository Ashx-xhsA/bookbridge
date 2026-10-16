"""Pydantic request/response models for worker API endpoints."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from bookbridge.harness.config import MAX_CONTEXT_WINDOW
from bookbridge.harness.models import ALLOWED_TARGET_LANGS

MAX_SEGMENT_CHARS = 100_000
MAX_SEGMENTS = 5_000
MAX_TOTAL_SOURCE_CHARS = 1_000_000
MAX_GLOSSARY = 5_000


class GlossaryTermInput(BaseModel):
    """A glossary term the BFF forwards to the Worker for injection into the prompt."""

    english: str = Field(..., min_length=1, max_length=200)
    translation: str = Field(..., min_length=1, max_length=500)
    category: str = Field("general", min_length=1, max_length=50)
    approved: bool = False
    aliases: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field(
        default_factory=list, max_length=20
    )


class LLMCredentials(BaseModel):
    """Optional per-request LLM credentials. Falls back to server env vars."""

    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_model: str | None = None


class SegmentInput(BaseModel):
    index: int = Field(..., ge=0)
    source: str = Field(..., min_length=1, max_length=MAX_SEGMENT_CHARS)


class ContextSegmentInput(BaseModel):
    source: str = Field(..., min_length=1, max_length=MAX_SEGMENT_CHARS)
    translation: str | None = Field(None, max_length=MAX_SEGMENT_CHARS * 4)


class TranslationConfigInput(BaseModel):
    """Ablation switches (see harness.config.TranslationConfig); defaults = all on."""

    glossary_mode: Literal["full", "matched"] = "matched"
    context_window: int = Field(3, ge=0, le=MAX_CONTEXT_WINDOW)


class TranslateSegmentsAsyncRequest(BaseModel):
    job_id: str = Field(..., min_length=1, max_length=128)
    target_lang: str = Field(..., min_length=2)
    segments: list[SegmentInput] = Field(..., min_length=1, max_length=MAX_SEGMENTS)
    # Segments just before the first one (e.g. the end of the previous
    # chapter) — seeds the rolling context window.
    preceding: list[ContextSegmentInput] = Field(
        default_factory=list, max_length=MAX_CONTEXT_WINDOW
    )
    # When set, terms from the extraction pass are POSTed to the glossary callback.
    project_id: str | None = Field(None, min_length=1, max_length=128)
    glossary: list[GlossaryTermInput] = Field(default_factory=list, max_length=MAX_GLOSSARY)
    config: TranslationConfigInput = Field(default_factory=TranslationConfigInput)
    # Per-user LLM credentials; when absent the Worker's env provider is used.
    llm: LLMCredentials | None = None

    @field_validator("target_lang")
    @classmethod
    def _known_target(cls, v: str) -> str:
        if v not in ALLOWED_TARGET_LANGS:
            raise ValueError("unsupported target_lang")
        return v

    @model_validator(mode="after")
    def _bounded_and_unique(self) -> TranslateSegmentsAsyncRequest:
        if sum(len(s.source) for s in self.segments) > MAX_TOTAL_SOURCE_CHARS:
            raise ValueError("total source text too large")
        if len({s.index for s in self.segments}) != len(self.segments):
            raise ValueError("duplicate segment index")
        return self


class ChapterData(BaseModel):
    number: int
    title: str
    paragraphs: list[str]


class ParseResponse(BaseModel):
    job_id: str
    status: str = "completed"
    chapters: list[ChapterData]


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
