"""Abstract base class for per-language translation quality checkers."""

from abc import ABC, abstractmethod

from bookbridge.quality.models import Issue


class BaseQualityChecker(ABC):
    """Language-specific checks on one translated segment.

    Language-independent checks (terms, length, copied source) live in
    `quality.checks`; subclasses add what only makes sense for one script.
    """

    @property
    @abstractmethod
    def language(self) -> str:
        """Return the language code this checker handles (e.g., 'zh-Hans')."""

    @abstractmethod
    def check_language_specific(self, translation: str) -> list[Issue]:
        """Return the issues found in `translation`."""
