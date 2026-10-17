"""Resolve the LLM client for a request: per-user credentials, else the env provider."""

from bookbridge.harness import get_llm_client
from bookbridge.harness.models import LLMClient
from bookbridge.worker_api.models import LLMCredentials


def client_for(llm: LLMCredentials | None) -> LLMClient:
    """User key → OpenAI-compatible client (base URL / model fall back to env).

    Without a user key the Worker's TRANSLATION_PROVIDER decides (mock in dev/CI).
    """
    if llm and llm.llm_api_key:
        return get_llm_client(
            api_key=llm.llm_api_key, base_url=llm.llm_base_url, model=llm.llm_model
        )
    return get_llm_client()
