"""Failing tests for FastAPI worker endpoints (TDD red phase — issue #16)."""

import io
import zipfile
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from bookbridge.worker_api.main import create_app
from tests.test_epub_reader import _epub3, _xhtml


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
# POST /parse  (EPUB / TXT)
# ---------------------------------------------------------------------------


def test_parse_txt_returns_chapters_with_paragraphs(client: TestClient) -> None:
    text = "CHAPTER I\n\nAlpha.\n\nCHAPTER II\n\nBeta.\n\nGamma."
    response = client.post(
        "/parse", files={"file": ("book.txt", io.BytesIO(text.encode()), "text/plain")}
    )
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["job_id"], str)
    assert body["status"] == "completed"
    assert body["chapters"] == [
        {"number": 1, "title": "CHAPTER I", "paragraphs": ["CHAPTER I", "Alpha."]},
        {"number": 2, "title": "CHAPTER II", "paragraphs": ["CHAPTER II", "Beta.", "Gamma."]},
    ]


def test_parse_epub_returns_chapters(client: TestClient) -> None:
    data = _epub3({"c1.xhtml": _xhtml("<p>Alpha.</p>")}, [("One", "c1.xhtml")])
    response = client.post(
        "/parse", files={"file": ("book.epub", io.BytesIO(data), "application/epub+zip")}
    )
    assert response.status_code == 200
    assert response.json()["chapters"] == [{"number": 1, "title": "One", "paragraphs": ["Alpha."]}]


def test_parse_rejects_pdf(client: TestClient) -> None:
    response = client.post(
        "/parse", files={"file": ("book.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
    )
    assert response.status_code == 422
    assert "EPUB" in response.json()["detail"]


def test_parse_rejects_oversized_upload(client: TestClient) -> None:
    with patch("bookbridge.worker_api.routes.MAX_UPLOAD_BYTES", 10):
        response = client.post(
            "/parse", files={"file": ("book.txt", io.BytesIO(b"x" * 11), "text/plain")}
        )
    assert response.status_code == 413


def test_parse_rejects_drm_epub_with_clear_message(client: TestClient) -> None:
    buf = io.BytesIO(_epub3({"c.xhtml": _xhtml("<p>x</p>")}, [("C", "c.xhtml")]))
    with zipfile.ZipFile(buf, "a") as zf:
        zf.writestr("META-INF/rights.xml", "<rights/>")
    response = client.post(
        "/parse", files={"file": ("drm.epub", io.BytesIO(buf.getvalue()), "application/epub+zip")}
    )
    assert response.status_code == 422
    assert "DRM" in response.json()["detail"]


def test_parse_empty_txt_returns_422(client: TestClient) -> None:
    response = client.post(
        "/parse", files={"file": ("empty.txt", io.BytesIO(b"  \n"), "text/plain")}
    )
    assert response.status_code == 422


def test_parse_rejects_missing_file(client: TestClient) -> None:
    response = client.post("/parse")
    assert response.status_code == 422


def test_job_polling_endpoint_is_removed(client: TestClient) -> None:
    assert client.get("/job/some-job-id").status_code == 404


# ---------------------------------------------------------------------------
# Chapter-level translate endpoints are gone (Phase 2: segment-level only)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("path", ["/translate/chunk", "/translate/chunk/async"])
def test_chunk_translate_endpoints_are_removed(client: TestClient, path: str) -> None:
    response = client.post(path, json={"source_text": "hi", "target_lang": "zh-Hans"})
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Error handling — no stack traces exposed
# ---------------------------------------------------------------------------


def test_invalid_epub_returns_422_no_stack_trace(client: TestClient) -> None:
    """An unreadable EPUB returns 422 with no raw traceback in the response."""
    response = client.post(
        "/parse",
        files={"file": ("bad.epub", io.BytesIO(b"not a zip"), "application/epub+zip")},
    )
    assert response.status_code == 422
    text = response.text
    assert "Traceback" not in text
    assert 'File "' not in text
