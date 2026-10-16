"""TranslationConfig — one switch per context component, so evals can ablate each.

Defaults are "everything on"; the Phase 6 eval builds B0–B4 by turning
switches off rather than by reverting code.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

GlossaryMode = Literal["full", "matched"]
GLOSSARY_MODES: frozenset[str] = frozenset({"full", "matched"})
MAX_CONTEXT_WINDOW = 10


@dataclass(frozen=True)
class TranslationConfig:
    """Per-run translation settings.

    - glossary_mode: "full" injects every term (capped); "matched" only terms
      whose name or alias appears in the batch being translated.
    - context_window: how many preceding segments (source + translation) to
      show the model; 0 disables the window.
    - book_bible: inject the style guide and the cards of characters that
      appear in the batch (when a bible is supplied).
    - max_batch_chars: source-character budget per LLM call.
    """

    glossary_mode: GlossaryMode = "matched"
    context_window: int = 3
    book_bible: bool = True
    max_batch_chars: int = 6000

    def __post_init__(self) -> None:
        if self.glossary_mode not in GLOSSARY_MODES:
            raise ValueError(f"Unknown glossary_mode: {self.glossary_mode!r}")
        if not 0 <= self.context_window <= MAX_CONTEXT_WINDOW:
            raise ValueError(f"context_window must be 0..{MAX_CONTEXT_WINDOW}")
        if self.max_batch_chars <= 0:
            raise ValueError("max_batch_chars must be positive")
