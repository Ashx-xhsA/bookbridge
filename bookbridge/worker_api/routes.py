"""FastAPI route handlers wrapping bookbridge ingestion and harness modules."""

import logging
import re
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile

from bookbridge.harness.config import TranslationConfig
from bookbridge.harness.models import ContextSegment, GlossaryEntry, LLMClient, SegmentsResult
from bookbridge.harness.pipeline import extract_terms, translate_segments
from bookbridge.ingestion.epub_reader import read_epub
from bookbridge.ingestion.models import Book, IngestionError
from bookbridge.ingestion.txt_reader import read_txt
from bookbridge.worker_api.callback import (
    post_glossary_callback,
    post_worker_callback,
)
from bookbridge.worker_api.llm import client_for
from bookbridge.worker_api.models import (
    ChapterData,
    HealthResponse,
    ParseResponse,
    SummarizeRequest,
    SummarizeResponse,
    TranslateSegmentsAsyncRequest,
)

logger = logging.getLogger(__name__)

SUMMARY_SOURCE_CHARS = 8000


router = APIRouter()

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
UNSUPPORTED_FORMAT = "Only EPUB and TXT files are accepted."
_READERS = {".epub": read_epub, ".txt": read_txt}
_CONTENT_TYPES = {
    ".epub": {"application/epub+zip", "application/octet-stream"},
    ".txt": {"text/plain", "application/octet-stream"},
}

# Tight character set so arbitrary URL-unsafe or injection-flavoured values are
# rejected before reaching the translator or callback. Accepts UUIDs and CUIDs.
JOB_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{8,128}$")


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


def _suffix(filename: str | None) -> str:
    name = (filename or "").lower()
    return next((ext for ext in _READERS if name.endswith(ext)), "")


@router.post("/parse", response_model=ParseResponse)
def parse(file: UploadFile) -> ParseResponse:
    """Parse an EPUB or TXT upload into chapters of paragraphs."""
    suffix = _suffix(file.filename)
    content_type = (file.content_type or "").split(";")[0].strip()
    if not suffix or content_type not in _CONTENT_TYPES[suffix]:
        raise HTTPException(status_code=422, detail=UNSUPPORTED_FORMAT)

    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds maximum allowed size (50 MB).")

    try:
        book: Book = _READERS[suffix](data, source_file=file.filename or "")
    except IngestionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("parse failed for %s upload", suffix)
        raise HTTPException(status_code=422, detail="Could not read the uploaded book.") from exc

    chapters = [
        ChapterData(number=c.number, title=c.title, paragraphs=c.paragraphs) for c in book.chapters
    ]
    return ParseResponse(job_id=str(uuid.uuid4()), status="completed", chapters=chapters)


def _glossary(body: TranslateSegmentsAsyncRequest) -> list[GlossaryEntry]:
    return [
        GlossaryEntry(
            english=g.english,
            translation=g.translation,
            category=g.category,
            approved=g.approved,
            aliases=tuple(g.aliases),
        )
        for g in body.glossary
    ]


def _summarize(llm: LLMClient, text: str, max_words: int = 100) -> str | None:
    """Best-effort chapter summary; a failure never fails the translation job."""
    system = (
        f"Summarize the following text in {max_words} words or fewer. "
        "Write a concise, informative summary suitable as a chapter overview. "
        "Return only the summary text in English."
    )
    try:
        return llm.complete(system, text[:SUMMARY_SOURCE_CHARS]).strip() or None
    except Exception as exc:
        logger.warning("summary failed: %s", type(exc).__name__)
        return None


def _post_new_terms(
    llm: LLMClient,
    body: TranslateSegmentsAsyncRequest,
    glossary: list[GlossaryEntry],
    result: SegmentsResult,
) -> None:
    pairs = [
        (seg.source, text)
        for seg, text in zip(body.segments, result.translations, strict=True)
        if text is not None
    ]
    terms = extract_terms(llm, pairs, target_lang=body.target_lang, glossary=glossary)
    if terms and body.project_id:
        post_glossary_callback(
            project_id=body.project_id,
            terms=[
                {"english": t.english, "translation": t.translation, "category": t.category}
                for t in terms
            ],
        )


def _result_payload(body: TranslateSegmentsAsyncRequest, result: SegmentsResult) -> dict:
    done = [
        {"index": seg.index, "translation": text}
        for seg, text in zip(body.segments, result.translations, strict=True)
        if text is not None
    ]
    failed = [body.segments[i].index for i in result.failed]
    payload: dict = {
        "job_id": body.job_id,
        "status": "FAILED" if failed else "SUCCEEDED",
        "segments": done,
        "failed_indices": failed,
    }
    if failed:
        payload["error"] = f"{len(failed)} of {len(body.segments)} segments failed to translate"
    return payload


def run_translation_job(body: TranslateSegmentsAsyncRequest) -> None:
    """Background task: translate segments, extract terms, POST results to the BFF.

    Never raises — anything unexpected becomes a FAILED callback with a
    generic error so no provider detail reaches the client (A09).
    """
    try:
        llm = client_for(body.llm)
        glossary = _glossary(body)
        result = translate_segments(
            llm,
            [s.source for s in body.segments],
            target_lang=body.target_lang,
            glossary=glossary,
            preceding=[ContextSegment(p.source, p.translation) for p in body.preceding],
            config=TranslationConfig(**body.config.model_dump()),
        )
        if body.project_id:
            _post_new_terms(llm, body, glossary, result)
        payload = _result_payload(body, result)
    except Exception as exc:
        logger.warning("translation job %s failed: %s", body.job_id, type(exc).__name__)
        post_worker_callback(
            {"job_id": body.job_id, "status": "FAILED", "error": "Translation failed"}
        )
        return
    summary = _summarize(llm, "\n\n".join(s.source for s in body.segments))
    if summary:
        payload["summary"] = summary
    post_worker_callback(payload)


@router.post("/translate/segments/async", status_code=202)
def translate_segments_async(
    body: TranslateSegmentsAsyncRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Accept a segment translation job, return 202, run it in the background."""
    if not JOB_ID_PATTERN.match(body.job_id):
        raise HTTPException(status_code=400, detail="Invalid job_id format")
    background_tasks.add_task(run_translation_job, body)
    return {"job_id": body.job_id, "status": "accepted"}


@router.post("/summarize", response_model=SummarizeResponse)
def summarize(body: SummarizeRequest) -> SummarizeResponse:
    """Generate a short summary of the given text using the configured LLM."""
    system_prompt = (
        f"Summarize the following text in {body.max_words} words or fewer. "
        "Write a concise, informative summary suitable as a chapter overview. "
        "Return only the summary text."
    )
    try:
        content = client_for(body.llm).complete(system_prompt, body.text[:SUMMARY_SOURCE_CHARS])
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="LLM provider not configured") from exc
    except Exception as exc:
        logger.warning("summarize failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Summarization failed") from exc

    return SummarizeResponse(summary=content.strip())
