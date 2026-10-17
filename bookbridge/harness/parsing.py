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
from bookbridge.quality.models import Issue

_MARKER_RE = re.compile(r"^[ \t]*<<<[ \t]*(\d+)[ \t]*>>>[ \t]*$", re.MULTILINE)


class SegmentAlignmentError(TranslatorError):
    """Output segments don't line up 1:1 with the input batch."""


def marker(n: int) -> str:
    return f"<<<{n}>>>"


def count_markers(content: str) -> int:
    return len(_MARKER_RE.findall(content))


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


def _json_object(content: str) -> dict:
    try:
        parsed = json.loads(strip_code_fence(content))
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def parse_entities(content: str) -> list[dict]:
    """Parse a pre-scan reply `{"entities": [...]}` into cleaned dicts.

    Keeps items with a name and translation; normalises the category; aliases
    become `[(name, translation)]` and need both fields too.
    """
    items = _json_object(content).get("entities")
    out: list[dict] = []
    for raw in items if isinstance(items, list) else []:
        if not isinstance(raw, dict):
            continue
        name, tran = _text(raw.get("name")), _text(raw.get("translation"))
        if not name or not tran:
            continue
        cat = raw.get("category")
        aliases = raw.get("aliases") if isinstance(raw.get("aliases"), list) else []
        out.append(
            {
                "name": name,
                "translation": tran,
                "category": cat if isinstance(cat, str) and cat in TERM_CATEGORIES else "general",
                "gender": _text(raw.get("gender")) or None,
                "notes": _text(raw.get("note") or raw.get("notes")) or None,
                "aliases": [
                    (_text(a.get("name")), _text(a.get("translation")))
                    for a in aliases
                    if isinstance(a, dict) and _text(a.get("name")) and _text(a.get("translation"))
                ],
            }
        )
    return out


REVIEW_CATEGORIES: tuple[str, ...] = (
    "mistranslation", "omission", "addition", "pronoun", "address", "voice",
    "term", "alias", "fluency", "style", "other",
)  # fmt: skip
# Only these may be errors (sent back for revision); the rest is style-level.
MEANING_CATEGORIES = frozenset(
    {"mistranslation", "omission", "addition", "pronoun", "address", "term", "alias"}
)
MAX_ISSUE_MESSAGE = 300


def _review_issue(raw: object, translations: Sequence[str]) -> tuple[int, Issue] | None:
    """One reviewer item, or None when it does not point at real text.

    The item must quote the wrong words exactly as they appear in the
    translation: a reviewer that talks itself out of a finding ("not a
    problem, withdrawn") cannot quote a wrong span, so the item is dropped.
    """
    if not isinstance(raw, dict):
        return None
    seg, message, quote = raw.get("segment"), _text(raw.get("message")), _text(raw.get("quote"))
    if type(seg) is not int or not 1 <= seg <= len(translations) or not message:
        return None
    if not quote or quote not in translations[seg - 1]:
        return None
    cat = raw.get("category")
    category = cat if isinstance(cat, str) and cat in REVIEW_CATEGORIES else "other"
    fix = _text(raw.get("fix"))
    # An error must change meaning and come with a fix that actually changes the quote.
    is_error = (
        raw.get("severity") == "error" and category in MEANING_CATEGORIES
        and bool(fix) and fix != quote
    )  # fmt: skip
    text = f'{message} ["{quote}" → "{fix}"]' if fix else message
    return seg - 1, Issue(category, text[:MAX_ISSUE_MESSAGE], "error" if is_error else "warning")


def parse_review(content: str, translations: Sequence[str]) -> dict[int, list[Issue]]:
    """Parse `{"issues": [{"segment", "quote", "category", "severity", "fix", "message"}]}`.

    `translations` are the reviewed texts in batch order; keys of the result
    are 0-based positions in them. Unparseable replies and malformed,
    out-of-range or unquotable items are dropped — a broken review never
    blocks a translation.
    """
    items = _json_object(content).get("issues")
    out: dict[int, list[Issue]] = {}
    for raw in items if isinstance(items, list) else []:
        parsed = _review_issue(raw, translations)
        if parsed:
            out.setdefault(parsed[0], []).append(parsed[1])
    return out


def parse_voices(content: str) -> dict[str, str]:
    """Parse `{"voices": [{"name", "voice"}]}` into {name: voice}."""
    items = _json_object(content).get("voices")
    pairs = (
        (_text(v.get("name")), _text(v.get("voice")))
        for v in (items if isinstance(items, list) else [])
        if isinstance(v, dict)
    )
    return {name: voice for name, voice in pairs if name and voice}


def _text(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""
