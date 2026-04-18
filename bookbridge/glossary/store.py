"""SQLite-backed glossary storage for translation consistency."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

from bookbridge.glossary.models import Term, Translation

TERM_COLUMNS = "id, english, category, notes, first_chunk"
DEFAULT_FIRST_CHUNK = 0


class GlossaryStore:
    """Manages glossary terms and translations in a SQLite database.

    Args:
        db_path: Path to the SQLite database file.
    """

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    @contextmanager
    def _connect(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(str(self.db_path))
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
        finally:
            conn.close()

    @staticmethod
    def _row_to_term(row: tuple) -> Term:
        return Term(id=row[0], english=row[1], category=row[2], notes=row[3], first_chunk=row[4])

    def create_db(self) -> None:
        """Create the glossary tables if they don't already exist."""
        with self._connect() as conn:
            conn.execute(
                """CREATE TABLE IF NOT EXISTS terms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    english TEXT NOT NULL,
                    category TEXT NOT NULL,
                    notes TEXT NOT NULL DEFAULT '',
                    first_chunk INTEGER NOT NULL DEFAULT 0
                )"""
            )
            conn.execute(
                """CREATE TABLE IF NOT EXISTS translations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    term_id INTEGER NOT NULL,
                    language_code TEXT NOT NULL,
                    translation TEXT NOT NULL,
                    approved INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (term_id) REFERENCES terms(id)
                )"""
            )
            conn.commit()

    def add_term(self, english: str, category: str, context: str) -> Term:
        """Add a new term to the glossary.

        Args:
            english: The English term.
            category: Term category (character, place, species, concept, etc.).
            context: Context sentence where the term was found.

        Returns:
            The newly created Term with its assigned ID.
        """
        with self._connect() as conn:
            cursor = conn.execute(
                "INSERT INTO terms (english, category, notes, first_chunk) VALUES (?, ?, ?, ?)",
                (english, category, context, DEFAULT_FIRST_CHUNK),
            )
            conn.commit()
            return Term(
                id=cursor.lastrowid,
                english=english,
                category=category,
                notes=context,
                first_chunk=DEFAULT_FIRST_CHUNK,
            )

    def get_term(self, term_id: int) -> Term | None:
        """Retrieve a term by its ID.

        Args:
            term_id: The unique term identifier.

        Returns:
            The Term if found, None otherwise.
        """
        with self._connect() as conn:
            row = conn.execute(
                f"SELECT {TERM_COLUMNS} FROM terms WHERE id = ?",
                (term_id,),
            ).fetchone()
            if row is None:
                return None
            return self._row_to_term(row)

    def list_terms(self) -> list[Term]:
        """List all terms in the glossary.

        Returns:
            List of all Term objects, ordered by ID.
        """
        with self._connect() as conn:
            rows = conn.execute(f"SELECT {TERM_COLUMNS} FROM terms ORDER BY id").fetchall()
            return [self._row_to_term(r) for r in rows]

    def add_translation(self, term_id: int, language_code: str, translation: str) -> Translation:
        """Add a translation for a term.

        Args:
            term_id: The ID of the term to translate.
            language_code: Language code (e.g., 'zh-Hans', 'es').
            translation: The translated text.

        Returns:
            The newly created Translation.
        """
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO translations (term_id, language_code, translation) VALUES (?, ?, ?)",
                (term_id, language_code, translation),
            )
            conn.commit()
            return Translation(
                term_id=term_id, language_code=language_code, translation=translation
            )

    def get_translations(self, term_id: int) -> list[Translation]:
        """Get all translations for a term.

        Args:
            term_id: The ID of the term.

        Returns:
            List of Translation objects for the term.
        """
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT term_id, language_code, translation, approved "
                "FROM translations WHERE term_id = ?",
                (term_id,),
            ).fetchall()
            return [
                Translation(
                    term_id=r[0], language_code=r[1], translation=r[2], approved=bool(r[3])
                )
                for r in rows
            ]

    def search_terms(self, query: str) -> list[Term]:
        """Search terms by keyword (case-insensitive partial match on english name).

        Args:
            query: Search keyword.

        Returns:
            List of matching Term objects.
        """
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT {TERM_COLUMNS} FROM terms WHERE english LIKE ? COLLATE NOCASE",
                (f"%{query}%",),
            ).fetchall()
            return [self._row_to_term(r) for r in rows]
