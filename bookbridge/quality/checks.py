"""Deterministic per-segment checks run before the LLM reviewer (Phase 4a).

Each check looks at one source paragraph and its translation:
- term: a glossary term (or alias) in the source must appear with its fixed
  translation; only terms that actually occur in the source are checked
- alias_replaced: the source uses an alias but the translation swapped in the
  main name (faithfulness rule from the book bible)
- truncation: translation far shorter than the source for its language
- untranslated: the source was copied through, or (Chinese) English sentences
  were left in
plus the language-specific checkers (e.g. Chinese half-width punctuation).
"""

from __future__ import annotations

from collections.abc import Sequence

from bookbridge.harness.matching import match_glossary, occurs
from bookbridge.harness.models import GlossaryEntry
from bookbridge.quality.base import BaseQualityChecker
from bookbridge.quality.models import Issue
from bookbridge.quality.zh_hans import ChineseSimplifiedChecker

# Below this many source characters the length ratio is too noisy to judge.
MIN_RATIO_SOURCE_CHARS = 80
# Translation/source character ratio under which a segment looks truncated.
# CJK text is roughly a third the length of English; European languages are
# about as long or longer.
_MIN_RATIO = {"zh-Hans": 0.15, "zh-Hant": 0.15, "ja": 0.2, "ko": 0.2}
DEFAULT_MIN_RATIO = 0.4

_ZH = ChineseSimplifiedChecker()
LANGUAGE_CHECKERS: dict[str, BaseQualityChecker] = {"zh-Hans": _ZH, "zh-Hant": _ZH}


def check_segment(
    source: str, translation: str, *, target_lang: str, glossary: Sequence[GlossaryEntry]
) -> list[Issue]:
    """Return every rule issue for one segment; empty means it passed."""
    if translation.strip() == source.strip():
        return [Issue("untranslated", "Translation is a copy of the source text", "error")]
    issues = _check_terms(source, translation, glossary)
    issues += _check_length(source, translation, target_lang)
    checker = LANGUAGE_CHECKERS.get(target_lang)
    if checker:
        issues += checker.check_language_specific(translation)
    return issues


def _check_terms(source: str, translation: str, glossary: Sequence[GlossaryEntry]) -> list[Issue]:
    issues: list[Issue] = []
    for g in match_glossary(glossary, source):
        if g.translation in translation:
            continue
        main = g.alias_of
        if main and main.translation in translation and not occurs(main.english, source):
            message = (
                f"'{g.english}' should stay '{g.translation}', "
                f"not be replaced by the main name '{main.translation}'"
            )
            issues.append(Issue("alias_replaced", message, "error"))
        else:
            message = f"'{g.english}' should be translated as '{g.translation}'"
            issues.append(Issue("term", message, "error"))
    return issues


def min_ratio(target_lang: str) -> float:
    """Translation/source length ratio under which a segment looks cut short."""
    return _MIN_RATIO.get(target_lang, DEFAULT_MIN_RATIO)


def _check_length(source: str, translation: str, target_lang: str) -> list[Issue]:
    src = len(source.strip())
    if src < MIN_RATIO_SOURCE_CHARS:
        return []
    ratio = len(translation.strip()) / src
    if ratio >= min_ratio(target_lang):
        return []
    return [Issue("truncation", f"Translation looks cut short (length ratio {ratio:.2f})", "error")]
