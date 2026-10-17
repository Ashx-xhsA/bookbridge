"""FastAPI route handlers wrapping bookbridge ingestion and harness modules."""

import logging
import re
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile

from bookbridge.harness.config import TranslationConfig
from bookbridge.harness.models import (
    AliasTarget,
    BookBible,
    ContextSegment,
    GlossaryEntry,
    LLMClient,
    SegmentsResult,
)
from bookbridge.harness.pipeline import SegmentOutcome, extract_terms, translate_segments
from bookbridge.harness.prescan import ScannedEntity, ScanStopped, scan_book
from bookbridge.ingestion.epub_reader import read_epub
from bookbridge.ingestion.models import Book, IngestionError
from bookbridge.ingestion.txt_reader import read_txt
from bookbridge.worker_api.callback import (
    post_bible_callback,
    post_glossary_callback,
    post_scan_progress,
    post_worker_callback,
)
from bookbridge.worker_api.llm import client_for
from bookbridge.worker_api.models import (
    BibleScanAsyncRequest,
    ChapterData,
    HealthResponse,
    ParseResponse,
    SummarizeRequest,
    SummarizeResponse,
    TranslateSegmentsAsyncRequest,
)

logger = logging.getLogger(__name__)

SUMMARY_SOURCE_CHARS = 8000
# Matches the BFF glossary callback's max terms per request.
GLOSSARY_CALLBACK_BATCH = 200
# Matches the BFF worker-callback limit on review issues per segment.
MAX_SEGMENT_ISSUES = 20
# Entities are sorted by mentions; the long tail past this is noise for review.
MAX_BIBLE_ENTITIES = 1000


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
            alias_of=AliasTarget(g.alias_of.english, g.alias_of.translation)
            if g.alias_of
            else None,
        )
        for g in body.glossary
    ]


def _bible(body: TranslateSegmentsAsyncRequest) -> BookBible | None:
    if body.bible is None:
        return None
    return BookBible(overview=body.bible.style_guide)


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
    """Best-effort: runs after the job result is stored, so it can't lose it."""
    pairs = [
        (seg.source, text)
        for seg, text in zip(body.segments, result.translations, strict=True)
        if text is not None
    ]
    try:
        terms = extract_terms(llm, pairs, target_lang=body.target_lang, glossary=glossary)
    except Exception as exc:
        logger.warning("term extraction for job %s failed: %s", body.job_id, type(exc).__name__)
        return
    rows = [
        {"english": t.english, "translation": t.translation, "category": t.category} for t in terms
    ]
    for start in range(0, len(rows), GLOSSARY_CALLBACK_BATCH):
        post_glossary_callback(
            project_id=body.project_id or "",
            terms=rows[start : start + GLOSSARY_CALLBACK_BATCH],
        )


def _segment_rows(body: TranslateSegmentsAsyncRequest, done: list[SegmentOutcome]) -> list[dict]:
    return [
        {
            "index": body.segments[o.index].index,
            "translation": o.translation,
            "reviewed": o.reviewed,
            "issues": [i.to_dict() for i in o.issues[:MAX_SEGMENT_ISSUES]],
        }
        for o in done
    ]


def _outcomes(result: SegmentsResult) -> list[SegmentOutcome]:
    return [
        SegmentOutcome(i, t, i in result.reviewed, result.issues.get(i, []))
        for i, t in enumerate(result.translations)
        if t is not None
    ]


def _result_payload(body: TranslateSegmentsAsyncRequest, result: SegmentsResult) -> dict:
    # After a provider abort the rest was never attempted — not "failed" segments.
    failed = [] if result.aborted else [body.segments[i].index for i in result.failed]
    payload: dict = {
        "job_id": body.job_id,
        "status": "FAILED" if failed or result.aborted else "SUCCEEDED",
        "segments": _segment_rows(body, _outcomes(result)),
        "failed_indices": failed,
    }
    if result.aborted:
        payload["error"] = "Translation provider failed; finished segments were kept"
    elif failed:
        payload["error"] = f"{len(failed)} of {len(body.segments)} segments failed to translate"
    return payload


def _progress(body: TranslateSegmentsAsyncRequest):  # noqa: ANN202
    """Post each finished batch as RUNNING: saves it early and is the job heartbeat."""

    def report(done: list[SegmentOutcome]) -> None:
        rows = _segment_rows(body, done)
        post_worker_callback({"job_id": body.job_id, "status": "RUNNING", "segments": rows})

    return report


def run_translation_job(body: TranslateSegmentsAsyncRequest) -> None:
    """Background task: translate, report each batch, post the result, then extract terms.

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
            bible=_bible(body),
            on_progress=_progress(body),
        )
        payload = _result_payload(body, result)
        stats = result.review
        logger.info(
            "job %s review: %d flagged, %d fixed, %d revise calls",
            body.job_id, stats.flagged, stats.fixed, stats.revisions,
        )  # fmt: skip
    except Exception as exc:
        logger.warning("translation job %s failed: %s", body.job_id, type(exc).__name__)
        post_worker_callback(
            {"job_id": body.job_id, "status": "FAILED", "error": "Translation failed"}
        )
        return
    if not result.aborted:
        summary = _summarize(llm, "\n\n".join(s.source for s in body.segments))
        if summary:
            payload["summary"] = summary
    post_worker_callback(payload)
    if body.project_id:
        _post_new_terms(llm, body, glossary, result)


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


# Must match the BFF bible callback schema, or the whole scan is rejected.
MAX_NAME, MAX_TRANSLATION, MAX_NOTE, MAX_ALIASES, MAX_STYLE_GUIDE = 200, 500, 1000, 50, 5000


def _clip(text: str | None, limit: int) -> str | None:
    return text[:limit] if text else text


def _entity_payload(e: ScannedEntity) -> dict | None:
    if len(e.english) > MAX_NAME:  # a truncated name would never match the text
        return None
    aliases = [a for a in e.aliases if len(a.english) <= MAX_NAME][:MAX_ALIASES]
    return {
        "english": e.english,
        "translation": _clip(e.translation, MAX_TRANSLATION),
        "category": e.category,
        "notes": _clip(e.notes, MAX_NOTE),
        "mentions": e.mentions,
        "aliases": [
            {"english": a.english, "translation": _clip(a.translation, MAX_TRANSLATION)}
            for a in aliases
        ],
    }


def run_bible_scan(body: BibleScanAsyncRequest) -> None:
    """Background task: pre-scan the book and POST the draft bible to the BFF.

    Never raises; unexpected errors become a generic FAILED callback (A09).
    """
    base = {"job_id": body.job_id, "project_id": body.project_id}

    def progress(done: int, total: int) -> bool:
        return post_scan_progress({**base, "done": done, "total": total})

    try:
        result = scan_book(
            client_for(body.llm), body.chapters, target_lang=body.target_lang, progress=progress
        )
    except ScanStopped:
        # Stopped by the user: the BFF already reset the scan; nothing to post.
        logger.info("bible scan %s stopped on request", body.job_id)
        return
    except Exception as exc:
        logger.warning("bible scan %s failed: %s", body.job_id, type(exc).__name__)
        post_bible_callback({**base, "status": "FAILED", "error": "Bible scan failed"})
        return
    post_bible_callback(
        {
            **base,
            "status": "SUCCEEDED",
            # The overview goes in style_guide (same BookBible column).
            "style_guide": result.overview[:MAX_STYLE_GUIDE],
            "entities": [
                row
                for e in result.entities[:MAX_BIBLE_ENTITIES]
                if (row := _entity_payload(e)) is not None
            ],
        }
    )


@router.post("/bible/scan/async", status_code=202)
def bible_scan_async(body: BibleScanAsyncRequest, background_tasks: BackgroundTasks) -> dict:
    """Accept a whole-book pre-scan, return 202, run it in the background."""
    if not JOB_ID_PATTERN.match(body.job_id):
        raise HTTPException(status_code=400, detail="Invalid job_id format")
    background_tasks.add_task(run_bible_scan, body)
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
