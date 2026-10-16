"""Segment-level translation pipeline and the separate term-extraction pass.

translate_segments: batches paragraphs under a char budget, translates each
batch with the marker protocol, and keeps a rolling window of what was just
translated. A batch whose output doesn't line up is split in half and
retried; a single segment gets one retry and is then marked failed (None)
instead of failing the whole chapter.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass

from bookbridge.harness.batching import plan_batches
from bookbridge.harness.config import TranslationConfig
from bookbridge.harness.matching import match_glossary
from bookbridge.harness.models import (
    BookBible,
    ContextSegment,
    ExtractedTerm,
    GlossaryEntry,
    LLMClient,
    SegmentsResult,
    TranslatorError,
    validate_langs,
)
from bookbridge.harness.parsing import parse_segments, parse_terms
from bookbridge.harness.prompts import build_extraction_prompt, build_translation_prompt

logger = logging.getLogger(__name__)

SINGLE_SEGMENT_ATTEMPTS = 2
EXTRACTION_MAX_CHARS = 12000


@dataclass
class _Run:
    client: LLMClient
    segments: Sequence[str]
    source_lang: str
    target_lang: str
    glossary: Sequence[GlossaryEntry]
    config: TranslationConfig
    bible: BookBible | None
    history: list[ContextSegment]
    out: list[str | None]


def translate_segments(
    client: LLMClient,
    segments: Sequence[str],
    *,
    target_lang: str,
    source_lang: str = "en",
    glossary: Sequence[GlossaryEntry] = (),
    preceding: Sequence[ContextSegment] = (),
    config: TranslationConfig | None = None,
    bible: BookBible | None = None,
) -> SegmentsResult:
    """Translate `segments` in order; failed segments come back as None."""
    validate_langs(source_lang, target_lang)
    cfg = config or TranslationConfig()
    run = _Run(
        client, segments, source_lang, target_lang, glossary, cfg, bible,
        history=list(preceding), out=[None] * len(segments),
    )  # fmt: skip
    for batch in plan_batches(segments, cfg.max_batch_chars):
        _translate_range(run, batch)
    return SegmentsResult(translations=run.out)


def _translate_range(run: _Run, idx: range) -> None:
    attempts = 1 if len(idx) > 1 else SINGLE_SEGMENT_ATTEMPTS
    texts = _attempt(run, idx, attempts)
    if texts is None and len(idx) > 1:
        mid = idx.start + len(idx) // 2
        _translate_range(run, range(idx.start, mid))
        _translate_range(run, range(mid, idx.stop))
        return
    for i, text in zip(idx, texts or [None], strict=True):
        run.out[i] = text
        run.history.append(ContextSegment(source=run.segments[i], translation=text))


def _attempt(run: _Run, idx: range, attempts: int) -> list[str] | None:
    batch = [run.segments[i] for i in idx]
    system, user = build_translation_prompt(
        batch,
        source_lang=run.source_lang,
        target_lang=run.target_lang,
        glossary=run.glossary,
        preceding=run.history,
        config=run.config,
        bible=run.bible,
    )
    for attempt in range(1, attempts + 1):
        try:
            return parse_segments(run.client.complete(system, user), expected=len(batch))
        except TranslatorError as exc:
            logger.warning(
                "segments %d-%d attempt %d failed: %s",
                idx.start, idx.stop - 1, attempt, type(exc).__name__,
            )  # fmt: skip
    return None


def extract_terms(
    client: LLMClient,
    pairs: Sequence[tuple[str, str]],
    *,
    target_lang: str,
    glossary: Sequence[GlossaryEntry] = (),
    max_chars: int = EXTRACTION_MAX_CHARS,
) -> list[ExtractedTerm]:
    """Find new terms in translated pairs with dedicated JSON calls.

    Only glossary entries that occur in a chunk are listed as "known" in its
    prompt (keeps the prompt small); dedup still runs against the whole glossary.
    """
    seen = [g.english for g in glossary]
    found: list[ExtractedTerm] = []
    for chunk in plan_batches([src + tgt for src, tgt in pairs], max_chars):
        chunk_pairs = [pairs[i] for i in chunk]
        source_text = "\n".join(src for src, _ in chunk_pairs)
        known = [g.english for g in match_glossary(glossary, source_text)]
        system, user = build_extraction_prompt(
            chunk_pairs, target_lang=target_lang, known_terms=known
        )
        try:
            content = client.complete(system, user, json_mode=True)
        except TranslatorError as exc:
            logger.warning("term extraction chunk failed: %s", type(exc).__name__)
            continue
        new = parse_terms(content, existing=seen)
        seen += [t.english for t in new]
        found += new
    return found
