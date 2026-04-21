"""Shared LLM call helper. Resolves credentials from request body or env vars."""

import json
import logging
import os
import urllib.request

from bookbridge.worker_api.models import LLMCredentials

logger = logging.getLogger(__name__)

PROVIDER_DEFAULTS: dict[str, tuple[str, str]] = {
    "openai": ("https://api.openai.com/v1", "gpt-4o-mini"),
    "deepseek": ("https://api.deepseek.com/v1", "deepseek-chat"),
    "claude": ("https://api.anthropic.com/v1", "claude-3-haiku-20240307"),
}


def resolve_credentials(
    llm: LLMCredentials | None = None,
) -> tuple[str, str, str]:
    """Return (api_key, base_url, model) from request-level creds or env vars."""
    api_key = (llm and llm.llm_api_key) or os.environ.get("LLM_API_KEY", "")
    base_url = (llm and llm.llm_base_url) or os.environ.get("LLM_BASE_URL", "")
    model = (llm and llm.llm_model) or os.environ.get("LLM_MODEL", "")
    return api_key, base_url.rstrip("/"), model


def chat_completion(
    *,
    system_prompt: str,
    user_content: str,
    llm: LLMCredentials | None = None,
    temperature: float = 0,
    timeout: float = 60,
    response_format: dict | None = None,
) -> str:
    """Call an OpenAI-compatible chat/completions endpoint and return the content.

    When `response_format` is provided (e.g. {"type": "json_object"}), it is
    passed through unchanged. Callers that want structured output are
    responsible for parsing the returned string themselves — this helper
    stays a thin passthrough.
    """
    api_key, base_url, model = resolve_credentials(llm)
    if not api_key or not base_url or not model:
        raise ValueError("LLM provider not configured")

    payload: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": temperature,
    }
    if response_format is not None:
        payload["response_format"] = response_format

    req = urllib.request.Request(
        url=f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=timeout) as resp:
        result = json.loads(resp.read())

    return result["choices"][0]["message"]["content"]
