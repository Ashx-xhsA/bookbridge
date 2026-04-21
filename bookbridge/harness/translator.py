"""Translator protocol, shared dataclasses, and input validation for harness providers."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

MAX_SOURCE_BYTES: int = 200 * 1024  # 200 KB — bounded to prevent DoS on providers

ALLOWED_SOURCE_LANGS: frozenset[str] = frozenset({"en"})
ALLOWED_TARGET_LANGS: frozenset[str] = frozenset(
    {"zh-Hans", "zh-Hant", "es", "fr", "ja", "ko", "de"}
)

# Hard cap on glossary size that reaches the LLM prompt. Extra terms are
# dropped after sorting by priority (approved > user-edited > long). Chosen
# roughly as ~2000 tokens at 4 chars/token — large enough for normal books,
# small enough to keep the system prompt bounded.
MAX_GLOSSARY_TERMS: int = 200


@dataclass(frozen=True)
class ExtractedTerm:
    """A term the provider identified in the source text during translation.

    Posted to the BFF callback after each chunk. The BFF dedup-inserts by
    (projectId, lower(english)) and ignores rows that already exist.
    """

    english: str
    translation: str
    category: str  # person | place | organization | technical | general


@dataclass(frozen=True)
class GlossaryEntry:
    """A term the BFF passes to the provider before translation.

    `approved` is rendered into the prompt as priority metadata — approved
    terms MUST be followed verbatim; unapproved terms are strong suggestions.
    """

    english: str
    translation: str
    category: str
    approved: bool


@dataclass
class TranslateResult:
    """Return shape of `Translator.translate()`.

    `new_terms` carries terms the provider extracted from the source chunk
    that were not already in the passed-in glossary (providers should dedupe
    against the input glossary, but the BFF dedupes again as a safety net).
    """

    text: str
    new_terms: list[ExtractedTerm] = field(default_factory=list)


class TranslatorError(Exception):
    """Raised by providers when translation fails for a non-validation reason."""


class Translator(Protocol):
    """Pluggable translator contract. Implementations live in harness/providers/."""

    def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        glossary: list[GlossaryEntry] | None = None,
    ) -> TranslateResult: ...


def validate_input(text: str, source_lang: str, target_lang: str) -> None:
    """Reject empty, oversized, or unknown-language inputs before calling a provider.

    Centralised so every provider enforces the same rules, including MyMemory which
    builds the values into a URL and must reject unsafe content before issuing the
    request (A10 / SSRF-adjacent: don't forward attacker-controlled query params).
    """
    if not text:
        raise ValueError("Empty source_text")
    if len(text.encode("utf-8")) > MAX_SOURCE_BYTES:
        raise ValueError(f"source_text size exceeds maximum of {MAX_SOURCE_BYTES} bytes")
    if source_lang not in ALLOWED_SOURCE_LANGS:
        raise ValueError(f"Unsupported source_lang: {source_lang!r}")
    if target_lang not in ALLOWED_TARGET_LANGS:
        raise ValueError(f"Unsupported target_lang: {target_lang!r}")


def render_glossary_prompt_section(glossary: list[GlossaryEntry] | None) -> str:
    """Render a glossary list into a prompt-ready Markdown section.

    Returns an empty string if the glossary is empty or None so callers can
    unconditionally concatenate the result. Truncates at `MAX_GLOSSARY_TERMS`
    sorted by (approved desc, length desc) so the highest-signal terms win
    when the prompt budget is tight.
    """
    if not glossary:
        return ""

    ordered = sorted(
        glossary,
        key=lambda g: (not g.approved, -len(g.english)),
    )[:MAX_GLOSSARY_TERMS]

    approved = [g for g in ordered if g.approved]
    suggested = [g for g in ordered if not g.approved]

    lines = ["## Glossary (must follow)"]
    if approved:
        lines.append("")
        lines.append("Approved — use these translations verbatim:")
        for g in approved:
            lines.append(f"- {g.english} → {g.translation} ({g.category})")
    if suggested:
        lines.append("")
        lines.append("Suggested — follow unless context clearly overrides:")
        for g in suggested:
            lines.append(f"- {g.english} → {g.translation} ({g.category})")
    return "\n".join(lines)
