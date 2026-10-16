"""Mock LLM client — zero network, deterministic, speaks the real prompt protocols.

Translation calls echo each marked segment as `[<target>] <source>`;
extraction calls return capitalised words from the `[source]` lines. Dev,
CI and the mock eval run go through the same pipeline code as real providers.
"""

from __future__ import annotations

import json
import re

from bookbridge.harness.models import Usage
from bookbridge.harness.parsing import count_markers, format_segments, parse_segments
from bookbridge.harness.prompts import SEGMENTS_HEADING

# Capitalised word of 3+ chars: skips sentence-initial "I" and "IT"-style caps.
_TERM_PATTERN = re.compile(r"\b[A-Z][a-z]{2,}\b")
_TARGET_RE = re.compile(r"^Target language: (\S+)$", re.MULTILINE)
_SOURCE_LINE_RE = re.compile(r"^\[source\] (.*)$", re.MULTILINE)


class MockLLMClient:
    def __init__(self) -> None:
        self.usage = Usage()

    def complete(self, system: str, user: str, *, json_mode: bool = False) -> str:
        self.usage.calls += 1
        found = _TARGET_RE.search(system)
        lang = found.group(1) if found else "mock"
        if json_mode:
            return self._extract(user, lang)
        block = user.split(SEGMENTS_HEADING, 1)[-1]
        if not count_markers(block):  # free-form call, e.g. a chapter summary
            return f"[{lang}] {user[:200]}"
        segments = parse_segments(block, expected=count_markers(block))
        return format_segments([f"[{lang}] {s}" for s in segments])

    @staticmethod
    def _extract(user: str, lang: str) -> str:
        words: list[str] = []
        for line in _SOURCE_LINE_RE.findall(user):
            words += [w for w in _TERM_PATTERN.findall(line) if w not in words]
        terms = [
            {"english": w, "translation": f"[{lang}] {w}", "category": "general"} for w in words
        ]
        return json.dumps({"terms": terms}, ensure_ascii=False)
