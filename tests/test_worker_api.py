"""Failing tests for FastAPI worker endpoints (TDD red phase — issue #16)."""

import io
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from bookbridge.ingestion.models import ChunkInfo, ChunkManifest
from bookbridge.worker_api.main import create_app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


def test_health_check_returns_200(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "ok"


# ---------------------------------------------------------------------------
# POST /parse
# ---------------------------------------------------------------------------


def test_parse_endpoint_returns_job_id_and_status(client: TestClient) -> None:
    """POST /parse returns {"job_id": str, "status": "queued"} per API contract."""
    fake_manifest = ChunkManifest(
        source_file="test.pdf",
        total_pages=5,
        chunks=[ChunkInfo(chunk_id=1, title="Chapter 1", start_page=1, end_page=5, page_count=5)],
    )
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake")
    with (
        patch("bookbridge.worker_api.routes.extract_pages", return_value={1: "text"}),
        patch("bookbridge.worker_api.routes.build_chunk_manifest", return_value=fake_manifest),
    ):
        response = client.post(
            "/parse",
            files={"file": ("test.pdf", fake_pdf, "application/pdf")},
        )
    assert response.status_code == 200
    body = response.json()
    assert "job_id" in body
    assert isinstance(body["job_id"], str)
    assert body["status"] == "queued"


def test_parse_rejects_missing_file(client: TestClient) -> None:
    response = client.post("/parse")
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /translate/chunk
# ---------------------------------------------------------------------------


def test_translate_chunk_returns_translation(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """POST /translate/chunk runs harness synchronously and returns translation (issue #52)."""
    monkeypatch.setenv("TRANSLATION_PROVIDER", "mock")
    response = client.post(
        "/translate/chunk",
        json={
            "project_id": "proj-1",
            "chunk_id": "1",
            "source_text": "hello",
            "target_lang": "zh-Hans",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "job_id" in body and isinstance(body["job_id"], str)
    assert body["status"] == "completed"
    assert body["translation"] == "[zh-Hans] hello"


def test_translate_chunk_rejects_missing_source_text(client: TestClient) -> None:
    response = client.post(
        "/translate/chunk",
        json={"project_id": "proj-1", "chunk_id": "1", "target_lang": "zh-Hans"},
    )
    assert response.status_code == 422


def test_translate_chunk_rejects_invalid_target_lang(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TRANSLATION_PROVIDER", "mock")
    response = client.post(
        "/translate/chunk",
        json={
            "project_id": "proj-1",
            "chunk_id": "1",
            "source_text": "hello",
            "target_lang": "klingon",
        },
    )
    assert response.status_code == 422


def test_translate_chunk_propagates_provider_error_as_502(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Translator failures surface as 502 with a generic detail (no stack trace leak)."""
    monkeypatch.setenv("TRANSLATION_PROVIDER", "mock")

    def boom(*_a: object, **_kw: object) -> str:
        raise RuntimeError("provider internal failure with sensitive detail")

    with patch(
        "bookbridge.harness.providers.mock.MockTranslator.translate",
        side_effect=boom,
    ):
        response = client.post(
            "/translate/chunk",
            json={
                "project_id": "proj-1",
                "chunk_id": "1",
                "source_text": "hello",
                "target_lang": "zh-Hans",
            },
        )
    assert response.status_code == 502
    assert response.json()["detail"] == "Translation provider failed"
    assert "sensitive detail" not in response.text
    assert "Traceback" not in response.text


# ---------------------------------------------------------------------------
# GET /job/{job_id}
# ---------------------------------------------------------------------------


def test_get_job_status_returns_status_field(client: TestClient) -> None:
    # /translate/chunk is synchronous and no longer populates _jobs; seed via /parse instead.
    fake_manifest = ChunkManifest(
        source_file="t.pdf",
        total_pages=5,
        chunks=[ChunkInfo(chunk_id=1, title="C1", start_page=1, end_page=5, page_count=5)],
    )
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake")
    with (
        patch("bookbridge.worker_api.routes.extract_pages", return_value={1: "text"}),
        patch("bookbridge.worker_api.routes.build_chunk_manifest", return_value=fake_manifest),
    ):
        create = client.post("/parse", files={"file": ("t.pdf", fake_pdf, "application/pdf")})
    job_id = create.json()["job_id"]

    response = client.get(f"/job/{job_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["job_id"] == job_id
    assert "error" in body


def test_get_job_status_404_for_unknown_id(client: TestClient) -> None:
    response = client.get("/job/nonexistent-job-id")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Error handling — no stack traces exposed
# ---------------------------------------------------------------------------


def test_invalid_pdf_returns_422_no_stack_trace(client: TestClient) -> None:
    """An unreadable PDF returns 422 with no raw traceback in the response."""
    bad_pdf = io.BytesIO(b"this is not a pdf")
    response = client.post(
        "/parse",
        files={"file": ("bad.pdf", bad_pdf, "application/pdf")},
    )
    assert response.status_code == 422
    text = response.text
    assert "Traceback" not in text
    assert 'File "' not in text
