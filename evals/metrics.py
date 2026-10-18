"""Phase 6 eval metrics, computed from source / translation pairs.

- agreement: occurrences of a reference term whose translated segment uses
  one of the human translation's renderings.
- consistency: for each term seen at least twice, the share of its
  occurrences that use its most common rendering (renderings come from an
  extraction pass; a missing one never counts as the majority).
- truncation_rate: failed segments plus ones cut short by the same length
  ratio the review loop uses.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from bookbridge.harness.matching import occurs
from bookbridge.quality.checks import MIN_RATIO_SOURCE_CHARS, min_ratio
from evals.reference import ReferenceTerm


@dataclass(frozen=True)
class TermScore:
    hits: int
    total: int
    per_term: dict[str, tuple[int, int]] = field(default_factory=dict)

    @property
    def rate(self) -> float | None:
        return self.hits / self.total if self.total else None


def occurrences(sources: Sequence[str], term: str) -> list[int]:
    """Positions of the segments that name `term` (translator's matching rules)."""
    return [i for i, src in enumerate(sources) if occurs(term, src)]


def agreement(
    sources: Sequence[str], translations: Sequence[str | None], terms: Sequence[ReferenceTerm]
) -> TermScore:
    per_term: dict[str, tuple[int, int]] = {}
    for term in terms:
        found = occurrences(sources, term.english)
        if not found:
            continue
        hits = sum(
            1 for i in found if translations[i] and any(r in translations[i] for r in term.accepted)
        )
        per_term[term.english] = (hits, len(found))
    return _total(per_term)


def consistency(renderings: Mapping[str, Sequence[str | None]]) -> TermScore:
    per_term: dict[str, tuple[int, int]] = {}
    for english, seen in renderings.items():
        if len(seen) < 2:
            continue
        counts = Counter(r for r in seen if r)
        top = counts.most_common(1)[0][1] if counts else 0
        per_term[english] = (top, len(seen))
    return _total(per_term)


def truncation_rate(
    sources: Sequence[str], translations: Sequence[str | None], target_lang: str
) -> float:
    if not sources:
        return 0.0
    floor = min_ratio(target_lang)
    bad = sum(
        1
        for src, tgt in zip(sources, translations, strict=True)
        if tgt is None
        or (
            len(src.strip()) >= MIN_RATIO_SOURCE_CHARS
            and len(tgt.strip()) / len(src.strip()) < floor
        )
    )
    return bad / len(sources)


def _total(per_term: dict[str, tuple[int, int]]) -> TermScore:
    hits = sum(h for h, _ in per_term.values())
    total = sum(t for _, t in per_term.values())
    return TermScore(hits=hits, total=total, per_term=per_term)
