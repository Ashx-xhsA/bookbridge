"""Tests for the glossary store module."""


from bookbridge.glossary.models import Term, Translation
from bookbridge.glossary.store import GlossaryStore


class TestGlossaryStoreInit:
    """Tests for database initialization."""

    def test_create_db_creates_tables(self, tmp_path):
        db_path = tmp_path / "test.db"
        store = GlossaryStore(db_path)
        store.create_db()
        assert db_path.exists()

    def test_create_db_is_idempotent(self, tmp_path):
        db_path = tmp_path / "test.db"
        store = GlossaryStore(db_path)
        store.create_db()
        store.create_db()
        assert db_path.exists()


class TestAddAndGetTerm:
    """Tests for adding and retrieving terms."""

    def test_add_term_returns_term(self, tmp_path):
        store = GlossaryStore(tmp_path / "test.db")
        store.create_db()
        term = store.add_term("Ariekei", "species", "Alien species in Embassytown")
        assert isinstance(term, Term)
        assert term.english == "Ariekei"
        assert term.category == "species"

    def test_add_term_assigns_id(self, tmp_path):
        store = GlossaryStore(tmp_path / "test.db")
        store.create_db()
        term = store.add_term("Ariekei", "species", "context")
        assert term.id >= 1

    def test_get_term_returns_added_term(self, tmp_path):
        store = GlossaryStore(tmp_path / "test.db")
        store.create_db()
        added = store.add_term("Embassytown", "place", "Main setting")
        fetched = store.get_term(added.id)
        assert fetched is not None
        assert fetched.english == "Embassytown"
        assert fetched.category == "place"

    def test_get_term_returns_none_for_missing(self, tmp_path):
        store = GlossaryStore(tmp_path / "test.db")
        store.create_db()
        assert store.get_term(999) is None

    def test_add_multiple_terms_unique_ids(self, tmp_path):
        store = GlossaryStore(tmp_path / "test.db")
        store.create_db()
        t1 = store.add_term("Ariekei", "species", "ctx1")
        t2 = store.add_term("Embassytown", "place", "ctx2")
        assert t1.id != t2.id


class TestListTerms:
    """Tests for listing all terms."""

    def test_list_terms_empty_db(self, tmp_path):
        store = GlossaryStore(tmp_path / "test.db")
        store.create_db()
        assert store.list_terms() == []

    def test_list_terms_returns_all(self, tmp_path):
        store = GlossaryStore(tmp_path / "test.db")
        store.create_db()
        store.add_term("Ariekei", "species", "ctx")
        store.add_term("Embassytown", "place", "ctx")
        store.add_term("Avice", "character", "ctx")
        terms = store.list_terms()
        assert len(terms) == 3
        names = {t.english for t in terms}
        assert names == {"Ariekei", "Embassytown", "Avice"}


class TestTranslations:
    """Tests for adding and retrieving translations."""

    def test_add_translation_returns_translation(self, tmp_path):
        store = GlossaryStore(tmp_path / "test.db")
        store.create_db()
        term = store.add_term("Ariekei", "species", "ctx")
        tr = store.add_translation(term.id, "zh-Hans", "阿里耶基")
        assert isinstance(tr, Translation)
        assert tr.translation == "阿里耶基"
        assert tr.language_code == "zh-Hans"

    def test_get_translations_for_term(self, tmp_path):
        store = GlossaryStore(tmp_path / "test.db")
        store.create_db()
        term = store.add_term("Embassytown", "place", "ctx")
        store.add_translation(term.id, "zh-Hans", "大使城")
        store.add_translation(term.id, "es", "Ciudad Embajada")
        translations = store.get_translations(term.id)
        assert len(translations) == 2
        langs = {t.language_code for t in translations}
        assert langs == {"zh-Hans", "es"}

    def test_get_translations_empty(self, tmp_path):
        store = GlossaryStore(tmp_path / "test.db")
        store.create_db()
        term = store.add_term("Ariekei", "species", "ctx")
        assert store.get_translations(term.id) == []


class TestSearchTerms:
    """Tests for searching terms by keyword."""

    def test_search_by_english_name(self, tmp_path):
        store = GlossaryStore(tmp_path / "test.db")
        store.create_db()
        store.add_term("Ariekei", "species", "ctx")
        store.add_term("Embassytown", "place", "ctx")
        results = store.search_terms("Ariekei")
        assert len(results) == 1
        assert results[0].english == "Ariekei"

    def test_search_case_insensitive(self, tmp_path):
        store = GlossaryStore(tmp_path / "test.db")
        store.create_db()
        store.add_term("Ariekei", "species", "ctx")
        results = store.search_terms("ariekei")
        assert len(results) == 1

    def test_search_partial_match(self, tmp_path):
        store = GlossaryStore(tmp_path / "test.db")
        store.create_db()
        store.add_term("Embassytown", "place", "ctx")
        results = store.search_terms("embassy")
        assert len(results) == 1

    def test_search_no_results(self, tmp_path):
        store = GlossaryStore(tmp_path / "test.db")
        store.create_db()
        store.add_term("Ariekei", "species", "ctx")
        results = store.search_terms("nonexistent")
        assert len(results) == 0
