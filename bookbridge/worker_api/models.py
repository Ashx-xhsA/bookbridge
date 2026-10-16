"""Pydantic request/response models for worker API endpoints."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field, StrictBool, model_validator

from bookbridge.harness.config import MAX_CONTEXT_WINDOW
from bookbridge.harness.models import ALLOWED_TARGET_LANGS

MAX_SEGMENT_CHARS = 100_000
MAX_SEGMENTS = 5_000
MAX_TOTAL_SOURCE_CHARS = 1_000_000
MAX_GLOSSARY = 20_000
MAX_BOOK_CHARS = 5_000_000


def _check_lang(v: str) -> str:
    if v not in ALLOWED_TARGET_LANGS:
        raise ValueError("unsupported target_lang")
    return v


TargetLang = Annotated[str, AfterValidator(_check_lang)]


class AliasOfInput(BaseModel):
    english: str = Field(..., min_length=1, max_length=200)
    translation: str = Field(..., min_length=1, max_length=500)


class GlossaryTermInput(BaseModel):
    """A glossary term the BFF forwards to the Worker for injection into the prompt."""

    english: str = Field(..., min_length=1, max_length=200)
    translation: str = Field(..., min_length=1, max_length=500)
    category: str = Field("general", min_length=1, max_length=50)
    approved: bool = False
    # Set when this term is another name for an entity ("Mithrandir" → Gandalf).
    alias_of: AliasOfInput | None = None


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
    book_bible: StrictBool = True
    max_batch_chars: int = Field(6000, ge=1, le=50_000)


class CharacterInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    translation: str = Field(..., min_length=1, max_length=500)
    gender: str | None = Field(None, max_length=50)
    voice: str | None = Field(None, max_length=1000)
    notes: str | None = Field(None, max_length=1000)


class BibleInput(BaseModel):
    style_guide: str = Field("", max_length=5000)
    characters: list[CharacterInput] = Field(default_factory=list, max_length=500)


class TranslateSegmentsAsyncRequest(BaseModel):
    job_id: str = Field(..., min_length=1, max_length=128)
    target_lang: TargetLang
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
    # The project's reviewed (or draft) book bible; injected when config.book_bible.
    bible: BibleInput | None = None
    # Per-user LLM credentials; when absent the Worker's env provider is used.
    llm: LLMCredentials | None = None

    @model_validator(mode="after")
    def _bounded_and_unique(self) -> TranslateSegmentsAsyncRequest:
        if sum(len(s.source) for s in self.segments) > MAX_TOTAL_SOURCE_CHARS:
            raise ValueError("total source text too large")
        if len({s.index for s in self.segments}) != len(self.segments):
            raise ValueError("duplicate segment index")
        return self


class BibleScanAsyncRequest(BaseModel):
    job_id: str = Field(..., min_length=1, max_length=128)
    project_id: str = Field(..., min_length=1, max_length=128)
    target_lang: TargetLang
    # Paragraphs per chapter, in reading order.
    chapters: list[list[Annotated[str, Field(max_length=MAX_SEGMENT_CHARS)]]] = Field(
        ..., min_length=1, max_length=MAX_SEGMENTS
    )
    llm: LLMCredentials | None = None

    @model_validator(mode="after")
    def _bounded(self) -> BibleScanAsyncRequest:
        if sum(len(p) for ch in self.chapters for p in ch) > MAX_BOOK_CHARS:
            raise ValueError("book too large to scan")
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
