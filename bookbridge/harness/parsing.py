"""The single place that parses LLM output (fixes P6: two divergent JSON parsers).

Translation output is plain text in a numbered-marker protocol — no JSON, so
dialogue quotes can't break parsing and a truncated reply is detected as a
segment-count mismatch instead of silently stored.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable, Sequence

from bookbridge.harness.models import TERM_CATEGORIES, ExtractedTerm, TranslatorError

_MARKER_RE = re.compile(r"^[ \t]*<<<[ \t]*(\d+)[ \t]*>>>[ \t]*$", re.MULTILINE)


class SegmentAlignmentError(TranslatorError):
    """Output segments don't line up 1:1 with the input batch."""


def marker(n: int) -> str:
    return f"<<<{n}>>>"


def format_segments(segments: Sequence[str]) -> str:
    """Render a batch as `<<<1>>>\\ntext\\n<<<2>>>\\ntext…` (1-based, per batch)."""
    return "\n".join(f"{marker(i)}\n{seg}" for i, seg in enumerate(segments, start=1))


def parse_segments(content: str, expected: int) -> list[str]:
    """Split marker-delimited output into exactly `expected` non-empty segments.

    Text before the first marker (a chatty preamble) is ignored. A single
    expected segment may come back without any marker.
    """
    found = list(_MARKER_RE.finditer(content))
    if not found and expected == 1 and content.strip():
        return [content.strip()]
    numbers = [int(m.group(1)) for m in found]
    if numbers != list(range(1, expected + 1)):
        raise SegmentAlignmentError(f"expected {expected} segments, got markers {numbers[:20]}")
    ends = [m.start() for m in found[1:]] + [len(content)]
    out = [content[m.end() : end].strip() for m, end in zip(found, ends, strict=True)]
    if any(not seg for seg in out):
        raise SegmentAlignmentError("empty segment in output")
    return out


def strip_code_fence(content: str) -> str:
    stripped = content.strip()
    fenced = re.fullmatch(r"```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```", stripped)
    return fenced.group(1).strip() if fenced else stripped


def _clean_term(raw: object) -> ExtractedTerm | None:
    if not isinstance(raw, dict):
        return None
    eng, tran = raw.get("english"), raw.get("translation")
    if not isinstance(eng, str) or not eng.strip():
        return None
    if not isinstance(tran, str) or not tran.strip():
        return None
    cat = raw.get("category")
    category = cat if isinstance(cat, str) and cat in TERM_CATEGORIES else "general"
    return ExtractedTerm(english=eng.strip(), translation=tran.strip(), category=category)


def parse_terms(content: str, existing: Iterable[str]) -> list[ExtractedTerm]:
    """Parse `{"terms": [...]}`; drop malformed items and known / duplicate names."""
    try:
        parsed = json.loads(strip_code_fence(content))
    except json.JSONDecodeError:
        return []
    items = parsed.get("terms") if isinstance(parsed, dict) else None
    if not isinstance(items, list):
        return []
    seen = {e.lower() for e in existing}
    terms: list[ExtractedTerm] = []
    for raw in items:
        term = _clean_term(raw)
        if term and term.english.lower() not in seen:
            seen.add(term.english.lower())
            terms.append(term)
    return terms
