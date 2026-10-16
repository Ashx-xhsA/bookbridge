"""One retry policy for every LLM call: only transient provider errors retry.

Rate limits, 5xx and timeouts get two more tries with a growing pause; auth
and other client errors (and any non-provider failure) are raised at once so
a bad key costs one request, not hundreds.
"""

from __future__ import annotations

import logging
import time

from bookbridge.harness.models import LLMClient, ProviderError

logger = logging.getLogger(__name__)

BACKOFF_SECONDS: tuple[float, ...] = (1.0, 4.0)


def complete_with_retry(
    client: LLMClient, system: str, user: str, *, json_mode: bool = False
) -> str:
    for attempt, pause in enumerate((*BACKOFF_SECONDS, None), start=1):
        try:
            return client.complete(system, user, json_mode=json_mode)
        except ProviderError as exc:
            if not exc.retryable or pause is None:
                raise
            logger.warning("provider call %d failed (retryable); waiting %.0fs", attempt, pause)
            time.sleep(pause)
    raise AssertionError("unreachable")
