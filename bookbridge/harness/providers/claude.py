"""Claude provider stub — real implementation requires ANTHROPIC_API_KEY wiring."""

from bookbridge.harness.translator import Translator


class ClaudeTranslator(Translator):
    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        raise NotImplementedError("Claude provider requires ANTHROPIC_API_KEY; not wired yet")
