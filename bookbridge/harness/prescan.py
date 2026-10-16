"""Book pre-scan: build a draft book bible before any chapter is translated.

1. Split the whole book into passages and ask, per passage, for the named
   entities (with aliases, each alias carrying its own translation).
2. Merge deterministically (rules found in the first real-model run, where a
   shared surname fused Gregor Samsa with his father):
   - entries with the same main name are one entity; the first seen wins;
   - a *capitalised* alias equal to another entity's main name folds that
     entity in ("Georg" ⊂ "Georg Bendemann");
   - an alias claimed by two entities ("Mr. Samsa"), or a lowercase alias
     naming another entity ("father"), is ambiguous and dropped;
   - lowercase common nouns ("the sofa", "office") are dropped unless they
     are people ("head clerk") or technical terms ("mithril").
3. Count mentions (paragraphs naming the entity or an alias) with the same
   matcher the translator uses, and sort by it.
4. One call writes voice cards for the most-mentioned people, from dialogue
   samples; one call writes a style guide from passages at the start, middle
   and end of the book.

A single failed passage, voice or style call is skipped — a partial bible
is still useful and the user reviews it. But a non-retryable provider error
(bad key) stops the scan at once, and a scan where every passage failed
raises: an empty "successful" bible would hide the problem.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass, field, replace

from bookbridge.harness.batching import plan_batches
from bookbridge.harness.matching import occurs
from bookbridge.harness.models import AliasTarget, LLMClient, ProviderError, TranslatorError
from bookbridge.harness.parsing import parse_entities, parse_voices
from bookbridge.harness.prompts import (
    build_scan_prompt,
    build_style_prompt,
    build_voice_prompt,
)
from bookbridge.harness.retry import complete_with_retry

logger = logging.getLogger(__name__)

SCAN_CHUNK_CHARS = 12000
MAX_VOICE_CARDS = 12
VOICE_SAMPLES = 3
SAMPLE_CHARS = 500
STYLE_WINDOW_CHARS = 1500
_QUOTES = ('"', "“", "‘", "「")


@dataclass(frozen=True)
class ScannedEntity:
    english: str
    translation: str
    category: str
    gender: str | None = None
    notes: str | None = None
    aliases: tuple[AliasTarget, ...] = ()
    mentions: int = 0
    voice: str | None = None

    @property
    def names(self) -> tuple[str, ...]:
        return (self.english, *(a.english for a in self.aliases))


@dataclass
class ScanResult:
    style_guide: str = ""
    entities: list[ScannedEntity] = field(default_factory=list)


def scan_book(
    client: LLMClient,
    chapters: Sequence[Sequence[str]],
    *,
    target_lang: str,
    max_chunk_chars: int = SCAN_CHUNK_CHARS,
    max_voice_cards: int = MAX_VOICE_CARDS,
) -> ScanResult:
    """Scan `chapters` (lists of paragraphs) and return a draft bible."""
    paragraphs = [p for chapter in chapters for p in chapter if p.strip()]
    if not paragraphs:
        return ScanResult()
    raw: list[dict] = []
    chunks = plan_batches(paragraphs, max_chunk_chars)
    failures = 0
    for chunk in chunks:
        found = _scan_passage(client, "\n\n".join(paragraphs[i] for i in chunk), target_lang)
        failures += found is None
        raw += found or []
    if failures == len(chunks):
        raise TranslatorError("Bible scan failed: every passage call failed")
    text = _Text.of(paragraphs)
    entities = _count_mentions(_merge(raw), text)
    entities = _add_voices(client, entities, text, target_lang, max_voice_cards)
    return ScanResult(style_guide=_style_guide(client, paragraphs, target_lang), entities=entities)


def _scan_passage(client: LLMClient, passage: str, target_lang: str) -> list[dict] | None:
    """Entities in one passage; None when the call failed (and may be skipped)."""
    system, user = build_scan_prompt(passage, target_lang=target_lang)
    try:
        return parse_entities(complete_with_retry(client, system, user, json_mode=True))
    except ProviderError as exc:
        if not exc.retryable:
            raise  # e.g. a bad key: every other passage would fail the same way
        logger.warning("pre-scan passage failed after retries")
        return None
    except TranslatorError as exc:
        logger.warning("pre-scan passage failed: %s", type(exc).__name__)
        return None


def _capitalised(name: str) -> bool:
    return any(ch.isupper() for ch in name)


def _merge(raw: list[dict]) -> list[ScannedEntity]:
    groups = _drop_ambiguous_aliases(_fold_named_aliases(_group_by_name(raw)))
    return [g for g in groups if g.category in ("person", "technical") or _capitalised(g.english)]


def _group_by_name(raw: list[dict]) -> list[ScannedEntity]:
    groups: dict[str, ScannedEntity] = {}
    for item in raw:
        entity = ScannedEntity(
            english=item["name"], translation=item["translation"], category=item["category"],
            gender=item["gender"], notes=item["notes"],
            aliases=tuple(AliasTarget(n, t) for n, t in item["aliases"]),
        )  # fmt: skip
        key = entity.english.lower()
        base = groups.get(key, replace(entity, aliases=()))
        groups[key] = _fold(base, entity, as_alias=False)
    return list(groups.values())


def _fold(target: ScannedEntity, other: ScannedEntity, *, as_alias: bool) -> ScannedEntity:
    """Absorb `other` into `target`: its aliases (and, if `as_alias`, its name)."""
    named = (AliasTarget(other.english, other.translation),) if as_alias else ()
    known = {n.lower() for n in target.names}
    extra = []
    for alias in named + other.aliases:
        if alias.english.lower() not in known:
            known.add(alias.english.lower())
            extra.append(alias)
    return replace(
        target,
        aliases=target.aliases + tuple(extra),
        gender=target.gender or other.gender,
        notes=target.notes or other.notes,
    )


def _fold_named_aliases(groups: list[ScannedEntity]) -> list[ScannedEntity]:
    """Fold entities linked by a capitalised alias into the earliest of them."""
    root = list(range(len(groups)))

    def find(i: int) -> int:
        while root[i] != i:
            i = root[i]
        return i

    by_main = {g.english.lower(): i for i, g in enumerate(groups)}
    for i, g in enumerate(groups):
        for alias in g.aliases:
            j = by_main.get(alias.english.lower())
            if j is not None and _capitalised(alias.english):
                a, b = sorted((find(i), find(j)))
                root[b] = a
    merged: dict[int, ScannedEntity] = {}
    for i, g in enumerate(groups):
        r = find(i)
        merged[r] = g if r == i else _fold(merged[r], g, as_alias=True)
    return list(merged.values())


def _drop_ambiguous_aliases(groups: list[ScannedEntity]) -> list[ScannedEntity]:
    mains = {g.english.lower() for g in groups}
    claims: dict[str, int] = {}
    for g in groups:
        for key in {a.english.lower() for a in g.aliases}:
            claims[key] = claims.get(key, 0) + 1
    return [
        replace(g, aliases=tuple(
            a for a in g.aliases
            if claims[a.english.lower()] == 1 and a.english.lower() not in mains
        ))
        for g in groups
    ]  # fmt: skip


@dataclass(frozen=True)
class _Text:
    """Paragraphs plus their lowercased copies, so matching lowercases once."""

    paragraphs: Sequence[str]
    lowered: tuple[str, ...]

    @classmethod
    def of(cls, paragraphs: Sequence[str]) -> _Text:
        return cls(paragraphs, tuple(p.lower() for p in paragraphs))


def _mentioning(entity: ScannedEntity, text: _Text) -> list[str]:
    return [
        p for p, low in zip(text.paragraphs, text.lowered, strict=True)
        if any(occurs(n, p, low) for n in entity.names)
    ]  # fmt: skip


def _count_mentions(entities: list[ScannedEntity], text: _Text) -> list[ScannedEntity]:
    counted = [replace(e, mentions=len(_mentioning(e, text))) for e in entities]
    return sorted(counted, key=lambda e: -e.mentions)  # stable: ties keep scan order


def _voice_samples(entity: ScannedEntity, text: _Text) -> list[str]:
    hits = _mentioning(entity, text)
    dialogue = [p for p in hits if any(q in p for q in _QUOTES)]
    return [p[:SAMPLE_CHARS] for p in (dialogue or hits)[:VOICE_SAMPLES]]


def _add_voices(
    client: LLMClient,
    entities: list[ScannedEntity],
    text: _Text,
    target_lang: str,
    limit: int,
) -> list[ScannedEntity]:
    people = [e for e in entities if e.category == "person" and e.mentions][:limit]
    if not people:
        return entities
    batch = [(e.english, e.translation, _voice_samples(e, text)) for e in people]
    system, user = build_voice_prompt(batch, target_lang=target_lang)
    try:
        voices = parse_voices(complete_with_retry(client, system, user, json_mode=True))
    except TranslatorError as exc:
        logger.warning("voice cards failed: %s", type(exc).__name__)
        return entities
    return [replace(e, voice=voices.get(e.english, e.voice)) for e in entities]


def _window(paragraphs: Sequence[str], start: int) -> list[int]:
    picked, size = [], 0
    for i in range(start, len(paragraphs)):
        if size >= STYLE_WINDOW_CHARS:
            break
        picked.append(i)
        size += len(paragraphs[i])
    return picked


def _style_guide(client: LLMClient, paragraphs: Sequence[str], target_lang: str) -> str:
    n = len(paragraphs)
    starts = [0, n // 2, max(0, n - _tail_count(paragraphs))]
    chosen = sorted({i for s in starts for i in _window(paragraphs, s)})
    system, user = build_style_prompt([paragraphs[i] for i in chosen], target_lang=target_lang)
    try:
        return complete_with_retry(client, system, user).strip()
    except TranslatorError as exc:
        logger.warning("style guide failed: %s", type(exc).__name__)
        return ""


def _tail_count(paragraphs: Sequence[str]) -> int:
    """How many trailing paragraphs fill one style window."""
    size, count = 0, 0
    for p in reversed(paragraphs):
        if size >= STYLE_WINDOW_CHARS:
            break
        size += len(p)
        count += 1
    return count
