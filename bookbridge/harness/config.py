"""TranslationConfig — one switch per context component, so evals can ablate each.

Defaults are "everything on"; the Phase 6 eval builds configs A/B/C by turning
switches off rather than by reverting code.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

GlossaryMode = Literal["full", "matched"]
GLOSSARY_MODES: frozenset[str] = frozenset({"full", "matched"})
MAX_CONTEXT_WINDOW = 10
MAX_REVIEW_RETRIES = 2


@dataclass(frozen=True)
class TranslationConfig:
    """Per-run translation settings.

    - glossary_mode: "full" injects every term (capped); "matched" only terms
      whose name or alias appears in the batch being translated.
    - context_window: how many preceding segments (source + translation) to
      show the model; 0 disables the window.
    - book_bible: inject the book overview (storyline, main characters,
      tone) when a bible is supplied.
    - review_max_retries: after each batch, review it (rule checks + one LLM
      reviewer call) and revise segments with errors up to this many times;
      0 disables review entirely (no review calls).
    - max_batch_chars: source-character budget per LLM call.
    """

    glossary_mode: GlossaryMode = "matched"
    context_window: int = 3
    book_bible: bool = True
    review_max_retries: int = 1
    max_batch_chars: int = 6000

    def __post_init__(self) -> None:
        if self.glossary_mode not in GLOSSARY_MODES:
            raise ValueError(f"Unknown glossary_mode: {self.glossary_mode!r}")
        if not 0 <= self.context_window <= MAX_CONTEXT_WINDOW:
            raise ValueError(f"context_window must be 0..{MAX_CONTEXT_WINDOW}")
        if not 0 <= self.review_max_retries <= MAX_REVIEW_RETRIES:
            raise ValueError(f"review_max_retries must be 0..{MAX_REVIEW_RETRIES}")
        if self.max_batch_chars <= 0:
            raise ValueError("max_batch_chars must be positive")
