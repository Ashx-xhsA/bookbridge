"""Book pre-scan: build a draft book bible before any chapter is translated.

1. Split the whole book into passages and ask, per passage, for the named
   entities (with aliases, each alias carrying its own translation).
2. Merge deterministically: two entries are the same entity when a name or
   alias of one equals a name or alias of the other (case-insensitive). The
   first main name seen wins; other names become aliases.
3. Count mentions (paragraphs naming the entity or an alias) with the same
   matcher the translator uses, and sort by it.
4. One call writes voice cards for the most-mentioned people, from dialogue
   samples; one call writes a style guide from passages at the start, middle
   and end of the book.

Any single failed call is skipped — a partial bible is still useful and the
user reviews it before it matters.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass, field, replace

from bookbridge.harness.batching import plan_batches
from bookbridge.harness.matching import occurs
from bookbridge.harness.models import AliasTarget, LLMClient, TranslatorError
from bookbridge.harness.parsing import parse_entities, parse_voices
from bookbridge.harness.prompts import (
    build_scan_prompt,
    build_style_prompt,
    build_voice_prompt,
)

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
    for chunk in plan_batches(paragraphs, max_chunk_chars):
        raw += _scan_passage(client, "\n\n".join(paragraphs[i] for i in chunk), target_lang)
    text = _Text.of(paragraphs)
    entities = _count_mentions(_merge(raw), text)
    entities = _add_voices(client, entities, text, target_lang, max_voice_cards)
    return ScanResult(style_guide=_style_guide(client, paragraphs, target_lang), entities=entities)


def _scan_passage(client: LLMClient, passage: str, target_lang: str) -> list[dict]:
    system, user = build_scan_prompt(passage, target_lang=target_lang)
    try:
        return parse_entities(client.complete(system, user, json_mode=True))
    except TranslatorError as exc:
        logger.warning("pre-scan passage failed: %s", type(exc).__name__)
        return []


def _merge(raw: list[dict]) -> list[ScannedEntity]:
    merged: list[ScannedEntity] = []
    index: dict[str, int] = {}  # lowercased name or alias -> position in `merged`
    for item in raw:
        names = [item["name"], *(n for n, _ in item["aliases"])]
        hit = next((index[n.lower()] for n in names if n.lower() in index), None)
        if hit is None:
            hit = len(merged)
            merged.append(
                ScannedEntity(
                    english=item["name"], translation=item["translation"],
                    category=item["category"], gender=item["gender"], notes=item["notes"],
                )
            )  # fmt: skip
            pending = item["aliases"]
        else:
            pending = [(item["name"], item["translation"]), *item["aliases"]]
        merged[hit] = _absorb(merged[hit], item, pending)
        for name in merged[hit].names:
            index[name.lower()] = hit
    return merged


def _absorb(entity: ScannedEntity, item: dict, aliases: list[tuple[str, str]]) -> ScannedEntity:
    known = {n.lower() for n in entity.names}
    extra = []
    for name, translation in aliases:
        if name.lower() not in known:
            known.add(name.lower())
            extra.append(AliasTarget(english=name, translation=translation))
    return replace(
        entity,
        aliases=entity.aliases + tuple(extra),
        gender=entity.gender or item["gender"],
        notes=entity.notes or item["notes"],
    )


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
        voices = parse_voices(client.complete(system, user, json_mode=True))
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
        return client.complete(system, user).strip()
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
