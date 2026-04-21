"""FastAPI route handlers wrapping bookbridge ingestion and harness modules."""

import logging
import re
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile

from bookbridge.harness import get_translator
from bookbridge.harness.translator import (
    ExtractedTerm,
    GlossaryEntry,
    TranslateResult,
    TranslatorError,
    render_glossary_prompt_section,
)
from bookbridge.ingestion.chunker import build_chunk_manifest
from bookbridge.ingestion.pdf_reader import extract_pages
from bookbridge.worker_api.callback import (
    post_glossary_callback,
    post_worker_callback,
)
from bookbridge.worker_api.models import (
    ChunkData,
    GlossaryTermInput,
    HealthResponse,
    JobStatusResponse,
    SummarizeRequest,
    SummarizeResponse,
    TranslateChunkAsyncRequest,
    TranslateChunkRequest,
    TranslateChunkResponse,
)

logger = logging.getLogger(__name__)


def _to_glossary_entries(
    inputs: list[GlossaryTermInput] | None,
) -> list[GlossaryEntry] | None:
    if not inputs:
        return None
    return [
        GlossaryEntry(
            english=i.english,
            translation=i.translation,
            category=i.category,
            approved=i.approved,
        )
        for i in inputs
    ]


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
        result = translator.translate(
            text=body.source_text,
            source_lang="en",
            target_lang=body.target_lang,
            glossary=_to_glossary_entries(body.glossary),
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
        translation=result.text,
    )


def _translate_with_user_creds(
    source_text: str,
    target_lang: str,
    glossary: list[GlossaryEntry] | None,
    context: str | None,
    llm_creds: dict,
) -> TranslateResult:
    """Translate using per-user credentials via chat_completion.

    Used for the free-tier / BYO-key path. Glossary is rendered into the
    system prompt, but new_terms extraction is NOT performed in this branch
    (chat_completion returns plain text, not structured output). Users on
    this path can still manually add terms in the glossary UI.
    """
    from bookbridge.worker_api.llm import chat_completion
    from bookbridge.worker_api.models import LLMCredentials

    creds = LLMCredentials(**llm_creds)

    prompt_parts = [
        f"Translate from en to {target_lang}.",
        "Return only the translated text, no preamble, no explanation.",
    ]
    glossary_section = render_glossary_prompt_section(glossary)
    if glossary_section:
        prompt_parts.append("")
        prompt_parts.append(glossary_section)

    text_to_translate = source_text
    if context:
        text_to_translate = (
            "[Translation context — use for consistency, do not translate this section]\n"
            f"{context}\n"
            "[End of context — translate only the text below]\n\n"
            f"{source_text}"
        )

    translation = chat_completion(
        system_prompt="\n".join(prompt_parts),
        user_content=text_to_translate,
        llm=creds,
    )
    return TranslateResult(text=translation, new_terms=[])


def _translate_with_server_creds(
    source_text: str,
    target_lang: str,
    glossary: list[GlossaryEntry] | None,
    context: str | None,
) -> TranslateResult:
    """Translate using the server-wide Translator protocol.

    Used when the caller has no per-user LLM credentials (server-env path).
    The configured provider (mock / openai_compat / ...) returns a
    TranslateResult with both text and new_terms — extraction happens as a
    side-output of the translation call.
    """
    translator = get_translator()
    text_to_translate = source_text
    if context:
        text_to_translate = (
            "[Translation context — use for consistency, do not translate this section]\n"
            f"{context}\n"
            "[End of context — translate only the text below]\n\n"
            f"{source_text}"
        )
    return translator.translate(
        text=text_to_translate,
        source_lang="en",
        target_lang=target_lang,
        glossary=glossary,
    )


def translate_and_callback(
    job_id: str,
    source_text: str,
    target_lang: str,
    project_id: str | None = None,
    glossary: list[GlossaryEntry] | None = None,
    context: str | None = None,
    llm_creds: dict | None = None,
) -> None:
    """Background-task worker: translate and POST results back to Next.js.

    Never raises — any exception is caught and reported via the callback as
    FAILED with a generic error, so the BFF poller surfaces it cleanly.

    If the translator produces new_terms (server-creds path only) AND the
    caller supplied a project_id, those terms are POSTed to the glossary
    callback for insertion under the merge rule (exists → skip).
    """
    try:
        if llm_creds and llm_creds.get("llm_api_key"):
            result = _translate_with_user_creds(
                source_text, target_lang, glossary, context, llm_creds
            )
        else:
            result = _translate_with_server_creds(source_text, target_lang, glossary, context)
    except Exception as exc:
        logger.warning(
            "background translation failed for job %s: %s",
            job_id,
            type(exc).__name__,
        )
        post_worker_callback({"job_id": job_id, "status": "FAILED", "error": "Translation failed"})
        return

    if project_id and result.new_terms:
        post_glossary_callback(
            project_id=project_id,
            terms=[
                {
                    "english": t.english,
                    "translation": t.translation,
                    "category": t.category,
                }
                for t in result.new_terms
            ],
        )

    post_worker_callback(
        {
            "job_id": job_id,
            "status": "SUCCEEDED",
            "translated_content": result.text,
        }
    )


@router.post("/translate/chunk/async", status_code=202)
def translate_chunk_async(
    body: TranslateChunkAsyncRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Accept translation job, return 202 immediately, run work in background.

    The background task POSTs the translation result back to Next.js via
    post_worker_callback, and any extracted glossary terms via
    post_glossary_callback (when project_id is provided).
    """
    if not JOB_ID_PATTERN.match(body.job_id):
        raise HTTPException(status_code=400, detail="Invalid job_id format")

    background_tasks.add_task(
        translate_and_callback,
        body.job_id,
        body.source_text,
        body.target_lang,
        body.project_id,
        _to_glossary_entries(body.glossary),
        body.context,
        body.llm.model_dump() if body.llm else None,
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
    from bookbridge.worker_api.llm import chat_completion

    system_prompt = (
        f"Summarize the following text in {body.max_words} words or fewer. "
        "Write a concise, informative summary suitable as a chapter overview. "
        "Return only the summary text."
    )
    try:
        content = chat_completion(
            system_prompt=system_prompt,
            user_content=body.text[:8000],
            llm=body.llm,
            timeout=30,
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.warning("summarize failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Summarization failed") from exc

    return SummarizeResponse(summary=content.strip())


# Silence the "ExtractedTerm imported but unused" lint — it's part of the public
# surface the translator protocol returns and is referenced indirectly.
_ = ExtractedTerm
