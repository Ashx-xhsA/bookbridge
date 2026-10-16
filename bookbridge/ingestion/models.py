"""Data models for the ingestion pipeline."""

from dataclasses import dataclass, field


class IngestionError(ValueError):
    """Raised when an uploaded book cannot be read. Messages are safe to show users."""


@dataclass
class Chapter:
    """A chapter of a book: a title plus its paragraphs in reading order."""

    number: int
    title: str
    paragraphs: list[str] = field(default_factory=list)


@dataclass
class Book:
    """A parsed book, independent of its source format (EPUB or TXT)."""

    source_file: str
    chapters: list[Chapter] = field(default_factory=list)
