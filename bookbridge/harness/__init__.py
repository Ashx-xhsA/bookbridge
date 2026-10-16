"""Harness: pluggable translation orchestration for the worker.

Exports `get_translator()` which selects a provider based on the
TRANSLATION_PROVIDER environment variable (default: mock).
"""

import os

from bookbridge.harness.providers.mock import MockTranslator
from bookbridge.harness.providers.openai_compat import OpenAICompatTranslator
from bookbridge.harness.translator import Translator

_PROVIDERS: dict[str, type[Translator]] = {
    "mock": MockTranslator,
    "openai_compat": OpenAICompatTranslator,
}


def get_translator() -> Translator:
    """Return a Translator based on TRANSLATION_PROVIDER env var (default mock)."""
    name = os.environ.get("TRANSLATION_PROVIDER", "mock").lower()
    if name not in _PROVIDERS:
        raise ValueError(
            f"Unknown TRANSLATION_PROVIDER: {name!r}. Expected one of: {sorted(_PROVIDERS)}"
        )
    return _PROVIDERS[name]()


__all__ = ["Translator", "get_translator"]
