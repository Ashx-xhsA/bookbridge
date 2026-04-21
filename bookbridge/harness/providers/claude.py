"""Claude provider stub — real implementation requires ANTHROPIC_API_KEY wiring."""

from __future__ import annotations

from bookbridge.harness.translator import (
    GlossaryEntry,
    TranslateResult,
    Translator,
)


class ClaudeTranslator(Translator):
    def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        glossary: list[GlossaryEntry] | None = None,
    ) -> TranslateResult:
        raise NotImplementedError("Claude provider requires ANTHROPIC_API_KEY; not wired yet")
