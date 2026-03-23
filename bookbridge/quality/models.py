"""Data models for the quality checking module."""

from dataclasses import dataclass, field


@dataclass
class Issue:
    """A quality issue found during translation checking."""

    category: str
    message: str
    severity: str = "warning"

    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "message": self.message,
            "severity": self.severity,
        }


@dataclass
class QualityReport:
    """Aggregated quality report for a translated chunk."""

    chunk_id: int
    language: str
    issues: list[Issue] = field(default_factory=list)
    passed: bool = True

    @property
    def issue_count(self) -> int:
        return len(self.issues)

    def to_dict(self) -> dict:
        return {
            "chunk_id": self.chunk_id,
            "language": self.language,
            "issues": [i.to_dict() for i in self.issues],
            "passed": self.passed,
            "issue_count": self.issue_count,
        }
