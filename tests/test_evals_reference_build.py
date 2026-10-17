"""Phase 6 eval: book config, cached scan, and drafting the reference glossary."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from bookbridge.harness.models import AliasTarget
from bookbridge.harness.prescan import ScannedEntity
from bookbridge.ingestion.models import Book, Chapter
from evals import book as book_module
from evals.book import chapter_range, load_book
from evals.build_reference import candidates, draft, parse_renderings
from evals.scan_cache import load_scan, save_scan


def _fake_reader(books: dict[str, list[tuple[str, list[str]]]]):
    def read(path: Path) -> Book:
        chapters = [Chapter(i, t, p) for i, (t, p) in enumerate(books[path.name])]
        return Book(source_file=path.name, chapters=chapters)

    return read


@pytest.fixture()
def book_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    (tmp_path / "book.json").write_text(
        json.dumps(
            {
                "name": "otherlands",
                "source": "en.epub",
                "human": "zh.epub",
                "target_lang": "zh-Hans",
                # English chapter 3 is the Chinese chapter 2, and so on.
                "chapters": [{"source": 3, "human": 2}, {"source": 4, "human": 3}],
            }
        )
    )
    en = [("Copyright", ["c"]), ("Contents", ["x"]), ("Maps", ["m"])]
    en += [("Introduction", ["Rhynie A.", "Rhynie B."]), ("1. Thaw", ["Ikpikpuk C."])]
    zh = [
        ("扉页", ["x"]),
        ("目录", ["y"]),
        ("序章", ["赖尼甲。", "赖尼乙。"]),
        ("第1章", ["伊克丙。"]),
    ]
    monkeypatch.setattr(book_module, "read_epub_file", _fake_reader({"en.epub": en, "zh.epub": zh}))
    return tmp_path


class TestBook:
    def test_pairs_source_chapters_with_the_human_translation(self, book_dir: Path) -> None:
        book = load_book(book_dir)
        assert book.name == "otherlands" and book.target_lang == "zh-Hans"
        first, second = book.chapters(chapter_range("0-1"))
        assert first.title == "Introduction"
        assert first.source == ["Rhynie A.", "Rhynie B."]
        assert first.human == ["赖尼甲。", "赖尼乙。"]
        assert second.title == "1. Thaw"

    @pytest.mark.parametrize(
        ("spec", "expected"), [("0-3", [0, 1, 2, 3]), ("2", [2]), ("1-1", [1])]
    )
    def test_chapter_range(self, spec: str, expected: list[int]) -> None:
        assert chapter_range(spec) == expected

    def test_chapter_outside_the_config_is_an_error(self, book_dir: Path) -> None:
        with pytest.raises(ValueError, match="chapter 5"):
            load_book(book_dir).chapters([5])


class TestScanCache:
    def test_round_trips_entities_and_overview(self, tmp_path: Path) -> None:
        entities = [
            ScannedEntity(
                english="Esperanza",
                translation="埃斯佩兰萨",
                category="place",
                notes=None,
                aliases=(AliasTarget("Hope", "希望"),),
                mentions=10,
            )
        ]
        path = tmp_path / "scan.json"
        save_scan(path, entities, "OVERVIEW", chapters=[0, 1], usage={"calls": 3})
        loaded, overview = load_scan(path, chapters=[0, 1])
        assert loaded == entities and overview == "OVERVIEW"

    def test_a_cache_for_other_chapters_is_not_reused(self, tmp_path: Path) -> None:
        path = tmp_path / "scan.json"
        save_scan(path, [], "O", chapters=[0, 1], usage={})
        assert load_scan(path, chapters=[0, 1, 2]) is None
        assert load_scan(tmp_path / "missing.json", chapters=[0]) is None


def _entity(name: str, category: str = "place", aliases: tuple[str, ...] = ()) -> ScannedEntity:
    return ScannedEntity(
        english=name,
        translation="译",
        category=category,
        aliases=tuple(AliasTarget(a, "别") for a in aliases),
    )


class TestCandidates:
    def test_names_and_aliases_seen_at_least_twice_in_the_chosen_chapters(self) -> None:
        sources = ["Rhynie and Hope.", "Rhynie again, Hope again.", "Moradi once."]
        found = candidates(
            [_entity("Rhynie"), _entity("Esperanza", aliases=("Hope",)), _entity("Moradi")],
            sources,
        )
        assert found == [("Rhynie", "place", 2), ("Hope", "place", 2)]


class TestParseRenderings:
    def test_keeps_only_renderings_that_appear_in_the_human_text(self) -> None:
        reply = json.dumps({"renderings": {"Rhynie": "莱尼", "Moradi": "莫拉迪", "Soom": None}})
        human = "在莱尼的燧石里……"
        assert parse_renderings(reply, human) == {"Rhynie": "莱尼"}

    def test_bad_reply_gives_nothing(self) -> None:
        assert parse_renderings("not json", "莱尼") == {}


class TestDraft:
    def test_collects_distinct_renderings_per_term_unchecked(self) -> None:
        terms = draft(
            [("Rhynie", "place", 5), ("Soom", "place", 3)],
            [{"Rhynie": "莱尼"}, {"Rhynie": "赖尼", "Soom": "索姆"}, {"Rhynie": "莱尼"}],
        )
        assert terms == [
            {"english": "Rhynie", "accepted": ["莱尼", "赖尼"], "category": "place",
             "mentions": 5, "checked": False},
            {"english": "Soom", "accepted": ["索姆"], "category": "place",
             "mentions": 3, "checked": False},
        ]  # fmt: skip

    def test_a_name_the_translator_never_rendered_is_kept_for_a_person_to_fill(self) -> None:
        [term] = draft([("Rhynie", "place", 2)], [{}])
        assert term["accepted"] == [] and term["checked"] is False
