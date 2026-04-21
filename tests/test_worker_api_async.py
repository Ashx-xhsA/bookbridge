"""Failing (red) tests for issue #61 — Worker async translate endpoint.

The current /translate/chunk is synchronous and blocks on the LLM for 30-120 s
per chapter, which hard-fails on Vercel hobby tier (10 s function ceiling).
Issue #61 adds a new /translate/chunk/async endpoint that:

1. Accepts {job_id, source_text, target_lang}
2. Returns 202 immediately
3. Runs the translation in a FastAPI BackgroundTask
4. POSTs the result back to Next.js via a shared-secret callback (because the
   Python Worker has no Postgres driver — callback lets Next.js own the DB
   write via Prisma, avoiding a new Python dependency)

The callback target + secret are read from env vars:
  - CALLBACK_BASE_URL      — e.g. https://bookbridge.vercel.app
  - WORKER_CALLBACK_SECRET — shared with the Next.js /api/internal/worker-callback

These tests MUST fail until the endpoint and callback helper land.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from bookbridge.worker_api.main import create_app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


# ---------------------------------------------------------------------------
# POST /translate/chunk/async
# ---------------------------------------------------------------------------


def test_translate_chunk_async_returns_202_for_valid_request(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Endpoint accepts {job_id, source_text, target_lang} and returns 202 + body."""
    monkeypatch.setenv("TRANSLATION_PROVIDER", "mock")
    monkeypatch.setenv("CALLBACK_BASE_URL", "https://example.invalid")
    monkeypatch.setenv("WORKER_CALLBACK_SECRET", "test-secret")

    with patch("bookbridge.worker_api.routes.post_worker_callback") as mock_cb:
        response = client.post(
            "/translate/chunk/async",
            json={
                "job_id": "clh3p7b1p0003qzrmkf8g4m0k",
                "source_text": "Der Hund biss den Mann.",
                "target_lang": "zh-Hans",
            },
        )

    assert response.status_code == 202
    body = response.json()
    assert body["job_id"] == "clh3p7b1p0003qzrmkf8g4m0k"
    assert body["status"] == "accepted"
    # Background task runs synchronously in TestClient — callback should fire
    assert mock_cb.called


def test_translate_chunk_async_rejects_malformed_job_id_with_400(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Malformed job_id → 400, not 500 (per issue #61 Security DoD)."""
    monkeypatch.setenv("TRANSLATION_PROVIDER", "mock")
    response = client.post(
        "/translate/chunk/async",
        json={
            "job_id": "not valid!!",
            "source_text": "Der Hund biss den Mann.",
            "target_lang": "zh-Hans",
        },
    )
    assert response.status_code == 400


def test_translate_chunk_async_background_posts_success_callback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """On translator success, background task POSTs SUCCEEDED + translated_content."""
    from bookbridge.worker_api import routes

    monkeypatch.setenv("TRANSLATION_PROVIDER", "mock")

    fake_translator = MagicMock()
    fake_translator.translate.return_value = "狗咬了那个男人。"

    calls: list[dict] = []

    def capture_callback(payload: dict) -> None:
        calls.append(payload)

    with (
        patch.object(routes, "get_translator", return_value=fake_translator),
        patch.object(routes, "post_worker_callback", side_effect=capture_callback),
    ):
        routes.translate_and_callback(
            job_id="clh3p7b1p0003qzrmkf8g4m0k",
            source_text="Der Hund biss den Mann.",
            target_lang="zh-Hans",
        )

    assert len(calls) == 1
    payload = calls[0]
    assert payload["job_id"] == "clh3p7b1p0003qzrmkf8g4m0k"
    assert payload["status"] == "SUCCEEDED"
    assert payload["translated_content"] == "狗咬了那个男人。"


def test_translate_chunk_async_background_posts_failure_callback_on_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """On translator exception, background task POSTs FAILED + generic error.

    Security DoD: failed jobs store generic error text — no provider stack trace.
    """
    from bookbridge.worker_api import routes

    fake_translator = MagicMock()
    fake_translator.translate.side_effect = RuntimeError(
        "DeepSeek returned 503 with stack trace AAA/BBB/CCC"
    )

    calls: list[dict] = []

    def capture_callback(payload: dict) -> None:
        calls.append(payload)

    with (
        patch.object(routes, "get_translator", return_value=fake_translator),
        patch.object(routes, "post_worker_callback", side_effect=capture_callback),
    ):
        routes.translate_and_callback(
            job_id="clh3p7b1p0003qzrmkf8g4m0k",
            source_text="Der Hund biss den Mann.",
            target_lang="zh-Hans",
        )

    assert len(calls) == 1
    payload = calls[0]
    assert payload["job_id"] == "clh3p7b1p0003qzrmkf8g4m0k"
    assert payload["status"] == "FAILED"
    # Generic error text only — no provider stack trace / URL / response body
    assert "DeepSeek" not in payload.get("error", "")
    assert "503" not in payload.get("error", "")
    assert "AAA" not in payload.get("error", "")
    assert "translated_content" not in payload or payload["translated_content"] is None


# ---------------------------------------------------------------------------
# post_worker_callback helper — shared-secret HTTP POST to Next.js
# ---------------------------------------------------------------------------


def test_post_worker_callback_swallows_non_urlerror_exceptions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Addresses C.L.E.A.R. MUST FIX #4 — any exception raised by urlopen must
    be caught so the FastAPI background task runner never crashes. urlopen can
    raise ValueError (bad scheme), ssl.SSLError, OSError, etc., not just URLError.
    """
    from bookbridge.worker_api import callback

    monkeypatch.setenv("CALLBACK_BASE_URL", "https://bookbridge.example.test")
    monkeypatch.setenv("WORKER_CALLBACK_SECRET", "any-secret")

    def raise_ssl_error(req, timeout):  # noqa: ANN001, ARG001
        import ssl

        raise ssl.SSLError("fake SSL handshake failure")

    with patch.object(callback, "urlopen", raise_ssl_error):
        # Must not raise — just logs.
        callback.post_worker_callback({"job_id": "x" * 10, "status": "FAILED", "error": "test"})


def test_post_worker_callback_sends_secret_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Callback must include X-Worker-Secret header so Next.js can verify origin."""
    from bookbridge.worker_api import callback

    monkeypatch.setenv("CALLBACK_BASE_URL", "https://bookbridge.example.test")
    monkeypatch.setenv("WORKER_CALLBACK_SECRET", "shared-secret-xyz")

    captured: list[tuple[str, dict]] = []

    class FakeResponse:
        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def read(self) -> bytes:
            return b""

    def fake_urlopen(req, timeout):  # noqa: ANN001
        captured.append((req.full_url, dict(req.headers)))
        return FakeResponse()

    with patch.object(callback, "urlopen", fake_urlopen):
        callback.post_worker_callback(
            {
                "job_id": "clh3p7b1p0003qzrmkf8g4m0k",
                "status": "SUCCEEDED",
                "translated_content": "狗咬了那个男人。",
            }
        )

    assert len(captured) == 1
    url, headers = captured[0]
    assert url == "https://bookbridge.example.test/api/internal/worker-callback"
    # urllib normalizes header keys to Title-Case
    assert headers.get("X-worker-secret") == "shared-secret-xyz"
    assert headers.get("Content-type") == "application/json"
