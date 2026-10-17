"""Phase 6 eval setup: the three configs and the reference glossary file."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from evals.configs import CONFIGS, select

from bookbridge.harness.config import TranslationConfig
from evals.reference import ReferenceTerm, load_reference


class TestConfigs:
    def test_a_is_plain_paragraph_translation(self) -> None:
        a = CONFIGS["A"]
        assert a.glossary is False
        assert a.translation.context_window == 0
        assert a.translation.book_bible is False
        assert a.translation.review_max_retries == 0

    def test_b_adds_only_the_matched_glossary_and_the_context_window(self) -> None:
        b = CONFIGS["B"]
        assert b.glossary is True
        assert b.translation == TranslationConfig(
            glossary_mode="matched", context_window=3, book_bible=False, review_max_retries=0
        )

    def test_c_is_b_plus_the_overview_and_review(self) -> None:
        c = CONFIGS["C"]
        assert c.glossary is True
        assert c.translation == TranslationConfig(
            glossary_mode="matched", context_window=3, book_bible=True, review_max_retries=1
        )

    def test_select_by_name_in_order(self) -> None:
        assert [c.name for c in select("C,A")] == ["C", "A"]
        assert [c.name for c in select(" a , b ")] == ["A", "B"]

    def test_select_rejects_unknown_names(self) -> None:
        with pytest.raises(ValueError, match="B4"):
            select("A,B4")


def _write(tmp_path: Path, terms: list[dict]) -> Path:
    path = tmp_path / "reference.json"
    path.write_text(json.dumps({"book": "otherlands", "terms": terms}, ensure_ascii=False))
    return path


class TestReference:
    def test_loads_checked_terms(self, tmp_path: Path) -> None:
        path = _write(
            tmp_path,
            [
                {"english": "Rhynie", "accepted": ["赖尼"], "category": "place", "checked": True},
                {
                    "english": "Soom",
                    "accepted": ["索姆", "苏姆"],
                    "category": "place",
                    "checked": True,
                },
            ],
        )
        assert load_reference(path) == [
            ReferenceTerm("Rhynie", ("赖尼",), "place"),
            ReferenceTerm("Soom", ("索姆", "苏姆"), "place"),
        ]

    def test_refuses_terms_nobody_has_checked(self, tmp_path: Path) -> None:
        path = _write(
            tmp_path,
            [{"english": "Rhynie", "accepted": ["赖尼"], "category": "place", "checked": False}],
        )
        with pytest.raises(ValueError, match="Rhynie"):
            load_reference(path)

    def test_drafts_can_be_loaded_when_asked(self, tmp_path: Path) -> None:
        path = _write(
            tmp_path,
            [{"english": "Rhynie", "accepted": ["赖尼"], "category": "place", "checked": False}],
        )
        assert load_reference(path, require_checked=False) == [
            ReferenceTerm("Rhynie", ("赖尼",), "place")
        ]

    @pytest.mark.parametrize(
        "term",
        [
            {"english": "", "accepted": ["x"], "category": "place", "checked": True},
            {"english": "Rhynie", "accepted": [], "category": "place", "checked": True},
            {"english": "Rhynie", "accepted": [" "], "category": "place", "checked": True},
        ],
    )
    def test_rejects_malformed_terms(self, tmp_path: Path, term: dict) -> None:
        with pytest.raises(ValueError):
            load_reference(_write(tmp_path, [term]))

    def test_rejects_duplicate_terms(self, tmp_path: Path) -> None:
        term = {"english": "Rhynie", "accepted": ["赖尼"], "category": "place", "checked": True}
        with pytest.raises(ValueError, match="duplicate"):
            load_reference(_write(tmp_path, [term, {**term, "english": "rhynie"}]))
