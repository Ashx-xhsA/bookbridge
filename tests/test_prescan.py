"""Phase 3 pre-scan: whole-book entity extraction, merge, voice cards, style guide."""

from __future__ import annotations

import json
import re

from bookbridge.harness.models import TranslatorError
from bookbridge.harness.prescan import ScanResult, scan_book
from bookbridge.harness.providers.mock import MockLLMClient
from tests.test_harness import ScriptedClient

_TASK = re.compile(r"^Task: (\w+)$", re.MULTILINE)


def _task(system: str) -> str:
    found = _TASK.search(system)
    assert found, "every pre-scan prompt names its task"
    return found.group(1)


def _entity(name: str, translation: str, category: str = "person", **kw: object) -> dict:
    return {"name": name, "translation": translation, "category": category, **kw}


class Router:
    """Replies per task; `scan` maps a word that must be in the passage to entities."""

    def __init__(self, scan: dict[str, list[dict]], fail: set[str] | None = None) -> None:
        self.scan = scan
        self.fail = fail or set()
        self.client = ScriptedClient(self.respond)

    def respond(self, system: str, user: str, json_mode: bool) -> str:
        task = _task(system)
        if task in self.fail:
            raise TranslatorError("boom")
        if task == "scan_entities":
            found = [e for key, ents in self.scan.items() if key in user for e in ents]
            return json.dumps({"entities": found})
        if task == "voice_cards":
            names = re.findall(r"^### (.+)$", user, re.MULTILINE)
            return json.dumps({"voices": [{"name": n, "voice": f"voice of {n}"} for n in names]})
        if task == "style_guide":
            return "Restrained, plain prose."
        raise AssertionError(task)


def _by_name(result: ScanResult) -> dict:
    return {e.english: e for e in result.entities}


BOOK = [
    ["Georg wrote to his friend in St. Petersburg.", '"Georg," said Frieda, "write to him."'],
    ["Georg Bendemann looked at the river.", "His father sat in the dark room."],
]


class TestScanBook:
    def test_merges_entities_across_chunks_by_name_and_alias(self) -> None:
        router = Router(
            {
                "friend": [
                    _entity("Georg", "格奥尔格"),
                    _entity("St. Petersburg", "圣彼得堡", "place"),
                ],
                "river": [
                    _entity(
                        "Georg Bendemann",
                        "格奥尔格·本德曼",
                        aliases=[{"name": "Georg", "translation": "格奥尔格"}],
                        gender="male",
                    )
                ],
            }
        )
        result = scan_book(router.client, BOOK, target_lang="zh-Hans", max_chunk_chars=60)
        entities = _by_name(result)
        assert set(entities) == {"Georg", "St. Petersburg"}
        georg = entities["Georg"]
        assert georg.translation == "格奥尔格"
        assert georg.gender == "male"
        assert [(a.english, a.translation) for a in georg.aliases] == [
            ("Georg Bendemann", "格奥尔格·本德曼")
        ]

    def test_one_scan_call_per_chunk(self) -> None:
        router = Router({})
        scan_book(router.client, BOOK, target_lang="zh-Hans", max_chunk_chars=60)
        scans = [s for s, _, _ in router.client.calls if _task(s) == "scan_entities"]
        assert len(scans) == 4
        assert all(j for s, _, j in router.client.calls if _task(s) == "scan_entities")

    def test_counts_mentions_by_paragraph_including_aliases(self) -> None:
        router = Router(
            {
                "friend": [
                    _entity(
                        "Georg",
                        "格奥尔格",
                        aliases=[{"name": "Georg Bendemann", "translation": "本德曼"}],
                    ),
                    _entity("Frieda", "弗里达"),
                ]
            }
        )
        result = scan_book(router.client, BOOK, target_lang="zh-Hans")
        assert _by_name(result)["Georg"].mentions == 3
        assert _by_name(result)["Frieda"].mentions == 1

    def test_entities_sorted_by_mentions(self) -> None:
        router = Router({"friend": [_entity("Frieda", "弗里达"), _entity("Georg", "格奥尔格")]})
        result = scan_book(router.client, BOOK, target_lang="zh-Hans")
        assert [e.english for e in result.entities] == ["Georg", "Frieda"]

    def test_voice_cards_only_for_top_people_with_dialogue_samples(self) -> None:
        router = Router(
            {
                "friend": [
                    _entity("Georg", "格奥尔格"),
                    _entity("Frieda", "弗里达"),
                    _entity("St. Petersburg", "圣彼得堡", "place"),
                ]
            }
        )
        result = scan_book(router.client, BOOK, target_lang="zh-Hans", max_voice_cards=1)
        entities = _by_name(result)
        assert entities["Georg"].voice == "voice of Georg"
        assert entities["Frieda"].voice is None
        assert entities["St. Petersburg"].voice is None
        [voice_user] = [u for s, u, _ in router.client.calls if _task(s) == "voice_cards"]
        assert "said Frieda" in voice_user  # a quoted line that names Georg is a sample

    def test_style_guide_from_samples(self) -> None:
        router = Router({})
        result = scan_book(router.client, BOOK, target_lang="zh-Hans")
        assert result.style_guide == "Restrained, plain prose."
        [(system, user, json_mode)] = [
            c for c in router.client.calls if _task(c[0]) == "style_guide"
        ]
        assert "zh-Hans" in system and not json_mode
        assert "St. Petersburg" in user and "dark room" in user  # start and end of the book

    def test_failed_chunk_is_skipped(self) -> None:
        def respond(system: str, user: str, json_mode: bool) -> str:
            if _task(system) == "scan_entities" and "river" in user:
                raise TranslatorError("boom")
            return Router({"friend": [_entity("Georg", "格奥尔格")]}).respond(
                system, user, json_mode
            )

        result = scan_book(ScriptedClient(respond), BOOK, target_lang="zh-Hans", max_chunk_chars=60)
        assert list(_by_name(result)) == ["Georg"]

    def test_failed_voice_and_style_calls_degrade_gracefully(self) -> None:
        router = Router(
            {"friend": [_entity("Georg", "格奥尔格")]}, fail={"voice_cards", "style_guide"}
        )
        result = scan_book(router.client, BOOK, target_lang="zh-Hans")
        assert _by_name(result)["Georg"].voice is None
        assert result.style_guide == ""

    def test_drops_malformed_entities_and_normalises_category(self) -> None:
        router = Router(
            {
                "friend": [
                    {"name": "", "translation": "空"},
                    {"name": "NoTranslation"},
                    _entity("Petersburg Bank", "彼得堡银行", "bank"),
                    "not a dict",  # type: ignore[list-item]
                ]
            }
        )
        result = scan_book(router.client, BOOK, target_lang="zh-Hans")
        assert [(e.english, e.category) for e in result.entities] == [
            ("Petersburg Bank", "general")
        ]

    def test_empty_book_makes_no_calls(self) -> None:
        router = Router({})
        assert scan_book(router.client, [], target_lang="zh-Hans") == ScanResult()
        assert router.client.calls == []


def test_mock_client_runs_the_whole_scan() -> None:
    result = scan_book(MockLLMClient(), BOOK, target_lang="zh-Hans")
    names = [e.english for e in result.entities]
    assert "Georg" in names
    assert result.style_guide
