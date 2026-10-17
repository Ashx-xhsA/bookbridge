"""Harness building blocks: config, glossary matching, batching, parsing, prompts, bible."""

import pytest

from bookbridge.harness.batching import plan_batches
from bookbridge.harness.config import TranslationConfig
from bookbridge.harness.matching import match_glossary
from bookbridge.harness.models import (
    AliasTarget,
    BookBible,
    ContextSegment,
    GlossaryEntry,
    TranslatorError,
)
from bookbridge.harness.parsing import (
    SegmentAlignmentError,
    format_segments,
    parse_segments,
    parse_terms,
)
from bookbridge.harness.prompts import (
    BIBLE_HEADING,
    CONTEXT_HEADING,
    GLOSSARY_HEADING,
    build_extraction_prompt,
    build_translation_prompt,
)


def _term(english: str, translation: str = "译", **kw) -> GlossaryEntry:
    return GlossaryEntry(
        english=english,
        translation=translation,
        category=kw.get("category", "person"),
        approved=kw.get("approved", False),
        alias_of=kw.get("alias_of"),
    )


GANDALF = AliasTarget(english="Gandalf", translation="甘道夫")


# ---------------------------------------------------------------------------
# TranslationConfig — the ablation switches
# ---------------------------------------------------------------------------


class TestTranslationConfig:
    def test_defaults_are_all_on(self) -> None:
        cfg = TranslationConfig()
        assert cfg.glossary_mode == "matched"
        assert cfg.context_window == 3
        assert cfg.book_bible is True

    def test_rejects_unknown_glossary_mode(self) -> None:
        with pytest.raises(ValueError, match="glossary_mode"):
            TranslationConfig(glossary_mode="vector")  # type: ignore[arg-type]

    @pytest.mark.parametrize("window", [-1, 11])
    def test_rejects_out_of_range_context_window(self, window: int) -> None:
        with pytest.raises(ValueError, match="context_window"):
            TranslationConfig(context_window=window)

    def test_rejects_non_positive_batch_size(self) -> None:
        with pytest.raises(ValueError, match="max_batch_chars"):
            TranslationConfig(max_batch_chars=0)


# ---------------------------------------------------------------------------
# match_glossary — exact term / alias matching
# ---------------------------------------------------------------------------


class TestMatchGlossary:
    def test_matches_exact_term_on_word_boundary(self) -> None:
        frodo = _term("Frodo")
        assert match_glossary([frodo], "Then Frodo left.") == [frodo]

    def test_ignores_substring_inside_other_word(self) -> None:
        assert match_glossary([_term("Sam")], "Samwise and Samuel arrived.") == []

    def test_matches_possessive_and_plural(self) -> None:
        terms = [_term("Frodo"), _term("Hobbit")]
        matched = match_glossary(terms, "Frodo's ring. Three Hobbits ran.")
        assert {m.english for m in matched} == {"Frodo", "Hobbit"}

    def test_matches_curly_apostrophe_possessive(self) -> None:
        assert match_glossary([_term("Frodo")], "Frodo’s ring")

    def test_capitalised_term_is_case_sensitive(self) -> None:
        # "Will" the character must not be injected for the modal verb.
        assert match_glossary([_term("Will")], "I will go.") == []

    def test_capitalised_term_matches_all_caps_heading(self) -> None:
        assert match_glossary([_term("Will")], "CHAPTER ONE: WILL RETURNS")

    def test_lowercase_term_is_case_insensitive(self) -> None:
        assert match_glossary([_term("mithril", category="technical")], "Mithril shone.")

    def test_matches_multi_word_term_across_line_break(self) -> None:
        assert match_glossary([_term("Mount Doom")], "toward Mount\nDoom they went")

    def test_alias_is_its_own_entry_matched_by_its_own_name(self) -> None:
        alias = _term("Mithrandir", "米斯兰达", alias_of=GANDALF)
        assert match_glossary([alias], "Mithrandir smiled.") == [alias]
        assert match_glossary([alias], "Gandalf smiled.") == []

    def test_entry_matched_once_even_with_multiple_hits(self) -> None:
        frodo = _term("Frodo")
        assert match_glossary([frodo], "Frodo, Frodo, Frodo!") == [frodo]

    def test_regex_metacharacters_in_term_are_literal(self) -> None:
        assert match_glossary([_term("C++", category="technical")], "I like C") == []
        assert match_glossary([_term("Mr. Baggins")], "Mr Xbaggins") == []

    def test_preserves_input_order(self) -> None:
        terms = [_term("Sam"), _term("Frodo")]
        out = match_glossary(terms, "Frodo and Sam")
        assert [m.english for m in out] == ["Sam", "Frodo"]


# ---------------------------------------------------------------------------
# plan_batches — group segments under a char budget
# ---------------------------------------------------------------------------


class TestPlanBatches:
    def test_groups_greedily_under_budget(self) -> None:
        assert plan_batches(["aaaa", "bbbb", "cccc"], max_chars=8) == [range(0, 2), range(2, 3)]

    def test_oversized_segment_gets_its_own_batch(self) -> None:
        assert plan_batches(["a", "x" * 50, "b"], max_chars=10) == [
            range(0, 1),
            range(1, 2),
            range(2, 3),
        ]

    def test_empty_input(self) -> None:
        assert plan_batches([], max_chars=10) == []


# ---------------------------------------------------------------------------
# Segment delimiter protocol
# ---------------------------------------------------------------------------


class TestSegmentProtocol:
    def test_format_numbers_segments_from_one(self) -> None:
        assert format_segments(["Hi.", "Bye."]) == "<<<1>>>\nHi.\n<<<2>>>\nBye."

    def test_roundtrip(self) -> None:
        segs = ["First line\nwith break.", '"Quoted," she said.']
        assert parse_segments(format_segments(segs), expected=2) == segs

    def test_ignores_preamble_and_trailing_whitespace(self) -> None:
        content = "Here you go:\n<<<1>>>\n甲\n\n<<<2>>>\n乙\n\n"
        assert parse_segments(content, expected=2) == ["甲", "乙"]

    def test_tolerates_spaces_around_marker(self) -> None:
        assert parse_segments("  <<< 1 >>>  \n甲", expected=1) == ["甲"]

    def test_wrong_count_raises(self) -> None:
        with pytest.raises(SegmentAlignmentError):
            parse_segments("<<<1>>>\n甲乙", expected=2)

    def test_out_of_order_markers_raise(self) -> None:
        with pytest.raises(SegmentAlignmentError):
            parse_segments("<<<2>>>\n乙\n<<<1>>>\n甲", expected=2)

    def test_empty_segment_raises(self) -> None:
        with pytest.raises(SegmentAlignmentError):
            parse_segments("<<<1>>>\n\n<<<2>>>\n乙", expected=2)

    def test_single_segment_without_markers_is_accepted(self) -> None:
        assert parse_segments("  只有一段。 ", expected=1) == ["只有一段。"]

    def test_alignment_error_is_translator_error(self) -> None:
        assert issubclass(SegmentAlignmentError, TranslatorError)


class TestParseTerms:
    def test_parses_terms_and_normalises_category(self) -> None:
        content = (
            '{"terms": [{"english": " Frodo ", "translation": "弗罗多", "category": "person"},'
            ' {"english": "Shire", "translation": "夏尔", "category": "region"}]}'
        )
        terms = parse_terms(content, existing=[])
        assert [(t.english, t.translation, t.category) for t in terms] == [
            ("Frodo", "弗罗多", "person"),
            ("Shire", "夏尔", "general"),
        ]

    def test_strips_code_fence(self) -> None:
        content = '```json\n{"terms": [{"english": "Sam", "translation": "山姆"}]}\n```'
        assert [t.english for t in parse_terms(content, existing=[])] == ["Sam"]

    def test_skips_existing_and_duplicate_terms_case_insensitively(self) -> None:
        content = (
            '{"terms": [{"english": "frodo", "translation": "弗"},'
            ' {"english": "Sam", "translation": "山姆"}, {"english": "SAM", "translation": "山"}]}'
        )
        assert [t.english for t in parse_terms(content, existing=["Frodo"])] == ["Sam"]

    def test_skips_malformed_items(self) -> None:
        content = (
            '{"terms": [1, {"english": ""}, {"english": "X"},'
            ' {"english": "Y", "translation": "y"}]}'
        )
        assert [t.english for t in parse_terms(content, existing=[])] == ["Y"]

    @pytest.mark.parametrize("content", ["not json", "[]", '{"terms": "x"}'])
    def test_unusable_content_yields_no_terms(self, content: str) -> None:
        assert parse_terms(content, existing=[]) == []


# ---------------------------------------------------------------------------
# Prompt construction — each switch must remove its section when off
# ---------------------------------------------------------------------------


PRECEDING = [
    ContextSegment(source="Earlier source A.", translation="前文A。"),
    ContextSegment(source="Earlier source B.", translation=None),
]


def _prompt(
    cfg: TranslationConfig,
    batch: list[str],
    glossary: list[GlossaryEntry],
    bible: BookBible | None = None,
) -> str:
    system, user = build_translation_prompt(
        batch,
        source_lang="en",
        target_lang="zh-Hans",
        glossary=glossary,
        preceding=PRECEDING,
        config=cfg,
        bible=bible,
    )
    return system + "\n" + user


class TestTranslationPrompt:
    def test_contains_target_language_marker_protocol_and_segments(self) -> None:
        system, user = build_translation_prompt(
            ["One.", "Two."],
            source_lang="en",
            target_lang="zh-Hans",
            glossary=[],
            preceding=[],
            config=TranslationConfig(),
        )
        assert "zh-Hans" in system
        assert "<<<1>>>" in system  # protocol is explained
        assert "2" in system  # expected segment count stated
        assert user.endswith(format_segments(["One.", "Two."]))

    def test_context_window_includes_last_n_preceding(self) -> None:
        text = _prompt(TranslationConfig(context_window=1), ["Now."], [])
        assert CONTEXT_HEADING in text
        assert "Earlier source B." in text
        assert "Earlier source A." not in text

    def test_context_shows_translation_when_available(self) -> None:
        text = _prompt(TranslationConfig(context_window=2), ["Now."], [])
        assert "前文A。" in text

    def test_context_window_zero_removes_context(self) -> None:
        text = _prompt(TranslationConfig(context_window=0), ["Now."], [])
        assert CONTEXT_HEADING not in text
        assert "Earlier source" not in text

    def test_matched_mode_only_injects_terms_in_batch(self) -> None:
        glossary = [_term("Frodo", "弗罗多"), _term("Sauron", "索伦")]
        text = _prompt(TranslationConfig(glossary_mode="matched"), ["Frodo ran."], glossary)
        assert "弗罗多" in text
        assert "索伦" not in text

    def test_matched_mode_ignores_terms_only_in_context(self) -> None:
        glossary = [_term("Earlier", "早先")]
        text = _prompt(TranslationConfig(glossary_mode="matched"), ["Now."], glossary)
        assert GLOSSARY_HEADING not in text

    def test_full_mode_injects_every_term(self) -> None:
        glossary = [_term("Frodo", "弗罗多"), _term("Sauron", "索伦")]
        text = _prompt(TranslationConfig(glossary_mode="full"), ["Frodo ran."], glossary)
        assert "弗罗多" in text and "索伦" in text

    def test_full_mode_caps_glossary_size(self) -> None:
        glossary = [_term(f"Name{i:03d}", f"名{i}") for i in range(250)]
        text = _prompt(TranslationConfig(glossary_mode="full"), ["x"], glossary)
        assert text.count(" → ") == 200

    def test_no_matching_terms_means_no_glossary_section(self) -> None:
        text = _prompt(TranslationConfig(), ["Nothing here."], [_term("Frodo")])
        assert GLOSSARY_HEADING not in text

    def test_alias_is_rendered_with_own_translation_and_referent(self) -> None:
        alias = _term("Mithrandir", "米斯兰达", alias_of=GANDALF)
        text = _prompt(TranslationConfig(), ["Mithrandir smiled."], [alias])
        section = text.split(GLOSSARY_HEADING, 1)[1]
        assert "Mithrandir → 米斯兰达" in section
        assert "Gandalf / 甘道夫" in section
        assert "never replace" in section

    def test_approved_terms_listed_before_suggested(self) -> None:
        glossary = [_term("Sam", "山姆"), _term("Frodo", "弗罗多", approved=True)]
        text = _prompt(TranslationConfig(), ["Sam and Frodo."], glossary)
        assert text.index("弗罗多") < text.index("山姆")


BIBLE = BookBible(
    overview=(
        "A quest to destroy a ring. Gandalf (甘道夫), a wizard, guides Frodo (弗罗多). "
        "Plain, restrained modern Chinese; keep long sentences."
    ),
)


class TestBiblePrompt:
    def test_overview_is_injected_as_a_whole(self) -> None:
        text = _prompt(TranslationConfig(), ["Gandalf frowned."], [], BIBLE)
        assert BIBLE_HEADING in text
        section = text.split(BIBLE_HEADING, 1)[1]
        assert "Book overview:" in section
        assert "A quest to destroy a ring." in section
        assert "Plain, restrained modern Chinese" in section

    def test_no_character_cards(self) -> None:
        text = _prompt(TranslationConfig(), ["Gandalf frowned."], [], BIBLE)
        assert "Characters in this passage" not in text
        assert "voice" not in text.split(BIBLE_HEADING, 1)[1].lower()

    def test_book_bible_off_removes_the_whole_section(self) -> None:
        text = _prompt(TranslationConfig(book_bible=False), ["Gandalf frowned."], [], BIBLE)
        assert BIBLE_HEADING not in text
        assert "A quest to destroy" not in text

    def test_empty_overview_means_no_section(self) -> None:
        text = _prompt(TranslationConfig(), ["Gandalf."], [], BookBible(overview="  "))
        assert BIBLE_HEADING not in text

    def test_no_bible_means_no_section(self) -> None:
        assert BIBLE_HEADING not in _prompt(TranslationConfig(), ["Gandalf."], [], None)

    def test_bible_comes_before_glossary(self) -> None:
        text = _prompt(TranslationConfig(), ["Gandalf."], [_term("Gandalf", "甘道夫")], BIBLE)
        assert text.index(BIBLE_HEADING) < text.index(GLOSSARY_HEADING)


class TestExtractionPrompt:
    def test_includes_pairs_and_known_terms(self) -> None:
        system, user = build_extraction_prompt(
            [("Frodo ran.", "弗罗多跑了。")], target_lang="zh-Hans", known_terms=["Sam"]
        )
        assert "zh-Hans" in system
        assert '"terms"' in system
        assert "Frodo ran." in user and "弗罗多跑了。" in user
        assert "Sam" in user
