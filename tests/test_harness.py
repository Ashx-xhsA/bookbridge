"""Phase 2 harness runtime: LLM clients, segment pipeline, separate term extraction."""

from __future__ import annotations

import io
import json
import urllib.error
from collections.abc import Callable
from unittest.mock import MagicMock, patch

import pytest
from bookbridge.harness.pipeline import extract_terms, translate_segments

from bookbridge.harness import get_llm_client
from bookbridge.harness.config import TranslationConfig
from bookbridge.harness.models import (
    ContextSegment,
    GlossaryEntry,
    TranslatorError,
    Usage,
)
from bookbridge.harness.parsing import format_segments
from bookbridge.harness.prompts import CONTEXT_HEADING, SEGMENTS_HEADING
from bookbridge.harness.providers.mock import MockLLMClient
from bookbridge.harness.providers.openai_compat import OpenAICompatClient

URLOPEN = "bookbridge.harness.providers.openai_compat.urllib.request.urlopen"


class ScriptedClient:
    """Records every call; `respond(system, user, json_mode)` decides the reply."""

    def __init__(self, respond: Callable[[str, str, bool], str]) -> None:
        self.respond = respond
        self.calls: list[tuple[str, str, bool]] = []
        self.usage = Usage()

    def complete(self, system: str, user: str, *, json_mode: bool = False) -> str:
        self.calls.append((system, user, json_mode))
        return self.respond(system, user, json_mode)


def _segments_in(user: str) -> list[str]:
    """Pull the batch back out of a translation prompt (inverse of format_segments)."""
    from bookbridge.harness.parsing import parse_segments

    block = user.split(SEGMENTS_HEADING, 1)[1]
    count = block.count("<<<")
    return parse_segments(block, expected=count)


def _echo(system: str, user: str, json_mode: bool) -> str:
    return format_segments([f"T:{s}" for s in _segments_in(user)])


# ---------------------------------------------------------------------------
# translate_segments
# ---------------------------------------------------------------------------


class TestTranslateSegments:
    def test_translates_every_segment_in_order(self) -> None:
        client = ScriptedClient(_echo)
        result = translate_segments(client, ["a", "b", "c"], target_lang="zh-Hans")
        assert result.translations == ["T:a", "T:b", "T:c"]
        assert result.failed == []

    def test_one_call_per_batch(self) -> None:
        client = ScriptedClient(_echo)
        cfg = TranslationConfig(max_batch_chars=4)
        translate_segments(client, ["aaa", "bbb", "c"], target_lang="zh-Hans", config=cfg)
        assert len(client.calls) == 2

    def test_empty_input_makes_no_calls(self) -> None:
        client = ScriptedClient(_echo)
        assert translate_segments(client, [], target_lang="zh-Hans").translations == []
        assert client.calls == []

    def test_rejects_unknown_language_before_calling(self) -> None:
        client = ScriptedClient(_echo)
        with pytest.raises(ValueError, match="target_lang"):
            translate_segments(client, ["a"], target_lang="klingon")
        assert client.calls == []

    def test_rolling_window_carries_previous_batch_translation(self) -> None:
        client = ScriptedClient(_echo)
        cfg = TranslationConfig(max_batch_chars=1, context_window=1)
        translate_segments(client, ["a", "b"], target_lang="zh-Hans", config=cfg)
        second_user = client.calls[1][1]
        assert CONTEXT_HEADING in second_user
        assert "[translation] T:a" in second_user

    def test_preceding_segments_seed_the_window(self) -> None:
        client = ScriptedClient(_echo)
        preceding = [ContextSegment(source="Before.", translation="之前。")]
        translate_segments(client, ["a"], target_lang="zh-Hans", preceding=preceding)
        assert "之前。" in client.calls[0][1]

    def test_context_window_zero_sends_no_context(self) -> None:
        client = ScriptedClient(_echo)
        cfg = TranslationConfig(max_batch_chars=1, context_window=0)
        preceding = [ContextSegment(source="Before.", translation="之前。")]
        translate_segments(
            client, ["a", "b"], target_lang="zh-Hans", preceding=preceding, config=cfg
        )
        assert all(CONTEXT_HEADING not in user for _, user, _ in client.calls)

    def test_matched_glossary_differs_per_batch(self) -> None:
        client = ScriptedClient(_echo)
        glossary = [
            GlossaryEntry("Frodo", "弗罗多", "person"),
            GlossaryEntry("Sam", "山姆", "person"),
        ]
        cfg = TranslationConfig(max_batch_chars=1)
        translate_segments(
            client, ["Frodo.", "Sam."], target_lang="zh-Hans", glossary=glossary, config=cfg
        )
        first_system, second_system = client.calls[0][0], client.calls[1][0]
        assert "弗罗多" in first_system and "山姆" not in first_system
        assert "山姆" in second_system and "弗罗多" not in second_system

    def test_misaligned_batch_is_split_and_retried(self) -> None:
        def respond(system: str, user: str, json_mode: bool) -> str:
            segs = _segments_in(user)
            return "merged" if len(segs) > 1 else format_segments([f"T:{segs[0]}"])

        client = ScriptedClient(respond)
        result = translate_segments(client, ["a", "b"], target_lang="zh-Hans")
        assert result.translations == ["T:a", "T:b"]
        assert len(client.calls) == 3  # 1 failed pair + 2 singles

    def test_single_segment_is_retried_once_then_marked_failed(self) -> None:
        def respond(system: str, user: str, json_mode: bool) -> str:
            segs = _segments_in(user)
            if "bad" in segs:
                raise TranslatorError("boom")
            return format_segments([f"T:{s}" for s in segs])

        client = ScriptedClient(respond)
        cfg = TranslationConfig(max_batch_chars=1)
        result = translate_segments(client, ["a", "bad", "c"], target_lang="zh-Hans", config=cfg)
        assert result.translations == ["T:a", None, "T:c"]
        assert result.failed == [1]
        assert sum("bad" in u for _, u, _ in client.calls) == 2

    def test_failed_segment_still_appears_as_source_only_context(self) -> None:
        def respond(system: str, user: str, json_mode: bool) -> str:
            segs = _segments_in(user)
            if segs == ["bad"]:
                raise TranslatorError("boom")
            return format_segments([f"T:{s}" for s in segs])

        client = ScriptedClient(respond)
        cfg = TranslationConfig(max_batch_chars=1, context_window=1)
        translate_segments(client, ["bad", "next"], target_lang="zh-Hans", config=cfg)
        last_user = client.calls[-1][1]
        assert "[source] bad" in last_user
        assert "[translation]" not in last_user

    def test_configuration_errors_propagate(self) -> None:
        def respond(system: str, user: str, json_mode: bool) -> str:
            raise ValueError("LLM provider not configured")

        with pytest.raises(ValueError, match="not configured"):
            translate_segments(ScriptedClient(respond), ["a"], target_lang="zh-Hans")


# ---------------------------------------------------------------------------
# extract_terms — its own call, never mixed into translation output
# ---------------------------------------------------------------------------


def _terms_json(*names: str) -> str:
    return json.dumps(
        {"terms": [{"english": n, "translation": f"译{n}", "category": "person"} for n in names]}
    )


class TestExtractTerms:
    def test_uses_json_mode_and_returns_new_terms(self) -> None:
        client = ScriptedClient(lambda s, u, j: _terms_json("Frodo"))
        terms = extract_terms(client, [("Frodo ran.", "弗罗多跑了。")], target_lang="zh-Hans")
        assert [t.english for t in terms] == ["Frodo"]
        assert client.calls[0][2] is True

    def test_skips_glossary_names_and_aliases(self) -> None:
        client = ScriptedClient(lambda s, u, j: _terms_json("Gandalf", "Mithrandir", "Sam"))
        glossary = [GlossaryEntry("Gandalf", "甘道夫", "person", aliases=("Mithrandir",))]
        terms = extract_terms(client, [("x", "y")], target_lang="zh-Hans", glossary=glossary)
        assert [t.english for t in terms] == ["Sam"]
        assert "Gandalf" in client.calls[0][1]  # known terms are listed in the prompt

    def test_chunks_long_input_and_dedupes_across_chunks(self) -> None:
        client = ScriptedClient(lambda s, u, j: _terms_json("Frodo"))
        pairs = [("a" * 10, "x"), ("b" * 10, "y")]
        terms = extract_terms(client, pairs, target_lang="zh-Hans", max_chars=10)
        assert len(client.calls) == 2
        assert [t.english for t in terms] == ["Frodo"]

    def test_failed_chunk_is_skipped(self) -> None:
        def respond(system: str, user: str, json_mode: bool) -> str:
            if "aaa" in user:
                raise TranslatorError("boom")
            return _terms_json("Sam")

        client = ScriptedClient(respond)
        pairs = [("aaa", "x"), ("bbb", "y")]
        terms = extract_terms(client, pairs, target_lang="zh-Hans", max_chars=3)
        assert [t.english for t in terms] == ["Sam"]

    def test_no_pairs_makes_no_calls(self) -> None:
        client = ScriptedClient(lambda s, u, j: _terms_json("X"))
        assert extract_terms(client, [], target_lang="zh-Hans") == []
        assert client.calls == []


# ---------------------------------------------------------------------------
# MockLLMClient — deterministic, zero network
# ---------------------------------------------------------------------------


class TestMockLLMClient:
    def test_pipeline_end_to_end_tags_with_target_lang(self) -> None:
        result = translate_segments(MockLLMClient(), ["Hello.", "World."], target_lang="ja")
        assert result.translations == ["[ja] Hello.", "[ja] World."]

    def test_extraction_returns_capitalised_source_words(self) -> None:
        terms = extract_terms(
            MockLLMClient(), [("Frodo met Sam in Bree.", "x")], target_lang="zh-Hans"
        )
        assert [t.english for t in terms] == ["Frodo", "Sam", "Bree"]
        assert terms[0].translation == "[zh-Hans] Frodo"

    def test_counts_calls(self) -> None:
        client = MockLLMClient()
        translate_segments(client, ["a"], target_lang="ja")
        assert client.usage.calls == 1


# ---------------------------------------------------------------------------
# OpenAICompatClient — the one HTTP implementation
# ---------------------------------------------------------------------------


def _response(body: dict | bytes) -> MagicMock:
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()
    resp = MagicMock()
    resp.read.return_value = raw
    resp.__enter__.return_value = resp
    return resp


_OK = {
    "choices": [{"message": {"content": "你好"}}],
    "usage": {"prompt_tokens": 12, "completion_tokens": 3},
}


def _client() -> OpenAICompatClient:
    return OpenAICompatClient(
        api_key="sk-test", base_url="https://api.example.com/v1/", model="m-1"
    )


class TestOpenAICompatClient:
    def test_builds_request_and_returns_content(self) -> None:
        with patch(URLOPEN, return_value=_response(_OK)) as mock_open:
            out = _client().complete("SYS", "USER")
        assert out == "你好"
        req = mock_open.call_args[0][0]
        assert req.full_url == "https://api.example.com/v1/chat/completions"
        assert req.get_header("Authorization") == "Bearer sk-test"
        body = json.loads(req.data.decode())
        assert body["model"] == "m-1"
        assert body["temperature"] == 0
        assert body["messages"] == [
            {"role": "system", "content": "SYS"},
            {"role": "user", "content": "USER"},
        ]
        assert "response_format" not in body

    def test_json_mode_sets_response_format(self) -> None:
        with patch(URLOPEN, return_value=_response(_OK)) as mock_open:
            _client().complete("s", "u", json_mode=True)
        body = json.loads(mock_open.call_args[0][0].data.decode())
        assert body["response_format"] == {"type": "json_object"}

    def test_records_usage(self) -> None:
        client = _client()
        with patch(URLOPEN, return_value=_response(_OK)):
            client.complete("s", "u")
            client.complete("s", "u")
        assert client.usage == Usage(calls=2, prompt_tokens=24, completion_tokens=6)

    def test_http_error_raises_generic_translator_error(self) -> None:
        err = urllib.error.HTTPError("u", 500, "boom", {}, io.BytesIO(b"secret detail"))  # type: ignore[arg-type]
        with patch(URLOPEN, side_effect=err), pytest.raises(TranslatorError) as exc:
            _client().complete("s", "u")
        assert "secret" not in str(exc.value)

    def test_timeout_raises_translator_error(self) -> None:
        with patch(URLOPEN, side_effect=TimeoutError()), pytest.raises(TranslatorError):
            _client().complete("s", "u")

    @pytest.mark.parametrize(
        "body",
        [
            b"not json",
            {"choices": []},
            {"choices": [{"message": {"content": ""}}]},
            {"choices": [{"message": {"content": 42}}]},
        ],
    )
    def test_unusable_body_raises_translator_error(self, body: dict | bytes) -> None:
        with patch(URLOPEN, return_value=_response(body)), pytest.raises(TranslatorError):
            _client().complete("s", "u")

    def test_timeout_env_is_clamped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "5000")
        with patch(URLOPEN, return_value=_response(_OK)) as mock_open:
            _client().complete("s", "u")
        assert mock_open.call_args.kwargs["timeout"] == 600.0

    def test_missing_config_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="not configured"):
            OpenAICompatClient(api_key="", base_url="https://x/v1", model="m")


# ---------------------------------------------------------------------------
# get_llm_client — explicit credentials win, else TRANSLATION_PROVIDER
# ---------------------------------------------------------------------------


class TestGetLLMClient:
    def test_defaults_to_mock(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("TRANSLATION_PROVIDER", raising=False)
        assert isinstance(get_llm_client(), MockLLMClient)

    def test_provider_name_is_case_insensitive(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TRANSLATION_PROVIDER", "MOCK")
        assert isinstance(get_llm_client(), MockLLMClient)

    def test_unknown_provider_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TRANSLATION_PROVIDER", "bogus")
        with pytest.raises(ValueError, match="[Uu]nknown"):
            get_llm_client()

    def test_openai_compat_reads_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TRANSLATION_PROVIDER", "openai_compat")
        monkeypatch.setenv("LLM_API_KEY", "sk-env")
        monkeypatch.setenv("LLM_BASE_URL", "https://env.example/v1")
        monkeypatch.setenv("LLM_MODEL", "env-model")
        client = get_llm_client()
        assert isinstance(client, OpenAICompatClient)
        assert client.model == "env-model"

    def test_explicit_key_uses_openai_compat_with_env_fallback(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("TRANSLATION_PROVIDER", raising=False)
        monkeypatch.setenv("LLM_BASE_URL", "https://env.example/v1")
        monkeypatch.setenv("LLM_MODEL", "env-model")
        client = get_llm_client(api_key="sk-user", model="user-model")
        assert isinstance(client, OpenAICompatClient)
        assert (client.base_url, client.model) == ("https://env.example/v1", "user-model")
