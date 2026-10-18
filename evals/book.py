"""An eval book: the source EPUB, its published human translation, and which
source chapter corresponds to which translated chapter.

`<dir>/book.json`:
    {"name": "otherlands", "source": "en.epub", "human": "zh.epub",
     "target_lang": "zh-Hans",
     "chapters": [{"source": 3, "human": 2}, ...]}

Chapters are chosen by their position in that list ("0-3"). Books are
copyrighted and live under evals/books/ (gitignored).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from bookbridge.ingestion.epub_reader import read_epub
from bookbridge.ingestion.models import Book


def read_epub_file(path: Path) -> Book:
    return read_epub(path.read_bytes(), source_file=path.name)


@dataclass(frozen=True)
class ChapterPair:
    title: str
    source: list[str]
    # The published translation of the same chapter (paragraphs need not align).
    human: list[str]


@dataclass(frozen=True)
class EvalBook:
    name: str
    target_lang: str
    pairs: list[ChapterPair]

    def chapters(self, positions: list[int]) -> list[ChapterPair]:
        for p in positions:
            if not 0 <= p < len(self.pairs):
                raise ValueError(f"chapter {p} is not in book.json (0..{len(self.pairs) - 1})")
        return [self.pairs[p] for p in positions]


def load_book(directory: Path) -> EvalBook:
    config = json.loads((directory / "book.json").read_text(encoding="utf-8"))
    source = read_epub_file(directory / config["source"]).chapters
    human = read_epub_file(directory / config["human"]).chapters
    pairs = [
        ChapterPair(
            title=source[c["source"]].title,
            source=source[c["source"]].paragraphs,
            human=human[c["human"]].paragraphs,
        )
        for c in config["chapters"]
    ]
    return EvalBook(name=config["name"], target_lang=config["target_lang"], pairs=pairs)


def chapter_range(spec: str) -> list[int]:
    """ "0-3" -> [0, 1, 2, 3]; "2" -> [2]."""
    start, _, end = spec.partition("-")
    return list(range(int(start), int(end or start) + 1))
