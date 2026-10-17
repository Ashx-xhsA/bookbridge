"""Book pre-scan: build a draft book bible before any chapter is translated.

1. Split the whole book into passages and ask, per passage, for the named
   entities (with aliases, each alias carrying its own translation) and a
   two- or three-sentence summary of what happens.
2. Merge deterministically (rules found in the first real-model run, where a
   shared surname fused Gregor Samsa with his father):
   - entries with the same main name are one entity; the first seen wins;
   - a *capitalised* alias equal to another entity's main name folds that
     entity in ("Georg" ⊂ "Georg Bendemann");
   - an alias claimed by two entities ("Mr. Samsa"), or a lowercase alias
     naming another entity ("father"), is ambiguous and dropped;
3. Proper nouns only (see proper_nouns.py): common nouns ("firm", "head
   clerk"), titles and kinship words ("Mother", "Chief") are dropped, as
   names and as aliases; a proper alias of a common-noun entry becomes its
   main name. This runs before merging.
4. Count mentions (paragraphs naming the entity or an alias) with the same
   matcher the translator uses, sort by it, and drop entities never written
   that way in the book.
5. One call writes the book overview the translator reads before every
   passage: storyline (from the passage summaries, in order), the main
   characters (most-mentioned people) and the tone (from passages at the
   start, middle and end of the book).

A single failed passage or overview call is skipped — a partial bible
is still useful and the user reviews it. But a non-retryable provider error
(bad key) stops the scan at once, and a scan where every passage failed
raises: an empty "successful" bible would hide the problem.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field, replace

from bookbridge.harness.batching import plan_batches
from bookbridge.harness.matching import occurs
from bookbridge.harness.models import AliasTarget, LLMClient, ProviderError, TranslatorError
from bookbridge.harness.parsing import parse_entities, parse_summary
from bookbridge.harness.prompts import (
    build_overview_prompt,
    build_scan_prompt,
)
from bookbridge.harness.proper_nouns import is_proper_noun
from bookbridge.harness.retry import complete_with_retry

logger = logging.getLogger(__name__)

SCAN_CHUNK_CHARS = 12000
# Most-mentioned people named in the overview.
MAX_OVERVIEW_CHARACTERS = 12
# Characters of text sampled at the start, middle and end for the tone.
STYLE_WINDOW_CHARS = 1500


@dataclass(frozen=True)
class ScannedEntity:
    english: str
    translation: str
    category: str
    notes: str | None = None
    aliases: tuple[AliasTarget, ...] = ()
    mentions: int = 0

    @property
    def names(self) -> tuple[str, ...]:
        return (self.english, *(a.english for a in self.aliases))


@dataclass
class ScanResult:
    overview: str = ""
    entities: list[ScannedEntity] = field(default_factory=list)


# Called after each step with (done, total); returning False stops the scan.
ScanProgress = Callable[[int, int], bool]


class ScanStopped(Exception):
    """The scan was stopped on request (the user pressed Stop)."""


def scan_book(
    client: LLMClient,
    chapters: Sequence[Sequence[str]],
    *,
    target_lang: str,
    max_chunk_chars: int = SCAN_CHUNK_CHARS,
    progress: ScanProgress | None = None,
) -> ScanResult:
    """Scan `chapters` (lists of paragraphs) and return a draft bible.

    Steps are one call per passage, then the overview;
    `progress` hears about each finished step and may stop the scan.
    """
    paragraphs = [p for chapter in chapters for p in chapter if p.strip()]
    if not paragraphs:
        return ScanResult()
    chunks = plan_batches(paragraphs, max_chunk_chars)
    step = _Steps(len(chunks) + 1, progress)
    raw: list[dict] = []
    summaries: list[str] = []
    failures = 0
    for chunk in chunks:
        found = _scan_passage(client, "\n\n".join(paragraphs[i] for i in chunk), target_lang)
        failures += found is None
        entities, summary = found or ([], "")
        raw += [e for item in entities if (e := _proper_only(item))]
        summaries += [summary] if summary else []
        step.done()
    if failures == len(chunks):
        raise TranslatorError("Bible scan failed: every passage call failed")
    text = _Text.of(paragraphs)
    entities = _count_mentions(_merge(raw), text)
    overview = _overview(client, summaries, entities, paragraphs, target_lang)
    step.done()
    return ScanResult(overview=overview, entities=entities)


class _Steps:
    """Counts finished scan steps and reports them; raises ScanStopped on request."""

    def __init__(self, total: int, progress: ScanProgress | None) -> None:
        self.total = total
        self.count = 0
        self.progress = progress

    def done(self) -> None:
        self.count += 1
        if self.progress is not None and not self.progress(self.count, self.total):
            raise ScanStopped


def _scan_passage(
    client: LLMClient, passage: str, target_lang: str
) -> tuple[list[dict], str] | None:
    """Entities and summary of one passage; None when the call failed (skippable)."""
    system, user = build_scan_prompt(passage, target_lang=target_lang)
    try:
        reply = complete_with_retry(client, system, user, json_mode=True)
        return parse_entities(reply), parse_summary(reply)
    except ProviderError as exc:
        if not exc.retryable:
            raise  # e.g. a bad key: every other passage would fail the same way
        logger.warning("pre-scan passage failed after retries")
        return None
    except TranslatorError as exc:
        logger.warning("pre-scan passage failed: %s", type(exc).__name__)
        return None


def _proper_only(item: dict) -> dict | None:
    """Keep the proper names of one scanned entity; the first becomes its main name."""
    names = [(item["name"], item["translation"]), *item["aliases"]]
    kept = [(n, t) for n, t in names if is_proper_noun(n)]
    if not kept:
        return None
    (name, translation), aliases = kept[0], kept[1:]
    return {**item, "name": name, "translation": translation, "aliases": aliases}


def _capitalised(name: str) -> bool:
    return any(ch.isupper() for ch in name)


def _merge(raw: list[dict]) -> list[ScannedEntity]:
    return _drop_ambiguous_aliases(_fold_named_aliases(_group_by_name(raw)))


def _group_by_name(raw: list[dict]) -> list[ScannedEntity]:
    groups: dict[str, ScannedEntity] = {}
    for item in raw:
        entity = ScannedEntity(
            english=item["name"], translation=item["translation"], category=item["category"],
            notes=item["notes"],
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
    found = [e for e in counted if e.mentions]  # never written that way: not a name here
    return sorted(found, key=lambda e: -e.mentions)  # stable: ties keep scan order


def _window(paragraphs: Sequence[str], start: int) -> list[int]:
    picked, size = [], 0
    for i in range(start, len(paragraphs)):
        if size >= STYLE_WINDOW_CHARS:
            break
        picked.append(i)
        size += len(paragraphs[i])
    return picked


def _overview(
    client: LLMClient,
    summaries: Sequence[str],
    entities: Sequence[ScannedEntity],
    paragraphs: Sequence[str],
    target_lang: str,
) -> str:
    people = [e for e in entities if e.category == "person"][:MAX_OVERVIEW_CHARACTERS]
    n = len(paragraphs)
    starts = [0, n // 2, max(0, n - _tail_count(paragraphs))]
    chosen = sorted({i for s in starts for i in _window(paragraphs, s)})
    system, user = build_overview_prompt(
        summaries,
        [(e.english, e.translation) for e in people],
        [paragraphs[i] for i in chosen],
        target_lang=target_lang,
    )
    try:
        return complete_with_retry(client, system, user).strip()
    except TranslatorError as exc:
        logger.warning("book overview failed: %s", type(exc).__name__)
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
