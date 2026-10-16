"""Smoke-test the segment pipeline on one chapter against a real model.

Checks marker alignment (first-try batches vs split retries), failed
segments, suspiciously short outputs, token usage and wall time. Not an
eval: one chapter, one run — the numbers are a sanity check, not results.

    TRANSLATION_PROVIDER=openai_compat LLM_API_KEY=... \\
    LLM_BASE_URL=https://api.deepseek.com/v1 LLM_MODEL=deepseek-chat \\
    python -m evals.smoke BOOK.epub --chapter 12
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import time
from datetime import date
from pathlib import Path

from bookbridge.harness import get_llm_client
from bookbridge.harness.batching import plan_batches
from bookbridge.harness.config import TranslationConfig
from bookbridge.harness.pipeline import extract_terms, translate_segments
from bookbridge.ingestion.epub_reader import read_epub
from bookbridge.ingestion.txt_reader import read_txt

RESULTS_DIR = Path(__file__).parent / "results"
# Chinese output is normally ~0.25–0.5 chars per English char; far below that
# usually means a dropped or truncated paragraph.
SHORT_RATIO = 0.15


class _FailureLog(logging.Handler):
    """Counts the pipeline's per-attempt failure warnings by error type."""

    def __init__(self) -> None:
        super().__init__(logging.WARNING)
        self.errors: dict[str, int] = {}

    def emit(self, record: logging.LogRecord) -> None:
        if record.args and "attempt" in record.msg:
            kind = str(record.args[-1])
            self.errors[kind] = self.errors.get(kind, 0) + 1


def _load_chapter(path: Path, number: int) -> tuple[str, list[str]]:
    reader = read_epub if path.suffix.lower() == ".epub" else read_txt
    book = reader(path.read_bytes(), source_file=path.name)
    chapter = next(c for c in book.chapters if c.number == number)
    return chapter.title, [p for p in chapter.paragraphs if p.strip()]


def _commit() -> str:
    out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True)
    return out.stdout.strip() or "unknown"


def run(path: Path, chapter: int, max_segments: int | None, target: str) -> dict:
    title, segments = _load_chapter(path, chapter)
    segments = segments[:max_segments] if max_segments else segments
    config = TranslationConfig()
    client = get_llm_client()
    failures = _FailureLog()
    logging.getLogger("bookbridge.harness.pipeline").addHandler(failures)

    start = time.monotonic()
    result = translate_segments(client, segments, target_lang=target, config=config)
    translate_secs = time.monotonic() - start
    translate_usage = vars(client.usage).copy()
    pairs = [(s, t) for s, t in zip(segments, result.translations, strict=True) if t]
    terms = extract_terms(client, pairs, target_lang=target)

    batches = len(plan_batches(segments, config.max_batch_chars))
    short = [
        i
        for i, (s, t) in enumerate(zip(segments, result.translations, strict=True))
        if t and len(s) > 80 and len(t) / len(s) < SHORT_RATIO
    ]
    src_chars = sum(map(len, segments))
    return {
        "date": date.today().isoformat(),
        "commit": _commit(),
        "model": getattr(client, "model", type(client).__name__),
        "book": path.name,
        "chapter": {"number": chapter, "title": title},
        "config": vars(config),
        "segments": len(segments),
        "source_chars": src_chars,
        "planned_batches": batches,
        "translate_calls": translate_usage["calls"],
        "attempt_failures": failures.errors,
        "failed_segments": result.failed,
        "short_segments": short,
        "translate_usage": translate_usage,
        "tokens_per_1k_source_chars": round(
            (translate_usage["prompt_tokens"] + translate_usage["completion_tokens"])
            / max(src_chars, 1)
            * 1000
        ),
        "translate_seconds": round(translate_secs, 1),
        "extraction_usage": {k: v - translate_usage[k] for k, v in vars(client.usage).items()},
        "new_terms": [vars(t) for t in terms],
        "pairs": [
            {"source": s, "translation": t}
            for s, t in zip(segments, result.translations, strict=True)
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("book", type=Path)
    parser.add_argument("--chapter", type=int, required=True)
    parser.add_argument("--max-segments", type=int)
    parser.add_argument("--target", default="zh-Hans")
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

    report = run(args.book, args.chapter, args.max_segments, args.target)
    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"smoke-{report['date']}-{report['commit']}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    summary = {k: v for k, v in report.items() if k not in {"pairs", "new_terms"}}
    summary["new_terms"] = len(report["new_terms"])
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"full report: {out}")


if __name__ == "__main__":
    main()
