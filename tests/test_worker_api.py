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

def test_parse_endpoint_returns_chunk_manifest_shape(client: TestClient) -> None:
    """POST /parse returns ChunkManifest JSON (extract_pages mocked to avoid real PDF)."""
    fake_manifest = ChunkManifest(
        source_file="test.pdf",
        total_pages=5,
        chunks=[ChunkInfo(chunk_id=1, title="Chapter 1", start_page=1, end_page=5, page_count=5)],
    )
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake")
    with patch("bookbridge.worker_api.routes.extract_pages", return_value={1: "text"}), \
         patch("bookbridge.worker_api.routes.build_chunk_manifest", return_value=fake_manifest):
        response = client.post(
            "/parse",
            files={"file": ("test.pdf", fake_pdf, "application/pdf")},
        )
    assert response.status_code == 200
    body = response.json()
    assert "source_file" in body
    assert "total_pages" in body
    assert "chunks" in body
    assert isinstance(body["chunks"], list)


def test_parse_rejects_missing_file(client: TestClient) -> None:
    response = client.post("/parse")
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /translate/chunk
# ---------------------------------------------------------------------------

def test_translate_chunk_returns_job_id(client: TestClient) -> None:
    """POST /translate/chunk returns a job_id string."""
    response = client.post("/translate/chunk", json={"chunk_id": "1"})
    assert response.status_code == 200
    body = response.json()
    assert "job_id" in body
    assert isinstance(body["job_id"], str)


def test_translate_chunk_rejects_missing_chunk_id(client: TestClient) -> None:
    response = client.post("/translate/chunk", json={})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /job/{job_id}
# ---------------------------------------------------------------------------

def test_get_job_status_returns_status_field(client: TestClient) -> None:
    response = client.get("/job/some-job-id")
    assert response.status_code in (200, 404)
    if response.status_code == 200:
        body = response.json()
        assert "status" in body


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
