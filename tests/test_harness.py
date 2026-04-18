"""Failing tests for bookbridge.harness module (TDD red phase — issue #52)."""

from unittest.mock import MagicMock, patch

import pytest

from bookbridge.harness import get_translator
from bookbridge.harness.providers.claude import ClaudeTranslator
from bookbridge.harness.providers.mock import MockTranslator
from bookbridge.harness.providers.mymemory import MYMEMORY_URL, MyMemoryTranslator

# ---------------------------------------------------------------------------
# get_translator() factory — reads TRANSLATION_PROVIDER env var
# ---------------------------------------------------------------------------


class TestGetTranslator:
    def test_defaults_to_mymemory(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("TRANSLATION_PROVIDER", raising=False)
        assert isinstance(get_translator(), MyMemoryTranslator)

    def test_respects_mock_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TRANSLATION_PROVIDER", "mock")
        assert isinstance(get_translator(), MockTranslator)

    def test_respects_claude_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TRANSLATION_PROVIDER", "claude")
        assert isinstance(get_translator(), ClaudeTranslator)

    def test_case_insensitive(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TRANSLATION_PROVIDER", "MOCK")
        assert isinstance(get_translator(), MockTranslator)

    def test_unknown_provider_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TRANSLATION_PROVIDER", "bogus")
        with pytest.raises(ValueError, match="[Uu]nknown"):
            get_translator()


# ---------------------------------------------------------------------------
# MockTranslator — zero network, prefix with target lang
# ---------------------------------------------------------------------------


class TestMockTranslator:
    def test_returns_tagged_source(self) -> None:
        out = MockTranslator().translate("hello world", "en", "zh-Hans")
        assert out == "[zh-Hans] hello world"

    def test_rejects_empty_text(self) -> None:
        with pytest.raises(ValueError, match="[Ee]mpty"):
            MockTranslator().translate("", "en", "zh-Hans")

    def test_rejects_unknown_target_lang(self) -> None:
        with pytest.raises(ValueError, match="target_lang"):
            MockTranslator().translate("hi", "en", "klingon")

    def test_rejects_unknown_source_lang(self) -> None:
        with pytest.raises(ValueError, match="source_lang"):
            MockTranslator().translate("hi", "xx", "zh-Hans")

    def test_rejects_oversized_text(self) -> None:
        huge = "x" * (200 * 1024 + 1)
        with pytest.raises(ValueError, match="[Ss]ize|[Tt]oo large"):
            MockTranslator().translate(huge, "en", "zh-Hans")


# ---------------------------------------------------------------------------
# MyMemoryTranslator — calls hardcoded URL, parses responseData.translatedText
# ---------------------------------------------------------------------------


class TestMyMemoryTranslator:
    @staticmethod
    def _fake_response(body: bytes) -> MagicMock:
        fake = MagicMock()
        fake.read.return_value = body
        fake.__enter__ = lambda self: self
        fake.__exit__ = lambda self, *a: None
        return fake

    def test_url_is_the_hardcoded_constant(self) -> None:
        assert MYMEMORY_URL == "https://api.mymemory.translated.net/get"

    def test_calls_correct_url_and_parses_response(self) -> None:
        fake = self._fake_response(b'{"responseData": {"translatedText": "\\u4f60\\u597d"}}')
        with patch(
            "bookbridge.harness.providers.mymemory.urllib.request.urlopen",
            return_value=fake,
        ) as mock_open:
            result = MyMemoryTranslator().translate("hello", "en", "zh-Hans")

        assert result == "你好"
        called_url = mock_open.call_args[0][0]
        assert called_url.startswith(MYMEMORY_URL + "?")
        assert "q=hello" in called_url
        # '|' is URL-encoded as %7C
        assert "langpair=en%7Czh-Hans" in called_url

    def test_empty_translation_raises(self) -> None:
        fake = self._fake_response(b'{"responseData": {"translatedText": ""}}')
        with patch(
            "bookbridge.harness.providers.mymemory.urllib.request.urlopen",
            return_value=fake,
        ):
            with pytest.raises(Exception, match="[Tt]ranslat"):
                MyMemoryTranslator().translate("hello", "en", "zh-Hans")

    def test_validates_input_before_network_call(self) -> None:
        with patch("bookbridge.harness.providers.mymemory.urllib.request.urlopen") as mock_open:
            with pytest.raises(ValueError):
                MyMemoryTranslator().translate("hi", "en", "klingon")
            mock_open.assert_not_called()


# ---------------------------------------------------------------------------
# ClaudeTranslator — stub until ANTHROPIC_API_KEY is wired in a later issue
# ---------------------------------------------------------------------------


class TestClaudeTranslator:
    def test_raises_not_implemented(self) -> None:
        with pytest.raises(NotImplementedError, match="ANTHROPIC_API_KEY"):
            ClaudeTranslator().translate("hello", "en", "zh-Hans")
