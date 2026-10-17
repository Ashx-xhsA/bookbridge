"""Mock LLM client — zero network, deterministic, speaks the real prompt protocols.

Translation calls echo each marked segment as `[<target>] <source>`;
extraction calls return capitalised words from the `[source]` lines; the
reviewer and recheck find nothing and revision re-echoes the `[source]` lines. Dev,
CI and the mock eval run go through the same pipeline code as real providers.
"""

from __future__ import annotations

import json
import re

from bookbridge.harness.models import Usage
from bookbridge.harness.parsing import count_markers, format_segments, parse_segments
from bookbridge.harness.prompts import REVISE_HEADING, SEGMENTS_HEADING

# Capitalised word of 3+ chars: skips sentence-initial "I" and "IT"-style caps.
_TERM_PATTERN = re.compile(r"\b[A-Z][a-z]{2,}\b")
_TARGET_RE = re.compile(r"^Target language: (\S+)$", re.MULTILINE)
_SOURCE_LINE_RE = re.compile(r"^\[source\] (.*)$", re.MULTILINE)
_TASK_RE = re.compile(r"^Task: (\w+)$", re.MULTILINE)
_VOICE_NAME_RE = re.compile(r"^### (.+)$", re.MULTILINE)


class MockLLMClient:
    def __init__(self) -> None:
        self.usage = Usage()

    def complete(self, system: str, user: str, *, json_mode: bool = False) -> str:
        self.usage.calls += 1
        found = _TARGET_RE.search(system)
        lang = found.group(1) if found else "mock"
        found_task = _TASK_RE.search(system)
        task = found_task.group(1) if found_task else ""
        if json_mode and task in ("review", "recheck"):
            return json.dumps({"issues": []})
        if task == "revise":
            sources = _SOURCE_LINE_RE.findall(user.split(REVISE_HEADING, 1)[-1])
            return format_segments([f"[{lang}] {s}" for s in sources])
        if json_mode and task == "scan_entities":
            return self._scan(user, lang)
        if json_mode and task == "voice_cards":
            voices = [{"name": n, "voice": f"[{lang}] voice"} for n in _VOICE_NAME_RE.findall(user)]
            return json.dumps({"voices": voices}, ensure_ascii=False)
        if json_mode:
            return self._extract(user, lang)
        block = user.split(SEGMENTS_HEADING, 1)[-1]
        if not count_markers(block):  # free-form call, e.g. a chapter summary
            return f"[{lang}] {user[:200]}"
        segments = parse_segments(block, expected=count_markers(block))
        return format_segments([f"[{lang}] {s}" for s in segments])

    @staticmethod
    def _scan(passage: str, lang: str) -> str:
        names = list(dict.fromkeys(_TERM_PATTERN.findall(passage)))
        entities = [
            {"name": n, "translation": f"[{lang}] {n}", "category": "person", "aliases": []}
            for n in names
        ]
        return json.dumps({"entities": entities}, ensure_ascii=False)

    @staticmethod
    def _extract(user: str, lang: str) -> str:
        words: list[str] = []
        for line in _SOURCE_LINE_RE.findall(user):
            words += [w for w in _TERM_PATTERN.findall(line) if w not in words]
        terms = [
            {"english": w, "translation": f"[{lang}] {w}", "category": "general"} for w in words
        ]
        return json.dumps({"terms": terms}, ensure_ascii=False)
