"""Data models for the quality checking module."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

Severity = Literal["error", "warning"]


@dataclass(frozen=True)
class Issue:
    """A problem found in one translated segment.

    Errors send the segment back for revision; warnings are only recorded.
    """

    category: str
    message: str
    severity: Severity = "warning"

    def to_dict(self) -> dict[str, str]:
        return {"category": self.category, "message": self.message, "severity": self.severity}


def has_errors(issues: Iterable[Issue]) -> bool:
    return any(i.severity == "error" for i in issues)
