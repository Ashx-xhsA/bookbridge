"""FastAPI route handlers wrapping bookbridge ingestion and harness modules."""

import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

from bookbridge.ingestion.chunker import build_chunk_manifest
from bookbridge.ingestion.pdf_reader import extract_pages
from bookbridge.worker_api.models import (
    ChunkData,
    HealthResponse,
    JobStatusResponse,
    TranslateChunkRequest,
    TranslateChunkResponse,
)

router = APIRouter()

MAX_PDF_BYTES = 50 * 1024 * 1024  # 50 MB

# In-memory job store — stub only; replaced by PostgreSQL in S2-3.
# Lost on any process restart (Railway ON_FAILURE policy makes this realistic).
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
        manifest = build_chunk_manifest(pages, source_file=file.filename)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=422, detail="Could not read the uploaded PDF.")
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)

    chunks = [
        ChunkData(
            chunk_id=c.chunk_id,
            title=c.title,
            start_page=c.start_page,
            end_page=c.end_page,
            page_count=c.page_count,
        )
        for c in manifest.chunks
    ]
    if not chunks:
        raise HTTPException(
            status_code=422,
            detail="No chapter markers found in the PDF.",
        )

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "completed", "chunks": chunks, "error": None}
    return TranslateChunkResponse(job_id=job_id, status="completed", chunks=chunks)


@router.post("/translate/chunk", response_model=TranslateChunkResponse)
def translate_chunk(body: TranslateChunkRequest) -> TranslateChunkResponse:
    job_id = str(uuid.uuid4())
    # Stub: enqueues job but does not invoke harness/ yet — wired in S2-3.
    _jobs[job_id] = {
        "status": "queued",
        "project_id": body.project_id,
        "chunk_id": body.chunk_id,
        "error": None,
    }
    return TranslateChunkResponse(job_id=job_id)


@router.get("/job/{job_id}", response_model=JobStatusResponse)
def get_job(job_id: str) -> JobStatusResponse:
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JobStatusResponse(
        job_id=job_id,
        status=job["status"],
        error=job.get("error"),
        chunks=job.get("chunks"),
    )
