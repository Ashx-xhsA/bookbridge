"""Group consecutive segments into LLM calls under a source-character budget."""

from __future__ import annotations

from collections.abc import Sequence


def plan_batches(segments: Sequence[str], max_chars: int) -> list[range]:
    """Greedy split into contiguous index ranges.

    A batch closes when adding the next segment would exceed `max_chars`;
    a single segment longer than the budget gets a batch of its own rather
    than being cut (paragraphs are never split mid-text).
    """
    batches: list[range] = []
    start, size = 0, 0
    for i, seg in enumerate(segments):
        if i > start and size + len(seg) > max_chars:
            batches.append(range(start, i))
            start, size = i, 0
        size += len(seg)
    if start < len(segments):
        batches.append(range(start, len(segments)))
    return batches
