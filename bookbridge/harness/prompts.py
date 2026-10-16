"""Prompt builders for segment translation and term extraction.

Every context component is rendered by its own helper and is skipped
entirely when its TranslationConfig switch is off — tests assert the
heading is absent, which is what keeps the eval ablations honest.
"""

from __future__ import annotations

from collections.abc import Sequence

from bookbridge.harness.config import TranslationConfig
from bookbridge.harness.matching import GlossaryMatch, match_glossary
from bookbridge.harness.models import ContextSegment, GlossaryEntry
from bookbridge.harness.parsing import format_segments, marker

# Same budget as v1 (~2000 tokens); only the "full" baseline can reach it.
MAX_GLOSSARY_TERMS = 200

GLOSSARY_HEADING = "## Glossary"
CONTEXT_HEADING = "## Preceding text (context only — do not translate)"
SEGMENTS_HEADING = "## Segments to translate"


def select_glossary(
    glossary: Sequence[GlossaryEntry], batch_text: str, config: TranslationConfig
) -> list[GlossaryMatch]:
    """Pick the terms to inject for one batch, approved first, then longest first."""
    if config.glossary_mode == "matched":
        picked = match_glossary(glossary, batch_text)
    else:
        picked = [GlossaryMatch(entry=g) for g in glossary]
    picked.sort(key=lambda m: (not m.entry.approved, -len(m.entry.english)))
    return picked[:MAX_GLOSSARY_TERMS]


def _term_line(m: GlossaryMatch) -> str:
    line = f"- {m.entry.english} → {m.entry.translation} ({m.entry.category})"
    if m.aliases:
        line += f"; in this text also called: {', '.join(m.aliases)}"
    return line


def render_glossary(matches: Sequence[GlossaryMatch]) -> str:
    if not matches:
        return ""
    lines = [GLOSSARY_HEADING]
    approved = [_term_line(m) for m in matches if m.entry.approved]
    suggested = [_term_line(m) for m in matches if not m.entry.approved]
    if approved:
        lines += ["", "Approved — use these translations verbatim:", *approved]
    if suggested:
        lines += ["", "Suggested — follow unless context clearly overrides:", *suggested]
    lines += [
        "",
        "An alias refers to the listed entity: use it to know who/what is meant, "
        "but translate the alias itself — never replace it with the main name.",
    ]
    return "\n".join(lines)


def render_context(preceding: Sequence[ContextSegment], window: int) -> str:
    if window <= 0 or not preceding:
        return ""
    lines = [CONTEXT_HEADING]
    for seg in preceding[-window:]:
        lines += ["", f"[source] {seg.source}"]
        if seg.translation:
            lines.append(f"[translation] {seg.translation}")
    return "\n".join(lines)


def _system_prompt(source_lang: str, target_lang: str, count: int, glossary: str) -> str:
    parts = [
        f"You are a literary translator. Translate from {source_lang} to {target_lang}.",
        f"Target language: {target_lang}",
        f"The input has {count} segment(s), each introduced by a marker line such as "
        f"{marker(1)}. Translate every segment faithfully and completely.",
        f"Output exactly {count} segment(s): each marker line on its own, followed by "
        "the translation of that segment. Keep the markers and their order; never "
        "merge, split, skip or add segments. Output nothing else.",
    ]
    if glossary:
        parts += ["", glossary]
    return "\n".join(parts)


def build_translation_prompt(
    batch: Sequence[str],
    *,
    source_lang: str,
    target_lang: str,
    glossary: Sequence[GlossaryEntry],
    preceding: Sequence[ContextSegment],
    config: TranslationConfig,
) -> tuple[str, str]:
    """Return (system, user) messages for translating one batch."""
    matches = select_glossary(glossary, "\n".join(batch), config)
    system = _system_prompt(source_lang, target_lang, len(batch), render_glossary(matches))
    context = render_context(preceding, config.context_window)
    user_parts = [context, ""] if context else []
    user_parts += [SEGMENTS_HEADING, format_segments(batch)]
    return system, "\n".join(user_parts)


def build_extraction_prompt(
    pairs: Sequence[tuple[str, str]], *, target_lang: str, known_terms: Sequence[str]
) -> tuple[str, str]:
    """Return (system, user) messages asking for new proper nouns / terms as JSON."""
    system = "\n".join(
        [
            "You build a translation glossary from source/translation pairs.",
            f"Target language: {target_lang}",
            "List proper nouns (people, places, organizations) and recurring technical "
            "terms that appear in the source, with the translation actually used in "
            "the translation text. Skip anything in the known-terms list.",
            'Return only JSON: {"terms": [{"english": str, "translation": str, '
            '"category": "person"|"place"|"organization"|"technical"|"general"}]}. '
            'Return {"terms": []} if there are none.',
        ]
    )
    known = ", ".join(known_terms) if known_terms else "(none)"
    body = "\n\n".join(
        f"{marker(i)}\n[source] {src}\n[translation] {tgt}"
        for i, (src, tgt) in enumerate(pairs, start=1)
    )
    return system, f"Known terms: {known}\n\n{body}"
