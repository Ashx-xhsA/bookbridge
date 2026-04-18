"""Mock translator — zero-network echo with a target-lang tag, for dev and CI."""

from bookbridge.harness.translator import Translator, validate_input


class MockTranslator(Translator):
    """Returns the source text prefixed with the target language tag.

    Use when running tests offline or doing a demo without any translation provider.
    """

    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        validate_input(text, source_lang, target_lang)
        return f"[{target_lang}] {text}"
