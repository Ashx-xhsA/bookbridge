"""The bible scan an eval run uses, cached per book and chapter selection so
configs B and C share one glossary and overview (a re-scan could differ)."""

from __future__ import annotations

import json
import re
from collections.abc import Sequence
from pathlib import Path

from bookbridge.harness.models import AliasTarget, LLMClient
from bookbridge.harness.prescan import ScannedEntity, scan_book
from evals.book import ChapterPair


def save_scan(
    path: Path, entities: list[ScannedEntity], overview: str, *, chapters: list[int], usage: dict
) -> None:
    data = {
        "chapters": chapters,
        "usage": usage,
        "overview": overview,
        "entities": [
            {
                "english": e.english,
                "translation": e.translation,
                "category": e.category,
                "notes": e.notes,
                "mentions": e.mentions,
                "aliases": [[a.english, a.translation] for a in e.aliases],
            }
            for e in entities
        ],
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def load_scan(path: Path, *, chapters: list[int]) -> tuple[list[ScannedEntity], str] | None:
    """The cached scan, or None when there is none for exactly these chapters."""
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("chapters") != chapters:
        return None
    entities = [
        ScannedEntity(
            english=e["english"],
            translation=e["translation"],
            category=e["category"],
            notes=e.get("notes"),
            mentions=e.get("mentions", 0),
            aliases=tuple(AliasTarget(n, t) for n, t in e.get("aliases", [])),
        )
        for e in data["entities"]
    ]
    return entities, data.get("overview", "")


def ensure_scan(
    client: LLMClient,
    book_dir: Path,
    chapters: Sequence[ChapterPair],
    positions: list[int],
    target_lang: str,
) -> tuple[list[ScannedEntity], str]:
    """The cached scan for these chapters, scanning (and caching) it if missing."""
    # Per model too: a mock run must never leave a cache a real run picks up.
    model = re.sub(r"[^A-Za-z0-9._-]", "_", getattr(client, "model", None) or type(client).__name__)
    path = book_dir / f"scan-{model}-{positions[0]}-{positions[-1]}.json"
    cached = load_scan(path, chapters=positions)
    if cached is not None:
        return cached
    before = dict(vars(client.usage)) if hasattr(client, "usage") else {}
    result = scan_book(client, [c.source for c in chapters], target_lang=target_lang)
    after = dict(vars(client.usage)) if hasattr(client, "usage") else {}
    usage = {k: after[k] - before.get(k, 0) for k in after}
    save_scan(path, result.entities, result.overview, chapters=positions, usage=usage)
    return result.entities, result.overview
