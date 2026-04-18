"""FastAPI route handlers wrapping bookbridge ingestion and harness modules."""

import logging
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

from bookbridge.harness import get_translator
from bookbridge.harness.translator import TranslatorError
from bookbridge.ingestion.chunker import build_chunk_manifest
from bookbridge.ingestion.pdf_reader import extract_pages
from bookbridge.worker_api.models import (
    HealthResponse,
    JobStatusResponse,
    TranslateChunkRequest,
    TranslateChunkResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_PDF_BYTES = 50 * 1024 * 1024  # 50 MB

# In-memory job store — used only by /parse for the deprecated async polling path.
# /translate/chunk is now synchronous and does not write here (ref issue #52).
_jobs: dict[str, dict] = {}


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.post("/parse", response_model=TranslateChunkResponse)
def parse(file: UploadFile) -> TranslateChunkResponse:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Only PDF files are accepted.")
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=422, detail="Only PDF files are accepted.")

    data = file.file.read(MAX_PDF_BYTES + 1)
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF exceeds maximum allowed size (50 MB).")

    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(data)
            tmp_path = Path(tmp.name)
        pages = extract_pages(tmp_path)
        build_chunk_manifest(pages, source_file=file.filename)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=422, detail="Could not read the uploaded PDF.")
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "queued", "error": None}
    return TranslateChunkResponse(job_id=job_id)


@router.post("/translate/chunk", response_model=TranslateChunkResponse)
def translate_chunk(body: TranslateChunkRequest) -> TranslateChunkResponse:
    """Translate a chunk synchronously via the configured harness provider."""
    try:
        translator = get_translator()
    except ValueError as exc:
        logger.error("translator configuration error: %s", exc)
        raise HTTPException(status_code=500, detail="Translation provider misconfigured") from exc

    try:
        translation = translator.translate(
            text=body.source_text,
            source_lang="en",
            target_lang=body.target_lang,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except TranslatorError as exc:
        logger.warning("translator provider returned no result: %s", exc)
        raise HTTPException(status_code=502, detail="Translation provider failed") from exc
    except Exception as exc:
        logger.exception("translator raised unexpected error: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Translation provider failed") from exc

    return TranslateChunkResponse(
        job_id=str(uuid.uuid4()),
        status="completed",
        translation=translation,
    )


@router.get("/job/{job_id}", response_model=JobStatusResponse)
def get_job(job_id: str) -> JobStatusResponse:
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JobStatusResponse(job_id=job_id, status=job["status"], error=job.get("error"))
