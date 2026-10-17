"""Harness: segment-level translation orchestration for the Worker.

`get_llm_client()` picks the chat client: explicit (per-user) credentials
always use the OpenAI-compatible client; otherwise TRANSLATION_PROVIDER
(default: mock) decides.
"""

import os

from bookbridge.harness.models import LLMClient
from bookbridge.harness.providers.mock import MockLLMClient
from bookbridge.harness.providers.openai_compat import OpenAICompatClient

PROVIDERS = ("mock", "openai_compat")


def get_llm_client(
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> LLMClient:
    """Return a chat client; missing base_url / model fall back to env vars."""
    if api_key:
        return OpenAICompatClient(
            api_key=api_key,
            base_url=base_url or os.environ.get("LLM_BASE_URL", ""),
            model=model or os.environ.get("LLM_MODEL", ""),
        )
    name = os.environ.get("TRANSLATION_PROVIDER", "mock").lower()
    if name == "mock":
        return MockLLMClient()
    if name == "openai_compat":
        return OpenAICompatClient.from_env()
    raise ValueError(f"Unknown TRANSLATION_PROVIDER: {name!r}. Expected one of: {PROVIDERS}")


__all__ = ["LLMClient", "get_llm_client"]
