"""Segment-level translation pipeline and the separate term-extraction pass.

translate_segments: batches paragraphs under a char budget, translates each
batch with the marker protocol, and keeps a rolling window of what was just
translated. Two kinds of failure are handled differently:
- output that doesn't line up (SegmentAlignmentError): the batch is split in
  half and retried; a single segment gets one retry, then is marked failed
  (None) instead of failing the whole chapter;
- the API call itself failing: retried only if transient (see retry.py),
  otherwise the run stops at once and returns what was finished, marked
  `aborted` — splitting would multiply the failing requests.
When `config.review_max_retries` > 0 each batch is then reviewed and its
flagged segments revised (see review.py) before progress is reported, so the
rolling window and the caller only ever see the final text.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from bookbridge.harness.batching import plan_batches
from bookbridge.harness.config import TranslationConfig
from bookbridge.harness.matching import match_glossary, occurs
from bookbridge.harness.models import (
    BookBible,
    ContextSegment,
    ExtractedTerm,
    GlossaryEntry,
    LLMClient,
    ReviewStats,
    SegmentsResult,
    TranslatorError,
    validate_langs,
)
from bookbridge.harness.parsing import SegmentAlignmentError, parse_segments, parse_terms
from bookbridge.harness.prompts import build_extraction_prompt, build_translation_prompt
from bookbridge.harness.proper_nouns import GLOSSARY_CATEGORIES, is_proper_noun
from bookbridge.harness.retry import complete_with_retry
from bookbridge.harness.review import ReviewContext, review_batch
from bookbridge.quality import Issue

logger = logging.getLogger(__name__)

SINGLE_SEGMENT_ATTEMPTS = 2
EXTRACTION_MAX_CHARS = 12000


@dataclass(frozen=True)
class SegmentOutcome:
    """One finished segment as reported to `on_progress`."""

    index: int
    translation: str
    reviewed: bool = False
    issues: list[Issue] = field(default_factory=list)


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
    issues: dict[int, list[Issue]] = field(default_factory=dict)
    reviewed: set[int] = field(default_factory=set)
    stats: ReviewStats = field(default_factory=ReviewStats)


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
    on_progress: Callable[[list[SegmentOutcome]], None] | None = None,
) -> SegmentsResult:
    """Translate `segments` in order; failed segments come back as None.

    `on_progress` receives the segments finished (and reviewed) by each
    top-level batch, so callers can persist results as they arrive.
    """
    validate_langs(source_lang, target_lang)
    cfg = config or TranslationConfig()
    run = _Run(
        client, segments, source_lang, target_lang, glossary, cfg, bible,
        history=list(preceding), out=[None] * len(segments),
    )  # fmt: skip
    for batch in plan_batches(segments, cfg.max_batch_chars):
        window_start = len(run.history)
        try:
            _translate_range(run, batch)
        except TranslatorError as exc:  # provider failure: stop, keep what is done
            logger.warning("translation stopped at segment %d: %s", batch.start, type(exc).__name__)
            return _result(run, aborted=True)
        if cfg.review_max_retries:
            _review(run, batch, window_start)
        if on_progress:
            done = [_outcome(run, i) for i in batch if run.out[i] is not None]
            if done:
                on_progress(done)
    return _result(run)


def _result(run: _Run, *, aborted: bool = False) -> SegmentsResult:
    return SegmentsResult(
        translations=run.out, aborted=aborted,
        issues=run.issues, reviewed=run.reviewed, review=run.stats,
    )  # fmt: skip


def _outcome(run: _Run, i: int) -> SegmentOutcome:
    text = run.out[i]
    assert text is not None
    return SegmentOutcome(i, text, i in run.reviewed, run.issues.get(i, []))


def _review(run: _Run, batch: range, window_start: int) -> None:
    """Review the batch's translated segments; write back revisions and issues."""
    done = [i for i in batch if run.out[i] is not None]
    if not done:
        return
    ctx = ReviewContext(
        run.client, run.source_lang, run.target_lang, run.glossary, run.config,
        run.bible, preceding=run.history[:window_start],
    )  # fmt: skip
    rv = review_batch(ctx, [run.segments[i] for i in done], [run.out[i] or "" for i in done])
    for i, text, issues in zip(done, rv.translations, rv.issues, strict=True):
        run.out[i] = text
        run.history[window_start + i - batch.start] = ContextSegment(run.segments[i], text)
        if issues:
            run.issues[i] = issues
        if rv.reviewed:
            run.reviewed.add(i)
    run.stats.flagged += rv.flagged
    run.stats.fixed += rv.fixed
    run.stats.revisions += rv.revisions


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
        content = complete_with_retry(run.client, system, user)  # provider errors propagate
        try:
            return parse_segments(content, expected=len(batch))
        except SegmentAlignmentError:
            logger.warning(
                "segments %d-%d misaligned (attempt %d)", idx.start, idx.stop - 1, attempt
            )
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
    Only proper nouns written that way in the chunk's source are kept.
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
            content = complete_with_retry(client, system, user, json_mode=True)
        except TranslatorError as exc:
            logger.warning("term extraction chunk failed: %s", type(exc).__name__)
            continue
        new = [
            t for t in parse_terms(content, existing=seen)
            if t.category in GLOSSARY_CATEGORIES
            and is_proper_noun(t.english)
            and occurs(t.english, source_text)
        ]  # fmt: skip
        seen += [t.english for t in new]
        found += new
    return found
