"""Deterministic glossary retrieval: which terms occur in a text.

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
from functools import lru_cache

from bookbridge.harness.models import GlossaryEntry

_SUFFIX = r"(?:['’][sS]|[eE]?[sS])?"


@lru_cache(maxsize=4096)
def _pattern(form: str) -> re.Pattern[str]:
    body = r"\s+".join(re.escape(word) for word in form.split())
    regex = rf"(?<!\w){body}{_SUFFIX}(?!\w)"
    if form != form.lower():
        upper = r"\s+".join(re.escape(word) for word in form.upper().split())
        regex = rf"(?<!\w)(?:{body}|{upper}){_SUFFIX}(?!\w)"
        return re.compile(regex)
    return re.compile(regex, re.IGNORECASE)


def _may_occur(form: str, text: str, lowered: str) -> bool:
    """Cheap substring pre-check on the first word; skips most regex searches."""
    head = form.split()[0]
    if head != head.lower():
        return head in text or head.upper() in text
    return head in lowered


def occurs(form: str, text: str, lowered: str | None = None) -> bool:
    """True when `form` appears in `text` under the matching rules above."""
    form = form.strip()
    if not form or not _may_occur(form, text, text.lower() if lowered is None else lowered):
        return False
    return _pattern(form).search(text) is not None


def match_glossary(glossary: Iterable[GlossaryEntry], text: str) -> list[GlossaryEntry]:
    """Return entries whose name occurs in `text`, in input order.

    Aliases are entries of their own, so they match by their own name.
    """
    lowered = text.lower()
    return [entry for entry in glossary if occurs(entry.english, text, lowered)]
