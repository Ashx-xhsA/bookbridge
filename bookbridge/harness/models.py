"""Shared harness types: glossary entries, context segments, the LLM client contract."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

ALLOWED_SOURCE_LANGS: frozenset[str] = frozenset({"en"})
ALLOWED_TARGET_LANGS: frozenset[str] = frozenset(
    {"zh-Hans", "zh-Hant", "es", "fr", "ja", "ko", "de"}
)
TERM_CATEGORIES: frozenset[str] = frozenset(
    {"person", "place", "organization", "technical", "general"}
)


@dataclass(frozen=True)
class GlossaryEntry:
    """A term the BFF passes in before translation.

    `approved` terms MUST be followed verbatim; unapproved ones are strong
    suggestions. `aliases` are other surface forms of the same entity (e.g.
    "Mithrandir" for Gandalf) — matching one injects the term so the model
    knows who is meant, but the alias itself is never replaced in the output.
    """

    english: str
    translation: str
    category: str
    approved: bool = False
    aliases: tuple[str, ...] = ()


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


class LLMClient(Protocol):
    """One chat-completion round trip. Implementations live in harness/providers/."""

    usage: Usage

    def complete(self, system: str, user: str, *, json_mode: bool = False) -> str: ...


@dataclass
class SegmentsResult:
    """Output of `translate_segments`: one slot per input segment, None = failed."""

    translations: list[str | None] = field(default_factory=list)

    @property
    def failed(self) -> list[int]:
        return [i for i, t in enumerate(self.translations) if t is None]


def validate_langs(source_lang: str, target_lang: str) -> None:
    """Reject unknown languages before any provider call is made."""
    if source_lang not in ALLOWED_SOURCE_LANGS:
        raise ValueError(f"Unsupported source_lang: {source_lang!r}")
    if target_lang not in ALLOWED_TARGET_LANGS:
        raise ValueError(f"Unsupported target_lang: {target_lang!r}")
