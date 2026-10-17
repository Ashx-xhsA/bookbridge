"""Per-segment rule checks (Phase 4a): deterministic, no LLM calls."""

import pytest

from bookbridge.harness.models import AliasTarget, GlossaryEntry
from bookbridge.quality import Issue, check_segment, has_errors
from bookbridge.quality.zh_hans import ChineseSimplifiedChecker

GANDALF = AliasTarget(english="Gandalf", translation="甘道夫")


def _term(english: str, translation: str, alias_of: AliasTarget | None = None) -> GlossaryEntry:
    return GlossaryEntry(english=english, translation=translation, category="person",
                         alias_of=alias_of)  # fmt: skip


GLOSSARY = [
    _term("Gandalf", "甘道夫"),
    _term("the old wizard", "老巫师", alias_of=GANDALF),
    _term("Shire", "夏尔"),
]


def _categories(issues: list[Issue]) -> list[str]:
    return [i.category for i in issues]


class TestTermConsistency:
    def test_clean_segment_has_no_issues(self) -> None:
        issues = check_segment(
            "Gandalf came to the Shire.", "甘道夫来到了夏尔。",
            target_lang="zh-Hans", glossary=GLOSSARY,
        )  # fmt: skip
        assert issues == []

    def test_missing_term_translation_is_an_error(self) -> None:
        issues = check_segment(
            "Gandalf came to the Shire.", "甘道夫来到了郡里。",
            target_lang="zh-Hans", glossary=GLOSSARY,
        )  # fmt: skip
        assert _categories(issues) == ["term"]
        assert issues[0].severity == "error"
        assert "Shire" in issues[0].message and "夏尔" in issues[0].message

    def test_only_terms_in_the_source_are_checked(self) -> None:
        # The glossary has "Shire", but this paragraph never mentions it.
        issues = check_segment(
            "Gandalf smiled.", "甘道夫笑了。", target_lang="zh-Hans", glossary=GLOSSARY
        )
        assert issues == []

    def test_alias_replaced_by_main_name_is_flagged(self) -> None:
        issues = check_segment(
            "The old wizard smiled.", "甘道夫笑了。", target_lang="zh-Hans", glossary=GLOSSARY
        )
        assert _categories(issues) == ["alias_replaced"]
        assert issues[0].severity == "error"
        assert "老巫师" in issues[0].message

    def test_alias_and_main_name_both_in_source_is_fine(self) -> None:
        issues = check_segment(
            "Gandalf, the old wizard, smiled.", "甘道夫，那位老巫师，笑了。",
            target_lang="zh-Hans", glossary=GLOSSARY,
        )  # fmt: skip
        assert issues == []

    def test_lowercase_alias_matches_sentence_start(self) -> None:
        issues = check_segment(
            "The old wizard smiled.", "老巫师笑了。", target_lang="zh-Hans", glossary=GLOSSARY
        )
        assert issues == []


class TestTruncation:
    LONG = (
        "It was a bright cold day in April, and the clocks were striking thirteen. "
        "Winston Smith slipped quickly through the glass doors of Victory Mansions."
    )

    def test_far_too_short_translation_is_an_error(self) -> None:
        issues = check_segment(self.LONG, "四月。", target_lang="zh-Hans", glossary=[])
        assert "truncation" in _categories(issues)
        assert has_errors(issues)

    def test_normal_length_ratio_passes(self) -> None:
        zh = "四月里一个晴朗寒冷的日子，钟敲了十三下。温斯顿·史密斯迅速溜进了胜利大厦的玻璃门。"
        issues = check_segment(self.LONG, zh, target_lang="zh-Hans", glossary=[])
        assert "truncation" not in _categories(issues)

    def test_short_sources_are_not_ratio_checked(self) -> None:
        issues = check_segment('"No," he said.', "“不。”", target_lang="zh-Hans", glossary=[])
        assert "truncation" not in _categories(issues)

    def test_european_targets_use_a_higher_threshold(self) -> None:
        issues = check_segment(self.LONG, "Era un día de abril.", target_lang="es", glossary=[])
        assert "truncation" in _categories(issues)


class TestUntranslated:
    def test_copied_source_is_an_error_in_any_language(self) -> None:
        text = "He walked home slowly."
        issues = check_segment(text, text, target_lang="fr", glossary=[])
        assert _categories(issues) == ["untranslated"]
        assert has_errors(issues)

    def test_stray_english_sentence_in_chinese(self) -> None:
        issues = check_segment(
            "He said this sentence was not translated at all.",
            "他说 this sentence was not translated。",
            target_lang="zh-Hans",
            glossary=[],
        )
        assert "untranslated" in _categories(issues)

    def test_chinese_checks_apply_to_traditional_too(self) -> None:
        issues = check_segment(
            "He said this sentence was not translated at all.",
            "他說 this sentence was not translated。",
            target_lang="zh-Hant",
            glossary=[],
        )
        assert "untranslated" in _categories(issues)


class TestPunctuation:
    def test_half_width_punctuation_is_only_a_warning(self) -> None:
        issues = check_segment("He came, and left.", "他来了, 又走了。", target_lang="zh-Hans",
                               glossary=[])  # fmt: skip
        assert _categories(issues) == ["punctuation"]
        assert not has_errors(issues)


class TestChineseChecker:
    @pytest.fixture
    def zh(self) -> ChineseSimplifiedChecker:
        return ChineseSimplifiedChecker()

    def test_accepts_english_proper_nouns(self, zh: ChineseSimplifiedChecker) -> None:
        assert zh.check_language_specific("阿里耶基是Embassytown的居民。") == []

    def test_clean_text(self, zh: ChineseSimplifiedChecker) -> None:
        assert zh.check_language_specific("这是一段完美的翻译文本，没有任何问题。") == []


class TestIssue:
    def test_to_dict(self) -> None:
        issue = Issue(category="term", message="m", severity="error")
        assert issue.to_dict() == {"category": "term", "message": "m", "severity": "error"}

    def test_has_errors_ignores_warnings(self) -> None:
        assert not has_errors([Issue(category="punctuation", message="m")])
        assert has_errors([Issue(category="term", message="m", severity="error")])
