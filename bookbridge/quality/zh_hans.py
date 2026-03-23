"""Chinese Simplified quality checker for translation validation."""

import re

from bookbridge.quality.base import BaseQualityChecker
from bookbridge.quality.models import Issue

HALF_WIDTH_PUNCTUATION = re.compile(r"[\u4e00-\u9fff][,.\?!;:]\s")

# Matches sequences of 5+ ASCII word characters (likely untranslated English sentences)
# but not short proper nouns like "Embassytown" or "Ariekei" which are acceptable
STRAY_ENGLISH_SENTENCE = re.compile(r"[A-Za-z]{2,}\s+[A-Za-z]{2,}\s+[A-Za-z]{2,}")


class ChineseSimplifiedChecker(BaseQualityChecker):
    """Quality checker for Chinese Simplified (zh-Hans) translations."""

    @property
    def language(self) -> str:
        return "zh-Hans"

    def check_language_specific(self, translation: str) -> list[Issue]:
        """Check Chinese-specific quality: punctuation and untranslated segments.

        Args:
            translation: The Chinese translated text.

        Returns:
            List of Issue objects found.
        """
        issues: list[Issue] = []
        issues.extend(self._check_punctuation(translation))
        issues.extend(self._check_untranslated(translation))
        return issues

    def _check_punctuation(self, text: str) -> list[Issue]:
        """Detect half-width punctuation after Chinese characters."""
        matches = HALF_WIDTH_PUNCTUATION.findall(text)
        if matches:
            return [
                Issue(
                    category="punctuation",
                    message=f"Found {len(matches)} half-width punctuation mark(s) after Chinese characters",
                    severity="warning",
                )
            ]
        return []

    def _check_untranslated(self, text: str) -> list[Issue]:
        """Detect likely untranslated English sentences in the translation."""
        matches = STRAY_ENGLISH_SENTENCE.findall(text)
        if matches:
            return [
                Issue(
                    category="untranslated",
                    message=f"Found likely untranslated English: '{matches[0][:50]}...'",
                    severity="error",
                )
            ]
        return []
