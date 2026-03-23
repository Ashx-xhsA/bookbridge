"""Abstract base class for per-language translation quality checkers."""

from abc import ABC, abstractmethod

from bookbridge.quality.models import Issue, QualityReport

PARAGRAPH_SEPARATOR = "\n\n"


class BaseQualityChecker(ABC):
    """Base class that all language-specific quality checkers inherit from.

    Subclasses must implement:
        - check_language_specific(translation) -> list[Issue]
        - language property
    """

    @property
    @abstractmethod
    def language(self) -> str:
        """Return the language code this checker handles (e.g., 'zh-Hans')."""

    @abstractmethod
    def check_language_specific(self, translation: str) -> list[Issue]:
        """Run language-specific quality checks on translated text.

        Args:
            translation: The translated text to check.

        Returns:
            List of Issue objects found.
        """

    def check_completeness(self, original: str, translation: str) -> bool:
        """Check that translation has the same number of paragraphs as the original.

        Args:
            original: The source text.
            translation: The translated text.

        Returns:
            True if paragraph counts match.
        """
        original_count = len(
            [p for p in original.split(PARAGRAPH_SEPARATOR) if p.strip()]
        )
        translation_count = len(
            [p for p in translation.split(PARAGRAPH_SEPARATOR) if p.strip()]
        )
        return original_count == translation_count

    def check_glossary_consistency(
        self, translation: str, glossary: dict[str, str]
    ) -> list[Issue]:
        """Check that expected glossary translations appear in the text.

        Args:
            translation: The translated text.
            glossary: Mapping of English term -> expected translation.

        Returns:
            List of Issue objects for missing term translations.
        """
        issues: list[Issue] = []
        for english, expected in glossary.items():
            if expected not in translation:
                issues.append(
                    Issue(
                        category="glossary",
                        message=f"Expected translation '{expected}' for '{english}' not found",
                        severity="warning",
                    )
                )
        return issues

    def run_all_checks(
        self,
        chunk_id: int,
        original: str,
        translation: str,
        glossary: dict[str, str],
    ) -> QualityReport:
        """Run all quality checks and return an aggregated report.

        Args:
            chunk_id: The chunk being checked.
            original: The source text.
            translation: The translated text.
            glossary: Mapping of English term -> expected translation.

        Returns:
            QualityReport with all issues found.
        """
        issues: list[Issue] = []
        issues.extend(self.check_glossary_consistency(translation, glossary))
        issues.extend(self.check_language_specific(translation))

        if not self.check_completeness(original, translation):
            issues.append(
                Issue(
                    category="completeness",
                    message="Paragraph count mismatch between original and translation",
                    severity="error",
                )
            )

        return QualityReport(
            chunk_id=chunk_id,
            language=self.language,
            issues=issues,
            passed=len(issues) == 0,
        )
