"""Data models for the glossary module."""

from dataclasses import dataclass


@dataclass
class Term:
    """A glossary term extracted from source text."""

    id: int
    english: str
    category: str
    notes: str
    first_chunk: int

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "english": self.english,
            "category": self.category,
            "notes": self.notes,
            "first_chunk": self.first_chunk,
        }


@dataclass
class Translation:
    """A translation of a glossary term in a specific language."""

    term_id: int
    language_code: str
    translation: str
    approved: bool = False

    def to_dict(self) -> dict:
        return {
            "term_id": self.term_id,
            "language_code": self.language_code,
            "translation": self.translation,
            "approved": self.approved,
        }
