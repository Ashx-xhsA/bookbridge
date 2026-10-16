"""Worker async segment translation: POST /translate/segments/async + callbacks.

The endpoint returns 202 at once; a BackgroundTask runs the harness pipeline
and POSTs per-segment results back to the BFF (which owns the DB). New
glossary terms come from a separate extraction call and go to the glossary
callback.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from bookbridge.harness.models import ProviderError
from bookbridge.harness.prompts import BIBLE_HEADING, CONTEXT_HEADING
from bookbridge.harness.providers.openai_compat import OpenAICompatClient
from bookbridge.worker_api import routes
from bookbridge.worker_api.main import create_app
from bookbridge.worker_api.models import LLMCredentials, TranslateSegmentsAsyncRequest
from tests.test_harness import ScriptedClient, _echo, _segments_in, _terms_json

JOB_ID = "clh3p7b1p0003qzrmkf8g4m0k"


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


def _body(**overrides: object) -> dict:
    body: dict = {
        "job_id": JOB_ID,
        "target_lang": "zh-Hans",
        "segments": [{"index": 0, "source": "Frodo ran."}, {"index": 2, "source": "Sam."}],
    }
    body.update(overrides)
    return body


def _run(scripted: ScriptedClient, **overrides: object) -> tuple[list[dict], list[dict]]:
    """Run the background job with a scripted client; return (job, glossary) callbacks."""
    jobs: list[dict] = []
    terms: list[dict] = []
    with (
        patch.object(routes, "client_for", return_value=scripted),
        patch.object(routes, "post_worker_callback", side_effect=jobs.append),
        patch.object(routes, "post_glossary_callback", side_effect=lambda **kw: terms.append(kw)),
    ):
        routes.run_translation_job(TranslateSegmentsAsyncRequest(**_body(**overrides)))
    return jobs, terms


def _translate_or_extract(system: str, user: str, json_mode: bool) -> str:
    if json_mode:
        return _terms_json("Frodo")
    if "<<<" not in user:  # summary call
        return "A short summary."
    return _echo(system, user, json_mode)


# ---------------------------------------------------------------------------
# Endpoint contract
# ---------------------------------------------------------------------------


def test_returns_202_and_runs_job(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRANSLATION_PROVIDER", "mock")
    jobs: list[dict] = []
    with patch.object(routes, "post_worker_callback", side_effect=jobs.append):
        response = client.post("/translate/segments/async", json=_body())
    assert response.status_code == 202
    assert response.json() == {"job_id": JOB_ID, "status": "accepted"}
    payload = jobs[-1]  # after one RUNNING progress callback
    assert [j["status"] for j in jobs] == ["RUNNING", "SUCCEEDED"]
    assert payload["status"] == "SUCCEEDED"
    assert payload["segments"] == [
        {"index": 0, "translation": "[zh-Hans] Frodo ran."},
        {"index": 2, "translation": "[zh-Hans] Sam."},
    ]


def test_rejects_malformed_job_id(client: TestClient) -> None:
    response = client.post("/translate/segments/async", json=_body(job_id="not valid!!"))
    assert response.status_code == 400


@pytest.mark.parametrize(
    "overrides",
    [
        {"target_lang": "klingon"},
        {"segments": []},
        {"segments": [{"index": -1, "source": "x"}]},
        {"segments": [{"index": 0, "source": ""}]},
        {"segments": [{"index": 0, "source": "a"}, {"index": 0, "source": "b"}]},
        {"config": {"glossary_mode": "vector"}},
        {"config": {"context_window": 11}},
        {"config": {"max_batch_chars": 0}},
        {"preceding": [{"source": "x"}] * 11},
        {"glossary": [{"english": "A", "translation": "a", "alias_of": {"english": "B"}}]},
        {"bible": {"style_guide": "x" * 5001}},
        {"config": {"book_bible": "maybe"}},
    ],
)
def test_rejects_invalid_body_with_422(client: TestClient, overrides: dict) -> None:
    response = client.post("/translate/segments/async", json=_body(**overrides))
    assert response.status_code == 422


def test_rejects_oversized_total_source(client: TestClient) -> None:
    big = [{"index": i, "source": "x" * 20_000} for i in range(60)]
    response = client.post("/translate/segments/async", json=_body(segments=big))
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Background job
# ---------------------------------------------------------------------------


def test_success_payload_maps_results_to_segment_indices() -> None:
    jobs, _ = _run(ScriptedClient(_translate_or_extract))
    payload = jobs[-1]
    assert payload["job_id"] == JOB_ID
    assert payload["status"] == "SUCCEEDED"
    assert [s["index"] for s in payload["segments"]] == [0, 2]
    assert payload["segments"][0]["translation"] == "T:Frodo ran."
    assert payload["failed_indices"] == []
    assert payload["summary"] == "A short summary."


def test_progress_callbacks_after_each_batch_then_final() -> None:
    jobs, _ = _run(ScriptedClient(_translate_or_extract), config={"max_batch_chars": 1})
    assert [j["status"] for j in jobs] == ["RUNNING", "RUNNING", "SUCCEEDED"]
    assert jobs[0]["segments"] == [{"index": 0, "translation": "T:Frodo ran."}]
    assert jobs[1]["segments"] == [{"index": 2, "translation": "T:Sam."}]


def test_partial_failure_reports_successes_and_failed_indices() -> None:
    def respond(system: str, user: str, json_mode: bool) -> str:
        if not json_mode and "<<<" in user and "Sam." in _segments_in(user):
            return ""  # cannot be aligned
        return _translate_or_extract(system, user, json_mode)

    jobs, _ = _run(ScriptedClient(respond))
    payload = jobs[-1]
    assert payload["status"] == "FAILED"
    assert payload["segments"] == [{"index": 0, "translation": "T:Frodo ran."}]
    assert payload["failed_indices"] == [2]
    assert "1 of 2" in payload["error"]


def test_provider_failure_stops_and_keeps_finished_segments() -> None:
    def respond(system: str, user: str, json_mode: bool) -> str:
        if not json_mode and "<<<" in user and "Sam." in _segments_in(user):
            raise ProviderError("401 body=secret-token", retryable=False)
        return _translate_or_extract(system, user, json_mode)

    jobs, _ = _run(ScriptedClient(respond), config={"max_batch_chars": 1})
    payload = jobs[-1]
    assert payload["status"] == "FAILED"
    assert payload["segments"] == [{"index": 0, "translation": "T:Frodo ran."}]
    assert payload["error"] == "Translation provider failed; finished segments were kept"
    assert "secret" not in str(payload)


def test_term_extraction_failure_does_not_change_the_job() -> None:
    def respond(system: str, user: str, json_mode: bool) -> str:
        if json_mode:
            raise RuntimeError("extraction exploded")
        return _translate_or_extract(system, user, json_mode)

    jobs, terms = _run(ScriptedClient(respond), project_id="proj_123456")
    assert jobs[-1]["status"] == "SUCCEEDED"
    assert terms == []


def test_unexpected_exception_posts_generic_failure() -> None:
    def respond(system: str, user: str, json_mode: bool) -> str:
        raise RuntimeError("DeepSeek returned 503 with stack trace AAA")

    jobs, terms = _run(ScriptedClient(respond))
    payload = jobs[-1]
    assert payload["status"] == "FAILED"
    assert payload["error"] == "Translation failed"
    assert "segments" not in payload
    assert terms == []


def test_client_configuration_error_posts_failure() -> None:
    jobs: list[dict] = []
    with (
        patch.object(routes, "client_for", side_effect=ValueError("LLM provider not configured")),
        patch.object(routes, "post_worker_callback", side_effect=jobs.append),
    ):
        routes.run_translation_job(TranslateSegmentsAsyncRequest(**_body()))
    assert jobs == [{"job_id": JOB_ID, "status": "FAILED", "error": "Translation failed"}]


def test_new_terms_posted_when_project_id_given() -> None:
    _, terms = _run(ScriptedClient(_translate_or_extract), project_id="proj_123456")
    assert terms == [
        {
            "project_id": "proj_123456",
            "terms": [{"english": "Frodo", "translation": "译Frodo", "category": "person"}],
        }
    ]


def test_no_extraction_without_project_id() -> None:
    scripted = ScriptedClient(_translate_or_extract)
    _, terms = _run(scripted)
    assert terms == []
    assert not any(json_mode for _, _, json_mode in scripted.calls)


def test_config_and_preceding_reach_the_prompt() -> None:
    scripted = ScriptedClient(_translate_or_extract)
    _run(scripted, preceding=[{"source": "Before.", "translation": "之前。"}])
    assert "之前。" in scripted.calls[0][1]

    scripted = ScriptedClient(_translate_or_extract)
    _run(
        scripted,
        preceding=[{"source": "Before.", "translation": "之前。"}],
        config={"context_window": 0},
    )
    assert all(CONTEXT_HEADING not in user for _, user, _ in scripted.calls)


def test_alias_rows_reach_the_prompt_with_referent() -> None:
    scripted = ScriptedClient(_translate_or_extract)
    glossary = [
        {
            "english": "Mithrandir",
            "translation": "米斯兰达",
            "alias_of": {"english": "Gandalf", "translation": "甘道夫"},
        }
    ]
    _run(scripted, glossary=glossary, segments=[{"index": 0, "source": "Mithrandir came."}])
    system = scripted.calls[0][0]
    assert "Mithrandir → 米斯兰达" in system and "Gandalf / 甘道夫" in system


def test_bible_reaches_the_prompt_and_switch_removes_it() -> None:
    bible = {
        "style_guide": "Keep it terse.",
        "characters": [{"name": "Frodo", "translation": "弗罗多", "voice": "Earnest."}],
    }
    scripted = ScriptedClient(_translate_or_extract)
    _run(scripted, bible=bible)
    assert "Keep it terse." in scripted.calls[0][0]
    assert "Earnest." in scripted.calls[0][0]  # "Frodo ran." is in the batch

    scripted = ScriptedClient(_translate_or_extract)
    _run(scripted, bible=bible, config={"book_bible": False})
    assert all(BIBLE_HEADING not in system for system, _, _ in scripted.calls)


# ---------------------------------------------------------------------------
# client_for — per-user credentials win over env
# ---------------------------------------------------------------------------


def test_client_for_uses_user_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRANSLATION_PROVIDER", "mock")
    creds = LLMCredentials(
        llm_api_key="sk-user", llm_base_url="https://api.deepseek.com/v1", llm_model="deepseek-chat"
    )
    llm = routes.client_for(creds)
    assert isinstance(llm, OpenAICompatClient)
    assert llm.model == "deepseek-chat"


def test_client_for_falls_back_to_env_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRANSLATION_PROVIDER", "mock")
    assert not isinstance(routes.client_for(None), OpenAICompatClient)
    assert not isinstance(routes.client_for(LLMCredentials()), OpenAICompatClient)


# ---------------------------------------------------------------------------
# post_worker_callback helper — shared-secret HTTP POST to Next.js
# ---------------------------------------------------------------------------


def test_post_worker_callback_swallows_non_urlerror_exceptions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Any exception from urlopen must be caught so the background runner never crashes."""
    from bookbridge.worker_api import callback

    monkeypatch.setenv("CALLBACK_BASE_URL", "https://bookbridge.example.test")
    monkeypatch.setenv("WORKER_CALLBACK_SECRET", "any-secret")

    def raise_ssl_error(req, timeout):  # noqa: ANN001, ARG001
        import ssl

        raise ssl.SSLError("fake SSL handshake failure")

    with patch.object(callback, "urlopen", raise_ssl_error), patch.object(callback.time, "sleep"):
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
        def __enter__(self) -> FakeResponse:
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def read(self) -> bytes:
            return b""

    def fake_urlopen(req, timeout):  # noqa: ANN001, ARG001
        captured.append((req.full_url, dict(req.headers)))
        return FakeResponse()

    with patch.object(callback, "urlopen", fake_urlopen):
        callback.post_worker_callback({"job_id": JOB_ID, "status": "FAILED", "error": "x"})

    [(url, headers)] = captured
    assert url == "https://bookbridge.example.test/api/internal/worker-callback"
    assert headers.get("X-worker-secret") == "shared-secret-xyz"
    assert headers.get("Content-type") == "application/json"


def test_new_terms_are_posted_in_chunks_the_bff_accepts() -> None:
    names = [f"Name{i:03d}" for i in range(250)]

    def respond(system: str, user: str, json_mode: bool) -> str:
        return _terms_json(*names) if json_mode else _translate_or_extract(system, user, False)

    _, terms = _run(ScriptedClient(respond), project_id="proj_123456")
    assert [len(call["terms"]) for call in terms] == [200, 50]
