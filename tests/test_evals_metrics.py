"""Phase 6 eval metrics: pure functions over source / translation pairs."""

from __future__ import annotations

import pytest
from evals.metrics import agreement, consistency, occurrences, truncation_rate
from evals.reference import ReferenceTerm

RHYNIE = ReferenceTerm("Rhynie", ("赖尼",), "place")
SOOM = ReferenceTerm("Soom", ("索姆", "苏姆"), "place")


class TestOccurrences:
    def test_finds_the_segments_naming_a_term_with_the_translator_matcher(self) -> None:
        sources = ["Rhynie chert.", "No name here.", "Back at Rhynie, rain.", "rhynie in lowercase"]
        # Capitalised names match case-sensitively (as in translation).
        assert occurrences(sources, "Rhynie") == [0, 2]


class TestAgreement:
    def test_counts_occurrences_rendered_with_an_accepted_translation(self) -> None:
        sources = ["Rhynie chert.", "Rhynie again.", "The Soom shale.", "Soom twice."]
        translations = ["赖尼燧石。", "莱尼又来了。", "苏姆页岩。", None]
        score = agreement(sources, translations, [RHYNIE, SOOM])
        assert (score.hits, score.total) == (2, 4)
        assert score.rate == pytest.approx(0.5)
        assert score.per_term == {"Rhynie": (1, 2), "Soom": (1, 2)}  # a failed segment is a miss

    def test_no_occurrences_gives_no_rate(self) -> None:
        score = agreement(["Nothing."], ["没有。"], [RHYNIE])
        assert (score.hits, score.total, score.rate) == (0, 0, None)
        assert score.per_term == {}


class TestConsistency:
    def test_share_of_occurrences_using_each_term_s_most_common_rendering(self) -> None:
        score = consistency(
            {
                "Rhynie": ["赖尼", "赖尼", "莱尼"],  # 2 of 3
                "Soom": ["苏姆", "苏姆"],  # 2 of 2
            }
        )
        assert (score.hits, score.total) == (4, 5)
        assert score.rate == pytest.approx(0.8)
        assert score.per_term == {"Rhynie": (2, 3), "Soom": (2, 2)}

    def test_terms_seen_once_are_left_out(self) -> None:
        score = consistency({"Rhynie": ["赖尼"], "Soom": ["苏姆", "索姆"]})
        assert score.per_term == {"Soom": (1, 2)}

    def test_a_missing_rendering_is_never_the_majority(self) -> None:
        score = consistency({"Rhynie": [None, None, "赖尼"]})
        assert score.per_term == {"Rhynie": (1, 3)}


class TestTruncation:
    def test_counts_failed_and_cut_short_segments(self) -> None:
        long_src = "x" * 200
        sources = [long_src, long_src, long_src, "short"]
        translations = [
            "中" * 60,
            "中" * 10,
            None,
            "短",
        ]  # ok, cut short, failed, too short to judge
        assert truncation_rate(sources, translations, "zh-Hans") == pytest.approx(2 / 4)

    def test_empty_input(self) -> None:
        assert truncation_rate([], [], "zh-Hans") == 0.0
