"""Tests for the glossary MCP server tools."""

import json

import pytest

import bookbridge.mcp_servers.glossary_server as server
from bookbridge.glossary.store import GlossaryStore


@pytest.fixture(autouse=True)
def _init_store(tmp_path):
    """Initialize a fresh glossary store for each test."""
    store = GlossaryStore(tmp_path / "test.db")
    store.create_db()
    server._store = store
    yield
    server._store = None


class TestMCPTools:
    """Tests for MCP tool functions."""

    def test_list_terms_empty(self):
        result = json.loads(server.list_terms())
        assert result == []

    def test_add_term_and_list(self):
        result = json.loads(server.add_term("Ariekei", "species", "Alien species"))
        assert result["english"] == "Ariekei"
        assert result["category"] == "species"

        all_terms = json.loads(server.list_terms())
        assert len(all_terms) == 1

    def test_search_glossary(self):
        server.add_term("Ariekei", "species", "ctx")
        server.add_term("Embassytown", "place", "ctx")

        results = json.loads(server.search_glossary("Ariekei"))
        assert len(results) == 1
        assert results[0]["english"] == "Ariekei"

    def test_search_no_match(self):
        server.add_term("Ariekei", "species", "ctx")
        results = json.loads(server.search_glossary("nonexistent"))
        assert results == []

    def test_add_translation(self):
        term = json.loads(server.add_term("Ariekei", "species", "ctx"))
        tr = json.loads(server.add_translation(term["id"], "zh-Hans", "阿里耶基"))
        assert tr["translation"] == "阿里耶基"
        assert tr["language_code"] == "zh-Hans"

    def test_lookup_terms_with_translations(self):
        term = json.loads(server.add_term("Embassytown", "place", "ctx"))
        server.add_translation(term["id"], "zh-Hans", "大使城")

        results = json.loads(server.lookup_terms(chunk_id=1, target_lang="zh-Hans"))
        assert len(results) == 1
        assert results[0]["translations"][0]["translation"] == "大使城"

    def test_lookup_terms_filters_by_language(self):
        term = json.loads(server.add_term("Embassytown", "place", "ctx"))
        server.add_translation(term["id"], "zh-Hans", "大使城")
        server.add_translation(term["id"], "es", "Ciudad Embajada")

        results = json.loads(server.lookup_terms(chunk_id=1, target_lang="es"))
        assert len(results[0]["translations"]) == 1
        assert results[0]["translations"][0]["language_code"] == "es"
