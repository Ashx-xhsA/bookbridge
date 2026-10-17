"""Phase 4b: reviewer and revision prompts, and parsing the reviewer's JSON."""

import json

import pytest

from bookbridge.harness.config import TranslationConfig
from bookbridge.harness.models import BookBible, CharacterCard, ContextSegment, GlossaryEntry
from bookbridge.harness.parsing import count_markers, parse_review
from bookbridge.harness.prompts import (
    BIBLE_HEADING,
    CONTEXT_HEADING,
    GLOSSARY_HEADING,
    build_recheck_prompt,
    build_review_prompt,
    build_revision_prompt,
)
from bookbridge.quality import Issue

FRODO = GlossaryEntry("Frodo", "弗罗多", "person")
SAM = GlossaryEntry("Sam", "山姆", "person")
BIBLE = BookBible(
    style_guide="Keep it terse.",
    characters=(CharacterCard(name="Frodo", translation="弗罗多", gender="male"),),
)
PAIRS = [("Frodo ran.", "弗罗多跑了。"), ("It rained.", "下雨了。")]
TERM_ISSUE = Issue("term", "'Frodo' should be translated as '弗罗多'", "error")


def _review(config: TranslationConfig = TranslationConfig(), **kw) -> str:
    system, user = build_review_prompt(
        kw.get("pairs", PAIRS),
        source_lang="en",
        target_lang="zh-Hans",
        glossary=kw.get("glossary", [FRODO, SAM]),
        preceding=kw.get("preceding", []),
        config=config,
        bible=kw.get("bible", BIBLE),
        rule_issues=kw.get("rule_issues", {}),
    )
    return system + "\n" + user


class TestReviewPrompt:
    def test_names_the_task_language_and_json_shape(self) -> None:
        text = _review()
        assert "Task: review" in text
        assert "Target language: zh-Hans" in text
        assert '"issues"' in text and '"segment"' in text and '"fix"' in text
        assert '"quote"' in text and "copied exactly from the translation" in text

    def test_defines_error_as_meaning_only(self) -> None:
        text = _review()
        assert "change the meaning" in text
        assert "Do not list anything you conclude is fine" in text

    def test_lists_every_pair_under_a_marker(self) -> None:
        text = _review()
        assert count_markers(text) == 2
        assert "[source] Frodo ran." in text and "[translation] 弗罗多跑了。" in text
        assert "[source] It rained." in text

    def test_sees_the_same_matched_glossary_as_the_translator(self) -> None:
        text = _review()
        assert GLOSSARY_HEADING in text and "弗罗多" in text
        assert "山姆" not in text  # Sam is not in this batch

    def test_rule_issues_are_shown_on_their_segment(self) -> None:
        text = _review(rule_issues={1: [TERM_ISSUE]})
        second = text.split("<<<2>>>", 1)[1]
        assert "should be translated as" in second
        assert "should be translated as" not in text.split("<<<2>>>", 1)[0].split("<<<1>>>")[-1]

    def test_switches_remove_bible_and_context(self) -> None:
        preceding = [ContextSegment("Before.", "之前。")]
        on = _review(preceding=preceding)
        assert BIBLE_HEADING in on and CONTEXT_HEADING in on
        off = _review(TranslationConfig(book_bible=False, context_window=0), preceding=preceding)
        assert BIBLE_HEADING not in off and CONTEXT_HEADING not in off


class TestRevisionPrompt:
    def _prompt(self, config: TranslationConfig = TranslationConfig()) -> tuple[str, str]:
        return build_revision_prompt(
            [("Frodo ran.", "佛罗多跑了。", [TERM_ISSUE])],
            source_lang="en",
            target_lang="zh-Hans",
            glossary=[FRODO, SAM],
            preceding=[ContextSegment("Before.", "之前。")],
            config=config,
            bible=BIBLE,
        )

    def test_shows_source_current_translation_and_problems(self) -> None:
        system, user = self._prompt()
        assert "Task: revise" in system
        assert "Target language: zh-Hans" in system
        assert count_markers(user) == 1
        assert "[source] Frodo ran." in user
        assert "[translation] 佛罗多跑了。" in user
        assert "should be translated as" in user

    def test_asks_for_marker_output_and_carries_context(self) -> None:
        system, user = self._prompt()
        assert "<<<1>>>" in system
        assert GLOSSARY_HEADING in system and BIBLE_HEADING in system
        assert CONTEXT_HEADING in user

    def test_switches_apply(self) -> None:
        system, user = self._prompt(TranslationConfig(book_bible=False, context_window=0))
        assert BIBLE_HEADING not in system and CONTEXT_HEADING not in user


def _issues_json(*items: dict) -> str:
    return json.dumps({"issues": list(items)}, ensure_ascii=False)


TEXTS = ["弗罗多跑了。", "她说她累了。"]


def _item(**kw: object) -> dict:
    base = {"segment": 2, "quote": "她说", "category": "pronoun", "severity": "error",
            "fix": "他说", "message": "speaker is male"}  # fmt: skip
    return {**base, **kw}


class TestParseReview:
    def test_maps_one_based_segments_and_shows_quote_and_fix(self) -> None:
        assert parse_review(_issues_json(_item()), TEXTS) == {
            1: [Issue("pronoun", 'speaker is male ["她说" → "他说"]', "error")]
        }

    def test_drops_out_of_range_and_malformed_items(self) -> None:
        content = _issues_json(
            _item(segment=3), _item(segment=0), _item(segment="2"),
            _item(message=None), "not an object",
        )  # fmt: skip
        assert parse_review(content, TEXTS) == {}

    @pytest.mark.parametrize("quote", [None, "", "不适用", "他说"])
    def test_items_without_a_quote_found_in_the_translation_are_dropped(
        self, quote: object
    ) -> None:
        # Retracted items ("此条不成立", fix "（不适用）") cannot quote a wrong span.
        assert parse_review(_issues_json(_item(quote=quote)), TEXTS) == {}

    def test_normalises_category_and_severity(self) -> None:
        content = _issues_json(_item(category="vibes", severity="fatal", fix=None))
        assert parse_review(content, TEXTS) == {1: [Issue("other", "speaker is male", "warning")]}

    def test_clips_long_messages(self) -> None:
        content = _issues_json(_item(category="style", message="x" * 1000))
        assert len(parse_review(content, TEXTS)[1][0].message) == 300

    @pytest.mark.parametrize("category", ["style", "fluency", "voice", "other"])
    def test_style_level_categories_are_never_errors(self, category: str) -> None:
        content = _issues_json(_item(category=category))
        assert parse_review(content, TEXTS)[1][0].severity == "warning"

    @pytest.mark.parametrize("fix", [None, "", "   ", "她说"])
    def test_an_error_needs_a_fix_that_changes_the_quote(self, fix: object) -> None:
        content = _issues_json(_item(fix=fix))
        assert parse_review(content, TEXTS)[1][0].severity == "warning"

    def test_unparseable_reply_means_no_issues(self) -> None:
        assert parse_review("looks fine to me", TEXTS) == {}
        assert parse_review('{"issues": "none"}', TEXTS) == {}

    def test_accepts_code_fenced_json(self) -> None:
        content = "```json\n" + _issues_json(_item(category="omission")) + "\n```"
        assert parse_review(content, TEXTS)[1][0].category == "omission"


class TestRecheckPrompt:
    def _prompt(self, config: TranslationConfig = TranslationConfig()) -> tuple[str, str]:
        return build_recheck_prompt(
            [("Frodo ran.", "佛罗多跑了。", "弗罗多跑了。", [TERM_ISSUE])],
            source_lang="en",
            target_lang="zh-Hans",
            glossary=[FRODO, SAM],
            preceding=[ContextSegment("Before.", "之前。")],
            config=config,
            bible=BIBLE,
        )

    def test_verifies_listed_problems_only(self) -> None:
        system, user = self._prompt()
        assert "Task: recheck" in system
        assert "Do not look for new style" in system
        assert '"issues"' in system and '"fix"' in system
        assert count_markers(user) == 1
        assert "[previous translation] 佛罗多跑了。" in user
        assert "[revised translation] 弗罗多跑了。" in user
        assert "[problem to verify]" in user and "should be translated as" in user

    def test_same_context_and_switches(self) -> None:
        system, user = self._prompt()
        assert BIBLE_HEADING in system and GLOSSARY_HEADING in system and CONTEXT_HEADING in user
        system, user = self._prompt(TranslationConfig(book_bible=False, context_window=0))
        assert BIBLE_HEADING not in system and CONTEXT_HEADING not in user
