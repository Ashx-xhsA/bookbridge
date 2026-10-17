"""Review and revise one translated batch (Phase 4c).

Each segment gets the deterministic rule checks (`quality.check_segment`) and
the batch gets one LLM reviewer call that sees the rule findings. Segments
with an error are sent back — only those — for revision, then rechecked, up to
`config.review_max_retries` times. Nothing here can lose a translation: a
failed review or revision keeps the text it had.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass, field

from bookbridge.harness.config import TranslationConfig
from bookbridge.harness.models import (
    BookBible,
    ContextSegment,
    GlossaryEntry,
    LLMClient,
    TranslatorError,
)
from bookbridge.harness.parsing import parse_review, parse_segments
from bookbridge.harness.prompts import build_review_prompt, build_revision_prompt
from bookbridge.harness.retry import complete_with_retry
from bookbridge.quality import Issue, check_segment, has_errors

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReviewContext:
    """What the translator saw for this batch; the reviewer sees the same."""

    client: LLMClient
    source_lang: str
    target_lang: str
    glossary: Sequence[GlossaryEntry]
    config: TranslationConfig
    bible: BookBible | None
    preceding: Sequence[ContextSegment]


@dataclass
class BatchReview:
    sources: Sequence[str]
    translations: list[str]
    issues: list[list[Issue]] = field(default_factory=list)
    reviewed: bool = False
    flagged: int = 0
    fixed: int = 0
    revisions: int = 0


def review_batch(
    ctx: ReviewContext, sources: Sequence[str], translations: Sequence[str]
) -> BatchReview:
    """Review, then revise segments with errors; returns final texts and open issues."""
    out = BatchReview(sources, list(translations))
    everything = list(range(len(sources)))
    out.issues = [_rules(ctx, out, i) for i in everything]
    try:
        _add_llm_issues(ctx, out, everything)
    except TranslatorError as exc:
        logger.warning("review call failed: %s", type(exc).__name__)
        return out
    out.reviewed = True
    pending = [i for i in everything if has_errors(out.issues[i])]
    out.flagged = len(pending)
    for _ in range(ctx.config.review_max_retries):
        if not pending or not _revise(ctx, out, pending):
            break
        pending = _recheck(ctx, out, pending)
    out.fixed = out.flagged - len(pending)
    return out


def _rules(ctx: ReviewContext, out: BatchReview, i: int) -> list[Issue]:
    return check_segment(
        out.sources[i], out.translations[i], target_lang=ctx.target_lang, glossary=ctx.glossary
    )


def _add_llm_issues(ctx: ReviewContext, out: BatchReview, idx: list[int]) -> None:
    """One reviewer call over `idx`; its findings are appended to the rule issues."""
    system, user = build_review_prompt(
        [(out.sources[i], out.translations[i]) for i in idx],
        source_lang=ctx.source_lang,
        target_lang=ctx.target_lang,
        glossary=ctx.glossary,
        preceding=ctx.preceding,
        config=ctx.config,
        bible=ctx.bible,
        rule_issues={k: out.issues[i] for k, i in enumerate(idx)},
    )
    content = complete_with_retry(ctx.client, system, user, json_mode=True)
    for k, found in parse_review(content, expected=len(idx)).items():
        out.issues[idx[k]] = out.issues[idx[k]] + found


def _revise(ctx: ReviewContext, out: BatchReview, idx: list[int]) -> bool:
    """Rewrite the flagged segments in one call; False (texts unchanged) on failure."""
    system, user = build_revision_prompt(
        [(out.sources[i], out.translations[i], out.issues[i]) for i in idx],
        source_lang=ctx.source_lang,
        target_lang=ctx.target_lang,
        glossary=ctx.glossary,
        preceding=ctx.preceding,
        config=ctx.config,
        bible=ctx.bible,
    )
    try:
        revised = parse_segments(complete_with_retry(ctx.client, system, user), len(idx))
    except TranslatorError as exc:
        logger.warning("revision of %d segment(s) failed: %s", len(idx), type(exc).__name__)
        return False
    out.revisions += 1
    for i, text in zip(idx, revised, strict=True):
        out.translations[i] = text
    return True


def _recheck(ctx: ReviewContext, out: BatchReview, idx: list[int]) -> list[int]:
    """Re-run rules and the reviewer on revised segments; return those still failing."""
    for i in idx:
        out.issues[i] = _rules(ctx, out, i)
    try:
        _add_llm_issues(ctx, out, idx)
    except TranslatorError as exc:  # rule findings alone decide this round
        logger.warning("re-review call failed: %s", type(exc).__name__)
    return [i for i in idx if has_errors(out.issues[i])]
