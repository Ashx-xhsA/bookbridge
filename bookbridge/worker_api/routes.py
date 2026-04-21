"""FastAPI route handlers wrapping bookbridge ingestion and harness modules."""

import logging
import re
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile

from bookbridge.harness import get_translator
from bookbridge.harness.translator import TranslatorError
from bookbridge.ingestion.chunker import build_chunk_manifest
from bookbridge.ingestion.pdf_reader import extract_pages
from bookbridge.worker_api.callback import post_worker_callback
from bookbridge.worker_api.models import (
    ChunkData,
    HealthResponse,
    JobStatusResponse,
    SummarizeRequest,
    SummarizeResponse,
    TranslateChunkAsyncRequest,
    TranslateChunkRequest,
    TranslateChunkResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_PDF_BYTES = 50 * 1024 * 1024  # 50 MB

# In-memory job store — used only by /parse for the deprecated async polling path.
# /translate/chunk is now synchronous and does not write here (ref issue #52).
_jobs: dict[str, dict] = {}

# Tight character set so arbitrary URL-unsafe or injection-flavoured values are
# rejected before reaching the translator or callback. Accepts UUIDs and CUIDs.
JOB_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{8,128}$")


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
            content="\n\n".join(pages.get(p, "") for p in range(c.start_page, c.end_page + 1)),
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


def translate_and_callback(job_id: str, source_text: str, target_lang: str) -> None:
    """Background-task worker: translate and POST the result back to Next.js.

    Never raises — any exception is caught and reported via the callback as
    FAILED with a generic error (no provider stack trace), so the BFF poller
    can surface it cleanly to the user.
    """
    try:
        translator = get_translator()
        translation = translator.translate(
            text=source_text,
            source_lang="en",
            target_lang=target_lang,
        )
    except Exception as exc:
        logger.warning(
            "background translation failed for job %s: %s",
            job_id,
            type(exc).__name__,
        )
        post_worker_callback(
            {
                "job_id": job_id,
                "status": "FAILED",
                "error": "Translation failed",
            }
        )
        return

    post_worker_callback(
        {
            "job_id": job_id,
            "status": "SUCCEEDED",
            "translated_content": translation,
        }
    )


@router.post("/translate/chunk/async", status_code=202)
def translate_chunk_async(
    body: TranslateChunkAsyncRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Accept translation job, return 202 immediately, run work in background.

    The background task POSTs the translation result back to Next.js via
    post_worker_callback so the BFF can write to Postgres (the Worker has no
    Postgres driver of its own).
    """
    if not JOB_ID_PATTERN.match(body.job_id):
        raise HTTPException(status_code=400, detail="Invalid job_id format")

    background_tasks.add_task(
        translate_and_callback,
        body.job_id,
        body.source_text,
        body.target_lang,
    )
    return {"job_id": body.job_id, "status": "accepted"}


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


@router.post("/summarize", response_model=SummarizeResponse)
def summarize(body: SummarizeRequest) -> SummarizeResponse:
    """Generate a short summary of the given text using the configured LLM."""
    import json
    import os
    import urllib.request

    api_key = os.environ.get("LLM_API_KEY", "")
    base_url = os.environ.get("LLM_BASE_URL", "").rstrip("/")
    model = os.environ.get("LLM_MODEL", "")
    if not api_key or not base_url or not model:
        raise HTTPException(status_code=500, detail="LLM provider not configured")

    system_prompt = (
        f"Summarize the following text in {body.max_words} words or fewer. "
        "Write a concise, informative summary suitable as a chapter overview. "
        "Return only the summary text."
    )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": body.text[:8000]},
        ],
        "temperature": 0,
    }

    req = urllib.request.Request(
        url=f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        content = result["choices"][0]["message"]["content"]
    except Exception as exc:
        logger.warning("summarize failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Summarization failed") from exc

    return SummarizeResponse(summary=content.strip())
