"""Reference glossary for an eval book: each term with the renderings the
human translation uses (any of them counts as agreeing)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ReferenceTerm:
    english: str
    accepted: tuple[str, ...]
    category: str


def load_reference(path: Path, *, require_checked: bool = True) -> list[ReferenceTerm]:
    """Read `{"terms": [{"english", "accepted": [...], "category", "checked"}]}`.

    A draft from build_reference has `checked: false` until a person has
    confirmed the renderings; the eval refuses those unless asked not to.
    """
    terms: list[ReferenceTerm] = []
    unchecked: list[str] = []
    seen: set[str] = set()
    for raw in json.loads(path.read_text(encoding="utf-8"))["terms"]:
        term = _term(raw)
        key = term.english.lower()
        if key in seen:
            raise ValueError(f"duplicate reference term: {term.english}")
        seen.add(key)
        if not raw.get("checked"):
            unchecked.append(term.english)
        terms.append(term)
    if require_checked and unchecked:
        raise ValueError(f"reference terms not checked yet: {', '.join(unchecked)}")
    return terms


def _term(raw: dict) -> ReferenceTerm:
    english = str(raw.get("english") or "").strip()
    accepted = tuple(
        a.strip() for a in raw.get("accepted") or [] if isinstance(a, str) and a.strip()
    )
    if not english or not accepted:
        raise ValueError(f"reference term needs a name and an accepted rendering: {raw!r}")
    return ReferenceTerm(english, accepted, str(raw.get("category") or "place"))
