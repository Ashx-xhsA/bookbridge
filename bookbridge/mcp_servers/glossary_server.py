"""Glossary MCP Server for BookBridge.

Exposes the glossary SQLite database as MCP tools and resources,
enabling Claude Code to query, add, and search glossary terms
during translation workflows.

Usage:
    python -m bookbridge.mcp_servers.glossary_server --db glossary.db
"""

import argparse
import json
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from bookbridge.glossary.store import GlossaryStore

mcp = FastMCP(
    "BookBridge Glossary",
    instructions="Manage glossary terms for consistent book translation",
)

_store: GlossaryStore | None = None


def _get_store() -> GlossaryStore:
    """Return the global GlossaryStore instance, raising if not initialized."""
    if _store is None:
        msg = "Glossary store not initialized. Pass --db <path> when starting the server."
        raise RuntimeError(msg)
    return _store


@mcp.tool()
def lookup_terms(chunk_id: int, target_lang: str) -> str:
    """Look up glossary terms relevant to a specific chunk with their translations.

    Args:
        chunk_id: The chunk number to find terms for.
        target_lang: Target language code (e.g., 'zh-Hans', 'es').

    Returns:
        JSON string with matching terms and their translations.
    """
    store = _get_store()
    all_terms = store.list_terms()
    results = []
    for term in all_terms:
        translations = store.get_translations(term.id)
        lang_translations = [t for t in translations if t.language_code == target_lang]
        entry = term.to_dict()
        entry["translations"] = [t.to_dict() for t in lang_translations]
        results.append(entry)
    return json.dumps(results, indent=2, ensure_ascii=False)


@mcp.tool()
def add_term(english: str, category: str, context: str) -> str:
    """Add a new term to the glossary.

    Args:
        english: The English term to add (e.g., 'Ariekei', 'Embassytown').
        category: Term category: 'character', 'place', 'species', 'concept', or 'invented'.
        context: A sentence showing how the term is used.

    Returns:
        JSON string with the created term details.
    """
    store = _get_store()
    term = store.add_term(english, category, context)
    return json.dumps(term.to_dict(), indent=2, ensure_ascii=False)


@mcp.tool()
def add_translation(term_id: int, language_code: str, translation: str) -> str:
    """Add or update a translation for an existing glossary term.

    Args:
        term_id: The ID of the term to translate.
        language_code: Target language code (e.g., 'zh-Hans', 'es').
        translation: The translated text for this term.

    Returns:
        JSON string confirming the translation was added.
    """
    store = _get_store()
    tr = store.add_translation(term_id, language_code, translation)
    return json.dumps(tr.to_dict(), indent=2, ensure_ascii=False)


@mcp.tool()
def list_terms() -> str:
    """List all terms in the glossary with their categories.

    Returns:
        JSON array of all glossary terms.
    """
    store = _get_store()
    terms = store.list_terms()
    return json.dumps([t.to_dict() for t in terms], indent=2, ensure_ascii=False)


@mcp.tool()
def search_glossary(query: str) -> str:
    """Search glossary terms by keyword (case-insensitive partial match).

    Args:
        query: Search keyword to match against English term names.

    Returns:
        JSON array of matching terms.
    """
    store = _get_store()
    results = store.search_terms(query)
    return json.dumps([t.to_dict() for t in results], indent=2, ensure_ascii=False)


@mcp.resource("glossary://terms")
def glossary_terms_resource() -> str:
    """Full glossary as a JSON resource.

    Returns all terms with their translations in all languages.
    """
    store = _get_store()
    all_terms = store.list_terms()
    results = []
    for term in all_terms:
        translations = store.get_translations(term.id)
        entry = term.to_dict()
        entry["translations"] = [t.to_dict() for t in translations]
        results.append(entry)
    return json.dumps(results, indent=2, ensure_ascii=False)


def main() -> None:
    """Parse args, initialize the store, and run the MCP server."""
    parser = argparse.ArgumentParser(description="BookBridge Glossary MCP Server")
    parser.add_argument(
        "--db",
        type=str,
        required=True,
        help="Path to the SQLite glossary database file",
    )
    args = parser.parse_args()

    global _store
    db_path = Path(args.db)
    _store = GlossaryStore(db_path)
    _store.create_db()

    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
