"""Harness: pluggable translation orchestration for the worker.

Exports `get_translator()` which selects a provider based on the
TRANSLATION_PROVIDER environment variable (default: mymemory).
"""

import os

from bookbridge.harness.providers.claude import ClaudeTranslator
from bookbridge.harness.providers.mock import MockTranslator
from bookbridge.harness.providers.mymemory import MyMemoryTranslator
from bookbridge.harness.providers.openai_compat import OpenAICompatTranslator
from bookbridge.harness.translator import Translator

_PROVIDERS: dict[str, type[Translator]] = {
    "mock": MockTranslator,
    "mymemory": MyMemoryTranslator,
    "claude": ClaudeTranslator,
    "openai_compat": OpenAICompatTranslator,
}


def get_translator() -> Translator:
    """Return a Translator based on TRANSLATION_PROVIDER env var (default mymemory)."""
    name = os.environ.get("TRANSLATION_PROVIDER", "mymemory").lower()
    if name not in _PROVIDERS:
        raise ValueError(
            f"Unknown TRANSLATION_PROVIDER: {name!r}. Expected one of: {sorted(_PROVIDERS)}"
        )
    return _PROVIDERS[name]()


__all__ = ["Translator", "get_translator"]
