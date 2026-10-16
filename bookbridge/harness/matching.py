"""Deterministic glossary retrieval: which terms (or aliases) occur in a text.

Exact matching beats embeddings for proper nouns — if "Frodo" is in the
paragraph it is always found. Rules:
- word boundaries on both sides; optional plural (-s/-es) or possessive ('s / ’s)
- whitespace inside multi-word terms matches any run of whitespace (line breaks)
- forms containing an uppercase letter match case-sensitively (so the
  character "Will" is not injected for the verb "will"), plus an ALL-CAPS
  variant for headings; all-lowercase forms match case-insensitively
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from functools import lru_cache

from bookbridge.harness.models import GlossaryEntry

_SUFFIX = r"(?:['’][sS]|[eE]?[sS])?"


@dataclass(frozen=True)
class GlossaryMatch:
    """A matched entry plus the aliases (not the main name) that were seen."""

    entry: GlossaryEntry
    aliases: tuple[str, ...] = ()


@lru_cache(maxsize=4096)
def _pattern(form: str) -> re.Pattern[str]:
    body = r"\s+".join(re.escape(word) for word in form.split())
    regex = rf"(?<!\w){body}{_SUFFIX}(?!\w)"
    if form != form.lower():
        upper = r"\s+".join(re.escape(word) for word in form.upper().split())
        regex = rf"(?<!\w)(?:{body}|{upper}){_SUFFIX}(?!\w)"
        return re.compile(regex)
    return re.compile(regex, re.IGNORECASE)


def occurs(form: str, text: str) -> bool:
    """True when `form` appears in `text` under the matching rules above."""
    return bool(form.strip()) and _pattern(form.strip()).search(text) is not None


def match_glossary(glossary: Iterable[GlossaryEntry], text: str) -> list[GlossaryMatch]:
    """Return entries whose name or any alias occurs in `text`, in input order."""
    matches: list[GlossaryMatch] = []
    for entry in glossary:
        hit_aliases = tuple(a for a in entry.aliases if occurs(a, text))
        if hit_aliases or occurs(entry.english, text):
            matches.append(GlossaryMatch(entry=entry, aliases=hit_aliases))
    return matches
