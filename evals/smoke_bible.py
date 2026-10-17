"""Smoke-test the book-bible pre-scan against a real model.

Scans the chosen chapters, prints the draft bible (top entities with aliases
and the book overview) and its token cost, then translates one chapter
with the bible on and off so the injected context can be compared by eye.
One run, for sanity only — not an eval.

    set -a && source .env && set +a
    python -m evals.smoke_bible BOOK.epub --chapters 9-12 --translate 12
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from bookbridge.harness import get_llm_client
from bookbridge.harness.config import TranslationConfig
from bookbridge.harness.models import AliasTarget, BookBible, GlossaryEntry
from bookbridge.harness.pipeline import translate_segments
from bookbridge.harness.prescan import ScannedEntity, scan_book
from evals.smoke import RESULTS_DIR, _commit, _load_chapter


def _chapter_range(spec: str) -> list[int]:
    start, _, end = spec.partition("-")
    return list(range(int(start), int(end or start) + 1))


def _bible_and_glossary(entities: list[ScannedEntity], overview: str) -> tuple[BookBible, list]:
    bible = BookBible(overview=overview)
    glossary = [GlossaryEntry(e.english, e.translation, e.category) for e in entities]
    glossary += [
        GlossaryEntry(
            a.english, a.translation, e.category, alias_of=AliasTarget(e.english, e.translation)
        )
        for e in entities
        for a in e.aliases
    ]
    return bible, glossary


def _translate(path: Path, chapter: int, glossary: list, bible: BookBible, on: bool) -> dict:
    _, segments = _load_chapter(path, chapter)
    client = get_llm_client()
    result = translate_segments(
        client, segments, target_lang="zh-Hans", glossary=glossary, bible=bible,
        config=TranslationConfig(book_bible=on),
    )  # fmt: skip
    return {
        "book_bible": on,
        "usage": vars(client.usage),
        "failed": result.failed,
        "pairs": [
            {"source": s, "translation": t}
            for s, t in zip(segments, result.translations, strict=True)
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("book", type=Path)
    parser.add_argument("--chapters", required=True, help="e.g. 9-12")
    parser.add_argument("--translate", type=int, help="chapter to translate with bible on/off")
    args = parser.parse_args()

    chapters = [_load_chapter(args.book, n)[1] for n in _chapter_range(args.chapters)]
    client = get_llm_client()
    start = time.monotonic()
    scan = scan_book(client, chapters, target_lang="zh-Hans")
    report: dict = {
        "commit": _commit(),
        "model": getattr(client, "model", type(client).__name__),
        "chapters": args.chapters,
        "source_chars": sum(len(p) for ch in chapters for p in ch),
        "scan_usage": vars(client.usage),
        "scan_seconds": round(time.monotonic() - start, 1),
        "overview": scan.overview,
        "entities": [{**vars(e), "aliases": [vars(a) for a in e.aliases]} for e in scan.entities],
    }
    if args.translate:
        bible, glossary = _bible_and_glossary(scan.entities, scan.overview)
        report["runs"] = [
            _translate(args.book, args.translate, glossary, bible, on) for on in (True, False)
        ]

    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"smoke-bible-{time.strftime('%Y-%m-%d')}-{report['commit']}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(
        json.dumps(
            {k: report[k] for k in ("model", "source_chars", "scan_usage", "scan_seconds")},
            indent=2,
        )
    )
    print("overview:\n" + scan.overview)
    for e in scan.entities[:15]:
        aliases = ", ".join(f"{a.english}→{a.translation}" for a in e.aliases)
        print(f"{e.mentions:4d}  {e.english} → {e.translation} [{e.category}] {aliases}")
    print(f"entities: {len(scan.entities)}; full report: {out}")


if __name__ == "__main__":
    main()
