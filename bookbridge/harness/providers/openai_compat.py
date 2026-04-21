"""OpenAI-compatible translator provider.

Works against any `/chat/completions`-style endpoint (OpenAI, DeepSeek,
Moonshot/Kimi, Zhipu GLM, Qwen, Groq, local Ollama, ...). Config is read
from env at call time so the Worker can switch providers without a restart.
"""

import json
import os
import urllib.error
import urllib.request

from bookbridge.harness.translator import (
    Translator,
    TranslatorError,
    validate_input,
)

REQUEST_TIMEOUT_SECONDS: float = 60.0


class OpenAICompatTranslator(Translator):
    """POSTs to `{LLM_BASE_URL}/chat/completions` with an OpenAI-format body.

    Env vars (read per call):
      - LLM_BASE_URL — base URL including `/v1` (never taken from user input: A10/SSRF)
      - LLM_API_KEY  — bearer token (never logged)
      - LLM_MODEL    — opaque model id, echoed only in the JSON body
    """

    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        validate_input(text, source_lang, target_lang)

        api_key = os.environ.get("LLM_API_KEY", "")
        base_url = os.environ.get("LLM_BASE_URL", "").rstrip("/")
        model = os.environ.get("LLM_MODEL", "")
        if not api_key or not base_url or not model:
            raise ValueError("LLM provider not configured")

        system_prompt = (
            f"Translate from {source_lang} to {target_lang}. "
            "Return only the translated text, no preamble, no explanation."
        )
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            "temperature": 0,
        }

        req = urllib.request.Request(
            url=f"{base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
                body = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            raise TranslatorError("Translation provider failed") from exc
        except urllib.error.URLError as exc:
            raise TranslatorError("Translation provider failed") from exc
        except json.JSONDecodeError as exc:
            raise TranslatorError("Translation provider failed") from exc

        try:
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise TranslatorError("Translation provider failed") from exc

        if not isinstance(content, str) or not content:
            raise TranslatorError("Translation provider failed")
        return content
