"""Shared-secret HTTP POST back to Next.js with translation result.

The Python Worker has no Postgres driver — it cannot write to the DB directly.
After the background translator finishes we POST the result (or failure) to a
dedicated Next.js endpoint that verifies X-Worker-Secret and writes via Prisma.
Keeps DB access concentrated in one place and avoids adding a Python DB driver.

Env vars (read per call):
  - CALLBACK_BASE_URL      — fully-qualified base URL of the Next.js BFF
  - WORKER_CALLBACK_SECRET — shared with Next.js /api/internal/worker-callback
"""

from __future__ import annotations

import json
import logging
import os
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

CALLBACK_PATH = "/api/internal/worker-callback"
GLOSSARY_CALLBACK_PATH = "/api/internal/worker-callback/glossary"
REQUEST_TIMEOUT_SECONDS: float = 10.0


def post_glossary_callback(project_id: str, terms: list[dict]) -> None:
    """POST newly-extracted glossary terms to the Next.js glossary callback.

    No-op if env vars are missing (dev) or terms list is empty. Same
    non-raising contract as `post_worker_callback` — a failed glossary
    callback must not crash the background translation flow.
    """
    if not terms:
        return

    base = os.environ.get("CALLBACK_BASE_URL", "").rstrip("/")
    secret = os.environ.get("WORKER_CALLBACK_SECRET", "")
    if not base or not secret:
        logger.error(
            "glossary callback not configured (CALLBACK_BASE_URL / "
            "WORKER_CALLBACK_SECRET missing); %d term(s) for project %s will be lost",
            len(terms),
            project_id,
        )
        return

    url = f"{base}{GLOSSARY_CALLBACK_PATH}"
    body = json.dumps({"projectId": project_id, "terms": terms}).encode("utf-8")
    req = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Worker-Secret": secret,
        },
    )
    try:
        with urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            resp.read()
    except Exception as exc:
        logger.error("glossary callback to %s failed: %s", url, type(exc).__name__)


def post_worker_callback(payload: dict) -> None:
    """POST the translation result to the Next.js callback endpoint.

    No-op with an error log if env vars are missing (dev) — never raises,
    so a misconfigured callback does not crash the worker process.
    """
    base = os.environ.get("CALLBACK_BASE_URL", "").rstrip("/")
    secret = os.environ.get("WORKER_CALLBACK_SECRET", "")
    if not base or not secret:
        logger.error(
            "callback not configured (CALLBACK_BASE_URL / WORKER_CALLBACK_SECRET "
            "missing); job result for %s will be lost",
            payload.get("job_id"),
        )
        return

    url = f"{base}{CALLBACK_PATH}"
    body = json.dumps(payload).encode("utf-8")
    req = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Worker-Secret": secret,
        },
    )
    try:
        with urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            resp.read()
    except Exception as exc:
        # Broad catch is deliberate: urlopen can raise URLError, SSLError,
        # OSError (connect refused), ValueError (bad URL scheme), or
        # RemoteDisconnected. Any exception escaping this function crashes
        # FastAPI's BackgroundTasks runner and leaves the job stuck in PENDING.
        logger.error("callback to %s failed: %s", url, type(exc).__name__)
