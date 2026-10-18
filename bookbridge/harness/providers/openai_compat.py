"""OpenAI-compatible chat client — the only HTTP implementation in the Worker.

Works against any `/chat/completions`-style endpoint (OpenAI, DeepSeek,
Moonshot/Kimi, Zhipu GLM, Qwen, Groq, local Ollama, ...). The base URL comes
from env or the user's saved settings via the BFF — never from request
content (A10/SSRF). The API key is never logged.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from email.message import Message
from typing import IO

from bookbridge.harness.models import ProviderError, Usage
from bookbridge.harness.providers.url_guard import UnsafeBaseURLError, validate_base_url

logger = logging.getLogger(__name__)

# Per call. Batches are bounded by TranslationConfig.max_batch_chars, so 120 s
# is generous; override with LLM_TIMEOUT_SECONDS (clamped to [5, 600]).
DEFAULT_TIMEOUT_SECONDS: float = 120.0


def request_timeout() -> float:
    raw = os.environ.get("LLM_TIMEOUT_SECONDS", "").strip()
    try:
        return max(5.0, min(600.0, float(raw))) if raw else DEFAULT_TIMEOUT_SECONDS
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Surface 30x as HTTPError instead of following it to another host."""

    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: IO[bytes],
        code: int,
        msg: str,
        headers: Message,
        newurl: str,
    ) -> None:
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


class OpenAICompatClient:
    def __init__(
        self, api_key: str, base_url: str, model: str, *, trusted_base_url: bool = False
    ) -> None:
        if not api_key or not base_url or not model:
            raise ValueError("LLM provider not configured")
        if not trusted_base_url:
            validate_base_url(base_url, resolve=False)
        self._trusted_base_url = trusted_base_url
        self._api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.usage = Usage()

    @classmethod
    def from_env(cls) -> OpenAICompatClient:
        return cls(
            api_key=os.environ.get("LLM_API_KEY", ""),
            base_url=os.environ.get("LLM_BASE_URL", ""),
            model=os.environ.get("LLM_MODEL", ""),
            trusted_base_url=True,
        )

    def complete(self, system: str, user: str, *, json_mode: bool = False) -> str:
        payload: dict = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        body = self._post(payload)
        try:
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError("Translation provider failed", retryable=True) from exc
        if not isinstance(content, str) or not content.strip():
            raise ProviderError("Translation provider failed", retryable=True)
        self._record_usage(body)
        return content

    def _post(self, payload: dict) -> dict:
        if not self._trusted_base_url:
            try:
                validate_base_url(self.base_url)
            except UnsafeBaseURLError as exc:
                logger.warning("openai_compat base URL rejected by SSRF guard")
                raise ProviderError("Translation provider failed", retryable=False) from exc
        req = urllib.request.Request(
            url=f"{self.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with _OPENER.open(req, timeout=request_timeout()) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            # 429 and 5xx are transient; 401/403/400 will fail the same way again.
            retryable = exc.code == 429 or exc.code >= 500
            logger.warning("openai_compat HTTP %d (retryable=%s)", exc.code, retryable)
            raise ProviderError("Translation provider failed", retryable=retryable) from exc
        except (OSError, ValueError) as exc:  # URLError, timeouts, bad JSON
            logger.warning("openai_compat request failed: %s", type(exc).__name__)
            raise ProviderError("Translation provider failed", retryable=True) from exc

    def _record_usage(self, body: dict) -> None:
        self.usage.calls += 1
        usage = body.get("usage") if isinstance(body, dict) else None
        if isinstance(usage, dict):
            self.usage.prompt_tokens += int(usage.get("prompt_tokens") or 0)
            self.usage.completion_tokens += int(usage.get("completion_tokens") or 0)
