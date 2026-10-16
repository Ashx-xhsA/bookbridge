"""Worker book-bible scan: POST /bible/scan/async + bible callback."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

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
