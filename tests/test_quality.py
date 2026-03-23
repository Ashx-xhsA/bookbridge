"""Tests for the quality checking module."""

import pytest

from bookbridge.quality.base import BaseQualityChecker
from bookbridge.quality.models import Issue, QualityReport
from bookbridge.quality.zh_hans import ChineseSimplifiedChecker


# --- Fixtures following v2 skill pattern ---


@pytest.fixture
def zh_checker():
    """Create a Chinese Simplified quality checker."""
    return ChineseSimplifiedChecker()


@pytest.fixture
def sample_glossary():
    """Sample glossary terms for consistency checks."""
    return {
        "Ariekei": "阿里耶基",
        "Embassytown": "大使城",
        "Avice": "艾维斯",
    }


# --- BaseQualityChecker tests ---


class TestBaseQualityChecker:
    """Tests for the abstract base checker interface."""

    def test_cannot_instantiate_directly(self):
        with pytest.raises(TypeError):
            BaseQualityChecker()

    def test_check_completeness_equal_paragraphs(self, zh_checker):
        original = "Paragraph one.\n\nParagraph two."
        translation = "第一段。\n\n第二段。"
        assert zh_checker.check_completeness(original, translation) is True

    def test_check_completeness_missing_paragraph(self, zh_checker):
        original = "Paragraph one.\n\nParagraph two.\n\nParagraph three."
        translation = "第一段。\n\n第二段。"
        assert zh_checker.check_completeness(original, translation) is False

    def test_check_glossary_consistency_all_present(self, zh_checker, sample_glossary):
        translation = "阿里耶基住在大使城，艾维斯也在那里。"
        issues = zh_checker.check_glossary_consistency(translation, sample_glossary)
        assert len(issues) == 0

    def test_check_glossary_consistency_missing_term(self, zh_checker, sample_glossary):
        translation = "阿里耶基住在某个城市。"
        issues = zh_checker.check_glossary_consistency(translation, sample_glossary)
        assert len(issues) >= 1
        assert any("Embassytown" in i.message or "大使城" in i.message for i in issues)

    def test_check_glossary_returns_issues(self, zh_checker, sample_glossary):
        translation = "一些随机文本。"
        issues = zh_checker.check_glossary_consistency(translation, sample_glossary)
        assert all(isinstance(i, Issue) for i in issues)


# --- ChineseSimplifiedChecker tests ---


class TestChineseSimplifiedChecker:
    """Tests for Chinese-specific quality checks."""

    def test_detects_half_width_punctuation(self, zh_checker):
        text = "这是一个句子, 有半角标点."
        issues = zh_checker.check_language_specific(text)
        assert any("punctuation" in i.category for i in issues)

    def test_accepts_full_width_punctuation(self, zh_checker):
        text = "这是一个句子，有全角标点。"
        issues = zh_checker.check_language_specific(text)
        punct_issues = [i for i in issues if "punctuation" in i.category]
        assert len(punct_issues) == 0

    def test_detects_stray_english_sentences(self, zh_checker):
        text = "翻译文本。This sentence was not translated. 更多中文。"
        issues = zh_checker.check_language_specific(text)
        assert any("untranslated" in i.category for i in issues)

    def test_accepts_english_proper_nouns(self, zh_checker):
        text = "阿里耶基是Embassytown的居民。"
        issues = zh_checker.check_language_specific(text)
        untranslated = [i for i in issues if "untranslated" in i.category]
        assert len(untranslated) == 0

    def test_no_issues_for_clean_translation(self, zh_checker):
        text = "这是一段完美的翻译文本，没有任何问题。"
        issues = zh_checker.check_language_specific(text)
        assert len(issues) == 0


# --- QualityReport tests ---


class TestQualityReport:
    """Tests for the QualityReport model."""

    def test_report_creation(self):
        report = QualityReport(chunk_id=1, language="zh-Hans")
        assert report.chunk_id == 1
        assert report.passed is True
        assert report.issue_count == 0

    def test_report_with_issues(self):
        issues = [Issue(category="punctuation", message="found comma")]
        report = QualityReport(chunk_id=1, language="zh-Hans", issues=issues, passed=False)
        assert report.issue_count == 1
        assert report.passed is False

    def test_report_to_dict(self):
        report = QualityReport(chunk_id=3, language="zh-Hans")
        d = report.to_dict()
        assert d["chunk_id"] == 3
        assert d["language"] == "zh-Hans"
        assert d["issues"] == []
        assert d["passed"] is True

    def test_run_all_checks_returns_report(self, zh_checker, sample_glossary):
        original = "The Ariekei live in Embassytown."
        translation = "阿里耶基住在大使城。"
        report = zh_checker.run_all_checks(
            chunk_id=1, original=original, translation=translation, glossary=sample_glossary
        )
        assert isinstance(report, QualityReport)
        assert report.language == "zh-Hans"
