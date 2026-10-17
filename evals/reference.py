"""Reference glossary for an eval book: each term with the renderings the
human translation uses (any of them counts as agreeing)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ReferenceTerm:
    english: str
    accepted: tuple[str, ...]
    category: str
