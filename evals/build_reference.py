"""Draft the reference glossary for an eval book from its human translation.

    set -a && source .env && set +a
    python -m evals.build_reference --book evals/books/otherlands --chapters 0-3

1. Candidates: names and aliases from the (cached) bible scan that occur at
   least twice in the chosen source chapters.
2. Per chapter, one model call reads the published translation of that
   chapter and reports how it renders each candidate named there; only
   renderings that appear verbatim in the translation are kept.
3. Writes <book>/reference.draft.json with every term `checked: false`.
   A person confirms or fixes the renderings, sets `checked: true` and saves
   it as reference.json — the eval refuses unchecked terms.
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from pathlib import Path

from bookbridge.harness import get_llm_client
from bookbridge.harness.models import LLMClient
from bookbridge.harness.parsing import strip_code_fence
from bookbridge.harness.prescan import ScannedEntity
from bookbridge.harness.retry import complete_with_retry
from evals.book import ChapterPair, chapter_range, load_book
from evals.metrics import occurrences
from evals.scan_cache import ensure_scan

MIN_OCCURRENCES = 2


def candidates(
    entities: Sequence[ScannedEntity],
    sources: Sequence[str],
    min_occurrences: int = MIN_OCCURRENCES,
) -> list[tuple[str, str, int]]:
    """(name, category, occurrences) for names and aliases seen often enough."""
    found: list[tuple[str, str, int]] = []
    seen: set[str] = set()
    for entity in entities:
        for name in entity.names:
            if name.lower() in seen:
                continue
            seen.add(name.lower())
            count = len(occurrences(sources, name))
            if count >= min_occurrences:
                found.append((name, entity.category, count))
    return found


def parse_renderings(content: str, human_text: str) -> dict[str, str]:
    """`{"renderings": {name: str|null}}`, keeping only text the translation contains."""
    try:
        data = json.loads(strip_code_fence(content))
    except json.JSONDecodeError:
        return {}
    renderings = data.get("renderings") if isinstance(data, dict) else None
    if not isinstance(renderings, dict):
        return {}
    return {
        name: text.strip()
        for name, text in renderings.items()
        if isinstance(name, str) and isinstance(text, str) and text.strip()
        and text.strip() in human_text
    }  # fmt: skip


def draft(
    names: Sequence[tuple[str, str, int]], found_per_chapter: Sequence[dict[str, str]]
) -> list[dict]:
    terms = []
    for name, category, mentions in names:
        accepted: list[str] = []
        for found in found_per_chapter:
            rendering = found.get(name)
            if rendering and rendering not in accepted:
                accepted.append(rendering)
        terms.append(
            {
                "english": name,
                "accepted": accepted,
                "category": category,
                "mentions": mentions,
                "checked": False,
            }
        )
    return terms


def build_renderings_prompt(
    names: Sequence[str], human_text: str, target_lang: str
) -> tuple[str, str]:
    system = "\n".join(
        [
            "Task: find_renderings",
            f"The text below is a published {target_lang} translation of one chapter of "
            "a book. For each English name listed, give the exact words this translation "
            "uses for it, copied verbatim from the text, or null if it is not there.",
            'Return only JSON: {"renderings": {"<English name>": str|null}}',
        ]
    )
    return system, "Names:\n" + "\n".join(
        f"- {n}" for n in names
    ) + "\n\nTranslation:\n" + human_text


def find_renderings(
    client: LLMClient, chapter: ChapterPair, names: Sequence[str], target_lang: str
) -> dict[str, str]:
    present = [n for n in names if occurrences(chapter.source, n)]
    if not present:
        return {}
    human_text = "\n\n".join(chapter.human)
    system, user = build_renderings_prompt(present, human_text, target_lang)
    return parse_renderings(complete_with_retry(client, system, user, json_mode=True), human_text)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--book", type=Path, required=True)
    parser.add_argument("--chapters", required=True, help="positions in book.json, e.g. 0-3")
    args = parser.parse_args()

    book = load_book(args.book)
    positions = chapter_range(args.chapters)
    chapters = book.chapters(positions)
    client = get_llm_client()
    entities, _ = ensure_scan(client, args.book, chapters, positions, book.target_lang)
    sources = [p for c in chapters for p in c.source]
    names = candidates(entities, sources)
    found = [
        find_renderings(client, c, [n for n, _, _ in names], book.target_lang) for c in chapters
    ]
    terms = draft(names, found)

    out = args.book / "reference.draft.json"
    out.write_text(
        json.dumps(
            {"book": book.name, "chapters": positions, "terms": terms}, ensure_ascii=False, indent=1
        ),
        encoding="utf-8",
    )
    missing = [t["english"] for t in terms if not t["accepted"]]
    print(f"{len(terms)} candidate terms, {len(missing)} without a rendering; draft: {out}")
    for t in terms:
        print(f"  {t['english']:<28} {t['mentions']:>3}  {' / '.join(t['accepted']) or '—'}")


if __name__ == "__main__":
    main()
