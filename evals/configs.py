"""The three Phase 6 configurations.

A  plain paragraph translation: no glossary, no context window, no overview,
   no review — what a model does on its own.
B  A + the scanned glossary (only terms that occur in each batch) + the
   preceding three paragraphs.
C  B + the book overview + one round of review (the production defaults).
"""

from __future__ import annotations

from dataclasses import dataclass

from bookbridge.harness.config import TranslationConfig


@dataclass(frozen=True)
class EvalConfig:
    name: str
    # Whether the scanned glossary is passed to the translator at all.
    glossary: bool
    translation: TranslationConfig


CONFIGS: dict[str, EvalConfig] = {
    "A": EvalConfig(
        "A",
        glossary=False,
        translation=TranslationConfig(context_window=0, book_bible=False, review_max_retries=0),
    ),
    "B": EvalConfig(
        "B",
        glossary=True,
        translation=TranslationConfig(
            glossary_mode="matched", context_window=3, book_bible=False, review_max_retries=0
        ),
    ),
    "C": EvalConfig(
        "C",
        glossary=True,
        translation=TranslationConfig(
            glossary_mode="matched", context_window=3, book_bible=True, review_max_retries=1
        ),
    ),
}


def select(names: str) -> list[EvalConfig]:
    """Configs named in a comma-separated list ("C,A"), in that order."""
    wanted = [n.strip().upper() for n in names.split(",") if n.strip()]
    unknown = [n for n in wanted if n not in CONFIGS]
    if unknown:
        raise ValueError(f"Unknown config(s): {', '.join(unknown)} (known: {', '.join(CONFIGS)})")
    return [CONFIGS[n] for n in wanted]
