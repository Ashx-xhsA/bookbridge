"""Failing tests for FastAPI worker endpoints (TDD red phase — issue #16)."""

import io
import pytest
from fastapi.testclient import TestClient

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
    """POST /parse with a minimal PDF-like file returns ChunkManifest JSON."""
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake pdf content")
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

def test_5xx_responses_contain_no_stack_traces(client: TestClient) -> None:
    """A bad parse (empty file) should return generic error, not a traceback."""
    empty = io.BytesIO(b"")
    response = client.post(
        "/parse",
        files={"file": ("empty.pdf", empty, "application/pdf")},
    )
    # 422 (validation) or 500 (processing error) — never a raw traceback
    assert response.status_code in (422, 500)
    text = response.text
    assert "Traceback" not in text
    assert "File \"" not in text
