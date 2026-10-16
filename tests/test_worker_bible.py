"""Worker book-bible scan: POST /bible/scan/async + bible callback."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from bookbridge.harness.models import TranslatorError
from bookbridge.worker_api import routes
from bookbridge.worker_api.main import create_app
from bookbridge.worker_api.models import BibleScanAsyncRequest
from tests.test_harness import ScriptedClient
from tests.test_prescan import Router, _entity

JOB_ID = "clh3p7b1p0003qzrmkf8g4m0k"
PROJECT_ID = "clh3p7b1p0001qzrmkf8g4m0i"
CHAPTERS = [["Georg wrote to his friend.", '"Georg," said Frieda.'], ["The river ran."]]


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


def _body(**overrides: object) -> dict:
    body: dict = {
        "job_id": JOB_ID,
        "project_id": PROJECT_ID,
        "target_lang": "zh-Hans",
        "chapters": CHAPTERS,
    }
    body.update(overrides)
    return body


def _run(scripted: ScriptedClient) -> list[dict]:
    posted: list[dict] = []
    with (
        patch.object(routes, "client_for", return_value=scripted),
        patch.object(routes, "post_bible_callback", side_effect=posted.append),
    ):
        routes.run_bible_scan(BibleScanAsyncRequest(**_body()))
    return posted


def test_returns_202_and_posts_bible(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRANSLATION_PROVIDER", "mock")
    posted: list[dict] = []
    with patch.object(routes, "post_bible_callback", side_effect=posted.append):
        response = client.post("/bible/scan/async", json=_body())
    assert response.status_code == 202
    assert response.json() == {"job_id": JOB_ID, "status": "accepted"}
    [payload] = posted
    assert payload["status"] == "SUCCEEDED"
    assert payload["project_id"] == PROJECT_ID
    assert "Georg" in [e["english"] for e in payload["entities"]]


def test_rejects_malformed_job_id(client: TestClient) -> None:
    assert client.post("/bible/scan/async", json=_body(job_id="bad id!")).status_code == 400


@pytest.mark.parametrize(
    "overrides",
    [
        {"chapters": []},
        {"chapters": [["x" * 100_001]]},
        {"project_id": None},
        {"target_lang": "klingon"},
    ],
)
def test_rejects_invalid_body(client: TestClient, overrides: dict) -> None:
    assert client.post("/bible/scan/async", json=_body(**overrides)).status_code == 422


def test_rejects_oversized_book(client: TestClient) -> None:
    chapters = [["x" * 100_000] * 10 for _ in range(6)]  # 6M chars
    assert client.post("/bible/scan/async", json=_body(chapters=chapters)).status_code == 422


def test_payload_carries_entities_aliases_voice_and_style() -> None:
    router = Router(
        {
            "friend": [
                _entity(
                    "Georg",
                    "格奥尔格",
                    gender="male",
                    aliases=[{"name": "Mr. Bendemann", "translation": "本德曼先生"}],
                )
            ]
        }
    )
    [payload] = _run(router.client)
    assert payload["job_id"] == JOB_ID
    assert payload["style_guide"] == "Restrained, plain prose."
    [georg] = payload["entities"]
    assert georg == {
        "english": "Georg",
        "translation": "格奥尔格",
        "category": "person",
        "gender": "male",
        "notes": None,
        "voice": "voice of Georg",
        "mentions": 2,
        "aliases": [{"english": "Mr. Bendemann", "translation": "本德曼先生"}],
    }
    json.dumps(payload)  # must be serialisable as-is


def test_unexpected_error_posts_generic_failure() -> None:
    def respond(system: str, user: str, json_mode: bool) -> str:
        raise RuntimeError("upstream said: secret-token-123")

    [payload] = _run(ScriptedClient(respond))
    assert payload == {
        "job_id": JOB_ID,
        "project_id": PROJECT_ID,
        "status": "FAILED",
        "error": "Bible scan failed",
    }


def test_post_bible_callback_targets_bible_route(monkeypatch: pytest.MonkeyPatch) -> None:
    from bookbridge.worker_api import callback

    monkeypatch.setenv("CALLBACK_BASE_URL", "https://bookbridge.example.test")
    monkeypatch.setenv("WORKER_CALLBACK_SECRET", "s3cret")
    urls: list[str] = []

    class Resp:
        def __enter__(self) -> Resp:
            return self

        def __exit__(self, *a: object) -> None:
            return None

        def read(self) -> bytes:
            return b""

    def fake_urlopen(req, timeout):  # noqa: ANN001, ARG001
        urls.append(req.full_url)
        return Resp()

    with patch.object(callback, "urlopen", fake_urlopen):
        callback.post_bible_callback({"job_id": JOB_ID, "status": "FAILED"})
    assert urls == ["https://bookbridge.example.test/api/internal/worker-callback/bible"]


def test_payload_is_clamped_to_what_the_bff_accepts() -> None:
    long_alias = {"name": "x" * 201, "translation": "长"}
    aliases = [{"name": f"Alias{i}", "translation": f"别{i}"} for i in range(60)]
    router = Router(
        {
            "friend": [
                _entity(
                    "Georg",
                    "格" * 600,
                    gender="Male (young man)",
                    note="n" * 1500,
                    aliases=[long_alias, *aliases],
                ),
                _entity("N" + "a" * 250, "太长"),
            ]
        }
    )
    [payload] = _run(router.client)
    [georg] = payload["entities"]  # the 251-char name is dropped
    assert len(georg["translation"]) == 500
    assert len(georg["notes"]) == 1000
    assert georg["gender"] == "male"
    assert len(georg["aliases"]) == 50
    assert all(len(a["english"]) <= 200 for a in georg["aliases"])
    assert len(payload["style_guide"]) <= 5000


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("female", "female"),
        ("F", "female"),
        ("Male", "male"),
        ("unknown", "unknown"),
        ("robot", None),
        (None, None),
    ],
)
def test_gender_is_normalised(raw: str | None, expected: str | None) -> None:
    assert routes.normalise_gender(raw) == expected


def test_all_passages_failing_posts_failed_scan() -> None:
    def respond(system: str, user: str, json_mode: bool) -> str:
        raise TranslatorError("boom")

    [payload] = _run(ScriptedClient(respond))
    assert payload["status"] == "FAILED"


class _Resp:
    def __enter__(self) -> _Resp:
        return self

    def __exit__(self, *a: object) -> None:
        return None

    def read(self) -> bytes:
        return b""


def _http_error(code: int) -> Exception:
    import io
    import urllib.error

    return urllib.error.HTTPError("u", code, "x", {}, io.BytesIO(b""))  # type: ignore[arg-type]


@pytest.fixture()
def callback_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CALLBACK_BASE_URL", "https://bookbridge.example.test")
    monkeypatch.setenv("WORKER_CALLBACK_SECRET", "s3cret")


def test_callback_retries_transient_failures(callback_env: None) -> None:
    from bookbridge.worker_api import callback

    outcomes = [_http_error(503), TimeoutError(), _Resp()]

    def fake_urlopen(req, timeout):  # noqa: ANN001, ARG001
        out = outcomes.pop(0)
        if isinstance(out, Exception):
            raise out
        return out

    with (
        patch.object(callback, "urlopen", fake_urlopen),
        patch.object(callback.time, "sleep") as sleep,
    ):
        callback.post_worker_callback({"job_id": JOB_ID, "status": "FAILED"})
    assert outcomes == []
    assert sleep.call_count == 2


def test_callback_does_not_retry_client_errors(callback_env: None) -> None:
    from bookbridge.worker_api import callback

    calls: list[int] = []

    def fake_urlopen(req, timeout):  # noqa: ANN001, ARG001
        calls.append(1)
        raise _http_error(409)

    with patch.object(callback, "urlopen", fake_urlopen), patch.object(callback.time, "sleep"):
        callback.post_worker_callback({"job_id": JOB_ID, "status": "FAILED"})
    assert len(calls) == 1


def test_callback_gives_up_after_three_attempts(callback_env: None) -> None:
    from bookbridge.worker_api import callback

    calls: list[int] = []

    def fake_urlopen(req, timeout):  # noqa: ANN001, ARG001
        calls.append(1)
        raise _http_error(502)

    with patch.object(callback, "urlopen", fake_urlopen), patch.object(callback.time, "sleep"):
        callback.post_worker_callback({"job_id": JOB_ID, "status": "FAILED"})
    assert len(calls) == 3
