"""Phase 6 eval runner: one config over the chosen chapters, scored."""

from __future__ import annotations

import json

import pytest

from bookbridge.harness.models import AliasTarget, Usage
from bookbridge.harness.prescan import ScannedEntity
from bookbridge.harness.prompts import BIBLE_HEADING, CONTEXT_HEADING, GLOSSARY_HEADING
from bookbridge.harness.providers.mock import MockLLMClient
from evals.book import ChapterPair
from evals.configs import CONFIGS
from evals.reference import ReferenceTerm
from evals.run import (
    glossary_for,
    parse_used_renderings,
    results_payload,
    run_config,
    summarize,
)


class RecordingMock(MockLLMClient):
    """The deterministic mock, keeping every prompt it was sent."""

    def __init__(self) -> None:
        super().__init__()
        self.systems: list[str] = []
        self.users: list[str] = []

    def complete(self, system: str, user: str, *, json_mode: bool = False) -> str:
        self.systems.append(system)
        self.users.append(user)
        return super().complete(system, user, json_mode=json_mode)


ESPERANZA = ScannedEntity(
    english="Esperanza",
    translation="埃斯佩兰萨",
    category="place",
    aliases=(AliasTarget("Hope", "希望湾"),),
    mentions=4,
)
CHAPTERS = [
    ChapterPair("Intro", ["Esperanza lies south.", "At Esperanza, ice."], ["埃斯佩兰萨在南方。"]),
    ChapterPair("1. Thaw", ["Hope Bay again.", "Snow at Esperanza."], ["又是希望湾。"]),
]
REFERENCE = [ReferenceTerm("Esperanza", ("埃斯佩兰萨",), "place")]


def test_glossary_includes_aliases_pointing_at_their_entity() -> None:
    entries = glossary_for([ESPERANZA])
    assert [(g.english, g.translation) for g in entries] == [
        ("Esperanza", "埃斯佩兰萨"),
        ("Hope", "希望湾"),
    ]
    assert entries[1].alias_of == AliasTarget("Esperanza", "埃斯佩兰萨")


class TestRunConfig:
    def _run(self, name: str) -> tuple[RecordingMock, dict]:
        client = RecordingMock()
        run = run_config(
            client,
            CHAPTERS,
            CONFIGS[name],
            entities=[ESPERANZA],
            overview="A book about the south.",
            reference=REFERENCE,
            target_lang="zh-Hans",
            judge=MockLLMClient(),
        )
        return client, run

    def test_a_sends_no_glossary_no_context_and_no_overview(self) -> None:
        client, run = self._run("A")
        prompts = list(zip(client.systems, client.users, strict=True))
        translate = [(s, u) for s, u in prompts if s.startswith("Task: translate")]
        assert translate, "translation calls were made"
        for system, user in translate:
            assert GLOSSARY_HEADING not in system and BIBLE_HEADING not in system
            assert CONTEXT_HEADING not in user
        assert run["segments"] == 4 and run["failed"] == 0

    def test_b_sends_the_glossary_and_context_across_chapters_but_no_overview(self) -> None:
        client, _ = self._run("B")
        assert any(GLOSSARY_HEADING in s for s in client.systems)
        # Each chapter fits one batch, so context can only come from the chapter before.
        assert any(CONTEXT_HEADING in u and "At Esperanza, ice." in u for u in client.users)
        assert not any(BIBLE_HEADING in s for s in client.systems)

    def test_c_adds_the_overview(self) -> None:
        client, _ = self._run("C")
        assert any(BIBLE_HEADING in s and "A book about the south." in s for s in client.systems)

    def test_reports_scores_usage_and_the_per_segment_text_separately(self) -> None:
        _, run = self._run("B")
        assert set(run) >= {
            "agreement",
            "consistency",
            "truncation",
            "failed",
            "usage",
            "seconds",
            "texts",
        }
        assert run["agreement"]["total"] == 3  # Esperanza occurs in 3 segments
        assert isinstance(run["usage"], dict) and run["usage"]["calls"] > 0
        assert [len(c["translations"]) for c in run["texts"]] == [2, 2]


def test_parse_used_renderings_keeps_words_found_in_that_translation() -> None:
    pairs = [("Esperanza lies south.", "埃斯佩兰萨在南方。"), ("Hope Bay again.", "又是希望湾。")]
    reply = json.dumps(
        {"1": {"Esperanza": "埃斯佩兰萨"}, "2": {"Esperanza": "希望湾", "Hope": "希望"}}
    )
    assert parse_used_renderings(reply, pairs, ["Esperanza", "Hope"]) == {
        0: {"Esperanza": "埃斯佩兰萨"},
        1: {"Hope": "希望"},  # "Esperanza" is not in source 2, so its answer is ignored
    }


def test_summarize_reports_mean_and_spread_per_config() -> None:
    runs = [
        {"agreement": {"rate": 0.5}, "consistency": {"rate": 0.8}, "truncation": 0.0, "failed": 0,
         "usage": {"calls": 10, "prompt_tokens": 1000, "completion_tokens": 500}, "seconds": 20.0,
         "source_chars": 2000},
        {"agreement": {"rate": 0.7}, "consistency": {"rate": 1.0}, "truncation": 0.1, "failed": 1,
         "usage": {"calls": 12, "prompt_tokens": 1200, "completion_tokens": 600}, "seconds": 30.0,
         "source_chars": 2000},
    ]  # fmt: skip
    s = summarize(runs)
    assert s["agreement"] == {"mean": pytest.approx(0.6), "min": 0.5, "max": 0.7}
    assert s["consistency"]["mean"] == pytest.approx(0.9)
    assert s["tokens_per_1k_chars"] == pytest.approx((1500 + 1800) / 2 / 2)
    assert s["seconds_per_1k_chars"] == pytest.approx(12.5)
    assert s["runs"] == 2


def test_results_payload_holds_numbers_not_book_text() -> None:
    run = {
        "agreement": {"hits": 1, "total": 2, "rate": 0.5, "per_term": {"Esperanza": [1, 2]}},
        "consistency": {"hits": 2, "total": 2, "rate": 1.0, "per_term": {}},
        "truncation": 0.0, "failed": 0, "segments": 2, "source_chars": 40,
        "usage": vars(Usage(calls=3)), "seconds": 1.0, "review": None,
        "texts": [
            {"title": "Intro", "sources": ["Esperanza lies south."], "translations": ["埃斯"]}
        ],
    }  # fmt: skip
    payload = results_payload(
        book="otherlands", chapters=[0, 1], model="deepseek-chat", commit="abc1234",
        runs={"B": [run]}, scan_usage={"calls": 5}, judge_usage={"calls": 2},
    )  # fmt: skip
    text = json.dumps(payload, ensure_ascii=False)
    assert "Esperanza lies south." not in text and "埃斯" not in text
    assert payload["configs"]["B"]["summary"]["runs"] == 1
    assert payload["configs"]["B"]["runs"][0]["agreement"]["per_term"] == {"Esperanza": [1, 2]}
