"""Mock translator — zero-network echo with deterministic extraction, for dev and CI."""

from __future__ import annotations

import re

from bookbridge.harness.translator import (
    ExtractedTerm,
    GlossaryEntry,
    TranslateResult,
    Translator,
    validate_input,
)

# Matches likely proper nouns: capitalised word, at least 3 chars so we don't
# grab sentence-initial "I" or short abbreviations like "IT". Deterministic
# so tests and demos see the same terms come out every time.
_TERM_PATTERN = re.compile(r"\b[A-Z][a-z]{2,}\b")


class MockTranslator(Translator):
    """Returns source tagged with target lang, plus fixture new_terms.

    Extracts capitalised words as candidate terms — a toy heuristic that
    mimics the structured output a real LLM provider produces. Echoes a
    [glossary:N] marker into the text when a glossary is passed so tests
    can observe the injection wiring end-to-end without a live provider.
    """

    def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        glossary: list[GlossaryEntry] | None = None,
    ) -> TranslateResult:
        validate_input(text, source_lang, target_lang)

        existing_lower = {g.english.lower() for g in glossary or []}
        seen: set[str] = set()
        new_terms: list[ExtractedTerm] = []
        for match in _TERM_PATTERN.findall(text):
            key = match.lower()
            if key in existing_lower or key in seen:
                continue
            seen.add(key)
            new_terms.append(
                ExtractedTerm(
                    english=match,
                    translation=f"[{target_lang}] {match}",
                    category="general",
                )
            )

        glossary_marker = f" [glossary:{len(glossary)}]" if glossary else ""
        return TranslateResult(
            text=f"[{target_lang}] {text}{glossary_marker}",
            new_terms=new_terms,
        )
