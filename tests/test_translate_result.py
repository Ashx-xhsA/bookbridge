"""Failing (red) tests for issue #30 Python side — translator returns
TranslateResult with both text and new_terms, and accepts an optional
glossary parameter the provider renders into its prompt.

Must fail until bookbridge.harness.translator exports TranslateResult,
ExtractedTerm, GlossaryEntry, and MockTranslator honours the new shape.
"""

from __future__ import annotations

import pytest

from bookbridge.harness.providers.mock import MockTranslator
from bookbridge.harness.translator import (
    ExtractedTerm,
    GlossaryEntry,
    TranslateResult,
)

# ---------------------------------------------------------------------------
# Dataclasses exist with the expected fields
# ---------------------------------------------------------------------------


class TestDataclasses:
    def test_extracted_term_has_english_translation_category(self) -> None:
        t = ExtractedTerm(english="Hermione", translation="赫敏", category="person")
        assert t.english == "Hermione"
        assert t.translation == "赫敏"
        assert t.category == "person"

    def test_translate_result_has_text_and_new_terms(self) -> None:
        t = ExtractedTerm(english="a", translation="b", category="general")
        r = TranslateResult(text="hello", new_terms=[t])
        assert r.text == "hello"
        assert r.new_terms == [t]

    def test_translate_result_new_terms_defaults_to_empty(self) -> None:
        r = TranslateResult(text="hello")
        assert r.new_terms == []

    def test_glossary_entry_shape(self) -> None:
        g = GlossaryEntry(
            english="Hermione",
            translation="赫敏",
            category="person",
            approved=True,
        )
        assert g.english == "Hermione"
        assert g.translation == "赫敏"
        assert g.category == "person"
        assert g.approved is True


# ---------------------------------------------------------------------------
# MockTranslator now returns TranslateResult
# ---------------------------------------------------------------------------


class TestMockTranslateResult:
    def test_returns_translate_result_not_string(self) -> None:
        result = MockTranslator().translate("hello world", "en", "zh-Hans")
        assert isinstance(result, TranslateResult)

    def test_text_still_tagged_with_target_lang(self) -> None:
        result = MockTranslator().translate("hello world", "en", "zh-Hans")
        assert result.text.startswith("[zh-Hans]")
        assert "hello world" in result.text

    def test_extracts_capitalized_words_as_new_terms(self) -> None:
        # Capitalized words mimic proper-noun extraction the real provider does.
        # This is the visible wiring — tests can assert new_terms flows end-to-end
        # without needing a live LLM.
        result = MockTranslator().translate("Hermione held her Wand", "en", "zh-Hans")
        englishes = {t.english for t in result.new_terms}
        assert "Hermione" in englishes
        assert "Wand" in englishes

    def test_new_terms_carry_fixture_translation_and_category(self) -> None:
        result = MockTranslator().translate("Hogwarts is a school", "en", "zh-Hans")
        terms = [t for t in result.new_terms if t.english == "Hogwarts"]
        assert len(terms) == 1
        assert terms[0].translation  # non-empty string
        assert terms[0].category in {
            "person",
            "place",
            "organization",
            "technical",
            "general",
        }

    def test_new_terms_empty_when_no_capitalized_words(self) -> None:
        result = MockTranslator().translate("hello world", "en", "zh-Hans")
        assert result.new_terms == []

    def test_deduplicates_new_terms_within_one_call(self) -> None:
        # "Harry" twice in the same chunk must only yield one new term.
        result = MockTranslator().translate("Harry saw Harry again", "en", "zh-Hans")
        harry_count = sum(1 for t in result.new_terms if t.english == "Harry")
        assert harry_count == 1


# ---------------------------------------------------------------------------
# Glossary injection — optional kwarg that providers render into the prompt
# ---------------------------------------------------------------------------


class TestGlossaryInjection:
    def test_translate_accepts_glossary_kwarg(self) -> None:
        glossary = [
            GlossaryEntry(
                english="wand",
                translation="魔杖",
                category="technical",
                approved=True,
            )
        ]
        # Should not raise
        result = MockTranslator().translate("hello world", "en", "zh-Hans", glossary=glossary)
        assert isinstance(result, TranslateResult)

    def test_glossary_is_visible_in_mock_output(self) -> None:
        # Mock echoes a [glossary:N] marker so the full pipeline is testable
        # without inspecting prompts sent to a real LLM.
        glossary = [
            GlossaryEntry(english="wand", translation="魔杖", category="technical", approved=True),
            GlossaryEntry(english="owl", translation="猫头鹰", category="general", approved=False),
        ]
        result = MockTranslator().translate("hello world", "en", "zh-Hans", glossary=glossary)
        assert "glossary:2" in result.text

    def test_no_glossary_marker_when_none_provided(self) -> None:
        result = MockTranslator().translate("hello world", "en", "zh-Hans")
        assert "glossary:" not in result.text

    def test_empty_glossary_list_behaves_like_no_glossary(self) -> None:
        result = MockTranslator().translate("hello world", "en", "zh-Hans", glossary=[])
        assert "glossary:" not in result.text


# ---------------------------------------------------------------------------
# Validation still applies under the new shape
# ---------------------------------------------------------------------------


class TestValidationUnderNewShape:
    def test_empty_text_still_raises(self) -> None:
        with pytest.raises(ValueError, match="[Ee]mpty"):
            MockTranslator().translate("", "en", "zh-Hans")

    def test_unknown_target_lang_still_raises(self) -> None:
        with pytest.raises(ValueError, match="target_lang"):
            MockTranslator().translate("hi", "en", "klingon")
