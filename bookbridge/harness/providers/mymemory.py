"""MyMemory free translation provider (no API key, rate-limited)."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request

from bookbridge.harness.translator import (
    GlossaryEntry,
    TranslateResult,
    Translator,
    TranslatorError,
    validate_input,
)

MYMEMORY_URL: str = "https://api.mymemory.translated.net/get"
REQUEST_TIMEOUT_SECONDS: float = 15.0


class MyMemoryTranslator(Translator):
    """Calls MyMemory's public GET endpoint. URL is a hardcoded constant (A10 / SSRF).

    Input is validated before building the query string so attacker-controlled values
    can't change the URL host or reach the network. Does not support glossary
    injection or term extraction — returns an empty `new_terms` list unconditionally.
    """

    def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        glossary: list[GlossaryEntry] | None = None,
    ) -> TranslateResult:
        validate_input(text, source_lang, target_lang)
        params = urllib.parse.urlencode({"q": text, "langpair": f"{source_lang}|{target_lang}"})
        url = f"{MYMEMORY_URL}?{params}"
        with urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read())
        translated = body.get("responseData", {}).get("translatedText") or ""
        if not translated:
            raise TranslatorError("MyMemory returned no translation")
        return TranslateResult(text=translated, new_terms=[])
