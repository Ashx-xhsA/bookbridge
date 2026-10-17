"""Smoke-test the review loop (Phase 4) on one chapter against a real model.

Reuses the entities and style guide from an earlier `smoke_bible` report so
no new pre-scan is paid for, translates one chapter with review on, and
records per task (translate / review / revise) the calls and tokens, plus
every segment the first review flagged: rule and reviewer findings, the text
before and after revision, and what is still open. Flagged items are for a
human to judge (real problem or false positive). One run, sanity only.

    set -a && source .env && set +a
    python -m evals.smoke_review BOOK.epub --chapter 12 \\
        --bible evals/results/smoke-bible-2026-10-16-cb247f6.json
"""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

from bookbridge.harness import get_llm_client, pipeline
from bookbridge.harness.config import TranslationConfig
from bookbridge.harness.models import AliasTarget, LLMClient, Usage
from bookbridge.harness.pipeline import translate_segments
from bookbridge.harness.prescan import ScannedEntity
from bookbridge.harness.review import BatchReview
from evals.smoke import RESULTS_DIR, _commit, _load_chapter
from evals.smoke_bible import _bible_and_glossary

_TASK_RE = re.compile(r"^Task: (\w+)$", re.MULTILINE)


class _PerTask:
    """Wraps a client and splits calls / tokens by prompt task."""

    def __init__(self, inner: LLMClient) -> None:
        self.inner = inner
        self.usage: Usage = inner.usage
        self.by_task: dict[str, dict[str, float]] = {}

    def complete(self, system: str, user: str, *, json_mode: bool = False) -> str:
        found = _TASK_RE.search(system)
        task = found.group(1) if found else "other"
        before = (self.usage.prompt_tokens, self.usage.completion_tokens)
        start = time.monotonic()
        try:
            return self.inner.complete(system, user, json_mode=json_mode)
        finally:
            row = self.by_task.setdefault(
                task, {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "seconds": 0.0}
            )
            row["calls"] += 1
            row["prompt_tokens"] += self.usage.prompt_tokens - before[0]
            row["completion_tokens"] += self.usage.completion_tokens - before[1]
            row["seconds"] = round(row["seconds"] + time.monotonic() - start, 1)


def _load_bible(path: Path) -> tuple:
    data = json.loads(path.read_text())
    entities = [
        ScannedEntity(
            **{
                **{k: v for k, v in e.items() if k != "aliases"},
                "aliases": tuple(AliasTarget(**a) for a in e["aliases"]),
            }
        )
        for e in data["entities"]
    ]
    return _bible_and_glossary(entities, data["style_guide"])


def _flagged(reviews: list[BatchReview]) -> list[dict]:
    rows = []
    for rv in reviews:
        for k, first in enumerate(rv.first_issues):
            if not first:
                continue
            rows.append(
                {
                    "source": rv.sources[k],
                    "first_translation": rv.first_translations[k],
                    "first_issues": [i.to_dict() for i in first],
                    "final_translation": rv.translations[k],
                    "final_issues": [i.to_dict() for i in rv.issues[k]],
                }
            )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("book", type=Path)
    parser.add_argument("--chapter", type=int, required=True)
    parser.add_argument("--bible", type=Path, required=True, help="smoke_bible report JSON")
    parser.add_argument("--retries", type=int, default=1)
    args = parser.parse_args()

    bible, glossary = _load_bible(args.bible)
    _, segments = _load_chapter(args.book, args.chapter)
    client = _PerTask(get_llm_client())
    reviews: list[BatchReview] = []
    original = pipeline.review_batch

    def recording(*a, **kw):  # noqa: ANN002, ANN003, ANN202
        reviews.append(original(*a, **kw))
        return reviews[-1]

    pipeline.review_batch = recording  # type: ignore[assignment]
    config = TranslationConfig(review_max_retries=args.retries)
    start = time.monotonic()
    result = translate_segments(
        client, segments, target_lang="zh-Hans", glossary=glossary, bible=bible, config=config
    )
    report = {
        "commit": _commit(),
        "model": getattr(client.inner, "model", type(client.inner).__name__),
        "book": args.book.name,
        "chapter": args.chapter,
        "config": vars(config),
        "segments": len(segments),
        "batches": len(reviews),
        "seconds": round(time.monotonic() - start, 1),
        "by_task": client.by_task,
        "total_usage": vars(client.usage),
        "failed": result.failed,
        "review": vars(result.review),
        "still_flagged": sorted(
            i for i, v in result.issues.items() if any(x.severity == "error" for x in v)
        ),  # fmt: skip
        "flagged": _flagged(reviews),
    }
    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"smoke-review-{time.strftime('%Y-%m-%d')}-{report['commit']}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    summary = {k: v for k, v in report.items() if k not in {"flagged", "still_flagged"}}
    summary["still_flagged"] = len(report["still_flagged"])
    print(json.dumps(summary, indent=2))
    print(f"segments with first-round findings: {len(report['flagged'])}; full report: {out}")


if __name__ == "__main__":
    main()
