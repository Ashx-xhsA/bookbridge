"""Shared harness types: glossary entries, context segments, the LLM client contract."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from bookbridge.quality.models import Issue

ALLOWED_SOURCE_LANGS: frozenset[str] = frozenset({"en"})
ALLOWED_TARGET_LANGS: frozenset[str] = frozenset(
    {"zh-Hans", "zh-Hant", "es", "fr", "ja", "ko", "de"}
)
TERM_CATEGORIES: frozenset[str] = frozenset(
    {"person", "place", "organization", "technical", "general"}
)


@dataclass(frozen=True)
class AliasTarget:
    """The main entry an alias refers to (e.g. Gandalf / 甘道夫)."""

    english: str
    translation: str


@dataclass(frozen=True)
class GlossaryEntry:
    """A term the BFF passes in before translation.

    `approved` terms MUST be followed verbatim; unapproved ones are strong
    suggestions. An alias ("Mithrandir") is its own entry with its own fixed
    translation plus `alias_of` pointing at the main entity: the model learns
    who is meant, but the alias is translated as written — never swapped for
    the main name.
    """

    english: str
    translation: str
    category: str
    approved: bool = False
    alias_of: AliasTarget | None = None


@dataclass(frozen=True)
class BookBible:
    """Whole-book context from the pre-scan, reviewed by the user: one overview
    of the storyline, the main characters and how they relate, and the tone."""

    overview: str = ""

    @property
    def empty(self) -> bool:
        return not self.overview.strip()


@dataclass(frozen=True)
class ExtractedTerm:
    """A new term found by the extraction call, POSTed to the BFF glossary callback."""

    english: str
    translation: str
    category: str


@dataclass(frozen=True)
class ContextSegment:
    """A preceding paragraph shown to the model for context; never re-translated."""

    source: str
    translation: str | None = None


@dataclass
class Usage:
    """Running token / call counters, read by evals for cost reporting."""

    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0


class TranslatorError(Exception):
    """A provider call failed or returned unusable output."""


class ProviderError(TranslatorError):
    """The LLM API call itself failed (HTTP error, timeout, malformed body).

    `retryable` is True for rate limits, 5xx and timeouts; False for auth and
    other client errors, where retrying only burns the user's quota.
    """

    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


class LLMClient(Protocol):
    """One chat-completion round trip. Implementations live in harness/providers/."""

    usage: Usage

    def complete(self, system: str, user: str, *, json_mode: bool = False) -> str: ...


@dataclass
class ReviewStats:
    """Review-loop counters for a run, read by evals ("审校效果")."""

    flagged: int = 0  # segments with an error on first review
    fixed: int = 0  # of those, how many passed after revision
    revisions: int = 0  # revise calls made


@dataclass
class SegmentsResult:
    """Output of `translate_segments`: one slot per input segment, None = failed."""

    translations: list[str | None] = field(default_factory=list)
    # True when a provider failure stopped the run early; the remaining
    # segments were never attempted.
    aborted: bool = False
    # Issues still open after review, by segment position (empty when review is off).
    issues: dict[int, list[Issue]] = field(default_factory=dict)
    # Positions the LLM reviewer actually looked at.
    reviewed: set[int] = field(default_factory=set)
    review: ReviewStats = field(default_factory=ReviewStats)

    @property
    def failed(self) -> list[int]:
        return [i for i, t in enumerate(self.translations) if t is None]


def validate_langs(source_lang: str, target_lang: str) -> None:
    """Reject unknown languages before any provider call is made."""
    if source_lang not in ALLOWED_SOURCE_LANGS:
        raise ValueError(f"Unsupported source_lang: {source_lang!r}")
    if target_lang not in ALLOWED_TARGET_LANGS:
        raise ValueError(f"Unsupported target_lang: {target_lang!r}")
