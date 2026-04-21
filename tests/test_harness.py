"""Failing tests for bookbridge.harness module (TDD red phase — issue #52)."""

import json
import urllib.error
from unittest.mock import MagicMock, patch

import pytest
from bookbridge.harness.providers.openai_compat import OpenAICompatTranslator

from bookbridge.harness import get_translator
from bookbridge.harness.providers.claude import ClaudeTranslator
from bookbridge.harness.providers.mock import MockTranslator
from bookbridge.harness.providers.mymemory import MYMEMORY_URL, MyMemoryTranslator
from bookbridge.harness.translator import TranslatorError

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

    def test_respects_openai_compat_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TRANSLATION_PROVIDER", "openai_compat")
        assert isinstance(get_translator(), OpenAICompatTranslator)


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


# ---------------------------------------------------------------------------
# OpenAICompatTranslator — issue #60 (red phase — module not yet implemented)
# ---------------------------------------------------------------------------


def _fake_response(body: bytes) -> MagicMock:
    """Return a MagicMock that mimics a urllib context-manager response."""
    fake = MagicMock()
    fake.read.return_value = body
    fake.__enter__ = lambda self: self
    fake.__exit__ = lambda self, *a: None
    return fake


_HAPPY_BODY = json.dumps({"choices": [{"message": {"content": "你好"}}]}).encode()

_EMPTY_CONTENT_BODY = json.dumps({"choices": [{"message": {"content": ""}}]}).encode()


class TestOpenAICompatTranslator:
    """Red-phase tests for OpenAICompatTranslator (bookbridge/harness/providers/openai_compat.py)."""

    def _set_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LLM_BASE_URL", "https://api.example.com/v1")
        monkeypatch.setenv("LLM_API_KEY", "sk-test")
        monkeypatch.setenv("LLM_MODEL", "gpt-4o-mini")

    # 1. Happy path ----------------------------------------------------------------

    def test_happy_path_builds_request_and_returns_content(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        self._set_env(monkeypatch)
        fake = _fake_response(_HAPPY_BODY)

        with patch(
            "bookbridge.harness.providers.openai_compat.urllib.request.urlopen",
            return_value=fake,
        ) as mock_open:
            result = OpenAICompatTranslator().translate("hello", "en", "zh-Hans")

        assert result == "你好"
        assert mock_open.call_count == 1

        req = mock_open.call_args[0][0]
        assert req.full_url == "https://api.example.com/v1/chat/completions"
        assert req.get_header("Authorization") == "Bearer sk-test"

        body = json.loads(req.data.decode())
        assert body["model"] == "gpt-4o-mini"
        assert body["temperature"] == 0
        messages = body["messages"]
        assert isinstance(messages, list) and len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"
        assert "hello" in messages[1]["content"]
        system_content = messages[0]["content"]
        assert "en" in system_content
        assert "zh-Hans" in system_content

    # 2. Non-2xx status raises TranslatorError ------------------------------------

    def test_non_2xx_status_raises_translator_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._set_env(monkeypatch)
        http_error = urllib.error.HTTPError(
            url="https://api.example.com/v1/chat/completions",
            code=500,
            msg="Server Error",
            hdrs={},  # type: ignore[arg-type]
            fp=None,
        )

        with patch(
            "bookbridge.harness.providers.openai_compat.urllib.request.urlopen",
            side_effect=http_error,
        ):
            with pytest.raises(TranslatorError):
                OpenAICompatTranslator().translate("hello", "en", "zh-Hans")

    # 3. Empty content in response raises TranslatorError -------------------------

    def test_empty_content_raises_translator_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._set_env(monkeypatch)
        fake = _fake_response(_EMPTY_CONTENT_BODY)

        with patch(
            "bookbridge.harness.providers.openai_compat.urllib.request.urlopen",
            return_value=fake,
        ):
            with pytest.raises(TranslatorError):
                OpenAICompatTranslator().translate("hello", "en", "zh-Hans")

    # 4. Missing API key raises ValueError before any network call ----------------

    def test_missing_api_key_raises_value_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LLM_BASE_URL", "https://api.example.com/v1")
        monkeypatch.setenv("LLM_MODEL", "gpt-4o-mini")
        monkeypatch.delenv("LLM_API_KEY", raising=False)

        with patch(
            "bookbridge.harness.providers.openai_compat.urllib.request.urlopen"
        ) as mock_open:
            with pytest.raises(ValueError):
                OpenAICompatTranslator().translate("hi", "en", "zh-Hans")
            mock_open.assert_not_called()

    # 5. Invalid target lang raises ValueError before any network call ------------

    def test_validates_input_before_network_call(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._set_env(monkeypatch)

        with patch(
            "bookbridge.harness.providers.openai_compat.urllib.request.urlopen"
        ) as mock_open:
            with pytest.raises(ValueError):
                OpenAICompatTranslator().translate("hi", "en", "klingon")
            mock_open.assert_not_called()
