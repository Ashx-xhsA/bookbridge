"""FastAPI route handlers wrapping bookbridge ingestion and harness modules."""

import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

from bookbridge.ingestion.chunker import build_chunk_manifest
from bookbridge.ingestion.pdf_reader import extract_pages
from bookbridge.worker_api.models import (
    HealthResponse,
    JobStatusResponse,
    TranslateChunkRequest,
    TranslateChunkResponse,
)

router = APIRouter()

# In-memory job store — replaced by PostgreSQL in S2-3
_jobs: dict[str, dict] = {}


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.post("/parse")
def parse(file: UploadFile) -> dict:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Only PDF files are accepted.")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(file.file.read())
        tmp_path = Path(tmp.name)

    try:
        pages = extract_pages(tmp_path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="Could not read the uploaded PDF.")
    finally:
        tmp_path.unlink(missing_ok=True)

    manifest = build_chunk_manifest(pages, source_file=file.filename)
    return manifest.to_dict()


@router.post("/translate/chunk", response_model=TranslateChunkResponse)
def translate_chunk(body: TranslateChunkRequest) -> TranslateChunkResponse:
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "queued", "chunk_id": body.chunk_id, "result": None}
    return TranslateChunkResponse(job_id=job_id)


@router.get("/job/{job_id}", response_model=JobStatusResponse)
def get_job(job_id: str) -> JobStatusResponse:
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JobStatusResponse(status=job["status"], result=job.get("result"))
