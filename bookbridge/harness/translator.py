"""Translator protocol and shared input validation for harness providers."""

from typing import Protocol

MAX_SOURCE_BYTES: int = 200 * 1024  # 200 KB — bounded to prevent DoS on providers

ALLOWED_SOURCE_LANGS: frozenset[str] = frozenset({"en"})
ALLOWED_TARGET_LANGS: frozenset[str] = frozenset(
    {"zh-Hans", "zh-Hant", "es", "fr", "ja", "ko", "de"}
)


class TranslatorError(Exception):
    """Raised by providers when translation fails for a non-validation reason."""


class Translator(Protocol):
    """Pluggable translator contract. Implementations live in harness/providers/."""

    def translate(self, text: str, source_lang: str, target_lang: str) -> str: ...


def validate_input(text: str, source_lang: str, target_lang: str) -> None:
    """Reject empty, oversized, or unknown-language inputs before calling a provider.

    Centralised so every provider enforces the same rules, including MyMemory which
    builds the values into a URL and must reject unsafe content before issuing the
    request (A10 / SSRF-adjacent: don't forward attacker-controlled query params).
    """
    if not text:
        raise ValueError("Empty source_text")
    if len(text.encode("utf-8")) > MAX_SOURCE_BYTES:
        raise ValueError(f"source_text size exceeds maximum of {MAX_SOURCE_BYTES} bytes")
    if source_lang not in ALLOWED_SOURCE_LANGS:
        raise ValueError(f"Unsupported source_lang: {source_lang!r}")
    if target_lang not in ALLOWED_TARGET_LANGS:
        raise ValueError(f"Unsupported target_lang: {target_lang!r}")
