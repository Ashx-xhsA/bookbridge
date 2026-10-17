"""Phase 3 pre-scan: whole-book entity extraction, merge, voice cards, style guide."""

from __future__ import annotations

import json
import re

import pytest

from bookbridge.harness.models import ProviderError, TranslatorError
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

    def test_raises_when_every_passage_fails(self) -> None:
        def respond(system: str, user: str, json_mode: bool) -> str:
            if _task(system) == "scan_entities":
                raise TranslatorError("boom")
            return Router({}).respond(system, user, json_mode)

        with pytest.raises(TranslatorError, match="every passage"):
            scan_book(ScriptedClient(respond), BOOK, target_lang="zh-Hans", max_chunk_chars=60)

    def test_auth_error_aborts_the_scan_immediately(self) -> None:
        client = ScriptedClient(
            lambda s, u, j: (_ for _ in ()).throw(ProviderError("401", retryable=False))
        )
        with pytest.raises(ProviderError):
            scan_book(client, BOOK, target_lang="zh-Hans", max_chunk_chars=60)
        assert len(client.calls) == 1

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
                    _entity("St. Petersburg", "圣彼得堡", "bank"),
                    "not a dict",  # type: ignore[list-item]
                ]
            }
        )
        result = scan_book(router.client, BOOK, target_lang="zh-Hans")
        assert [(e.english, e.category) for e in result.entities] == [("St. Petersburg", "general")]

    def test_empty_book_makes_no_calls(self) -> None:
        router = Router({})
        assert scan_book(router.client, [], target_lang="zh-Hans") == ScanResult()
        assert router.client.calls == []


def test_mock_client_runs_the_whole_scan() -> None:
    result = scan_book(MockLLMClient(), BOOK, target_lang="zh-Hans")
    names = [e.english for e in result.entities]
    assert "Georg" in names
    assert result.style_guide


SAFETY_BOOK = [
    [
        "Gregor told his friend that Mr. Samsa was home.",
        "Hermann, his father, sat with Grete in the office of the firm.",
        "Georg Bendemann wrote; Georg sealed it. The head clerk left for St. Petersburg.",
        "Mother called the Chief.",
    ]
]


class TestMergeSafety:
    """Found in the DeepSeek smoke run: shared or generic aliases fused people."""

    def _scan(self, entities: list[dict]) -> dict:
        router = Router({"friend": entities})
        return _by_name(scan_book(router.client, SAFETY_BOOK, target_lang="zh-Hans"))

    def test_alias_claimed_by_two_entities_is_dropped_and_does_not_merge(self) -> None:
        entities = self._scan(
            [
                _entity(
                    "Gregor",
                    "格里高尔",
                    aliases=[{"name": "Mr. Samsa", "translation": "萨姆沙先生"}],
                ),
                _entity(
                    "Hermann",
                    "赫尔曼",
                    aliases=[{"name": "Mr. Samsa", "translation": "萨姆沙先生"}],
                ),
            ]
        )
        assert set(entities) == {"Gregor", "Hermann"}
        assert entities["Gregor"].aliases == ()
        assert entities["Hermann"].aliases == ()

    def test_lowercase_alias_naming_another_entity_is_dropped_not_merged(self) -> None:
        entities = self._scan(
            [
                _entity("Gregor", "格里高尔", aliases=[{"name": "father", "translation": "父亲"}]),
                _entity("Hermann", "赫尔曼"),
            ]
        )
        assert set(entities) == {"Gregor", "Hermann"}
        assert entities["Gregor"].aliases == ()

    def test_capitalised_alias_naming_another_entity_still_merges(self) -> None:
        entities = self._scan(
            [
                _entity("Georg", "格奥尔格"),
                _entity(
                    "Georg Bendemann",
                    "格奥尔格·本德曼",
                    aliases=[{"name": "Georg", "translation": "格奥尔格"}],
                ),
            ]
        )
        assert list(entities) == ["Georg"]
        assert [a.english for a in entities["Georg"].aliases] == ["Georg Bendemann"]


class TestProperNounsOnly:
    """The bible holds proper nouns only — never firm, office, head clerk, Mother."""

    def _scan(self, entities: list[dict]) -> dict:
        return TestMergeSafety._scan(None, entities)  # type: ignore[arg-type]

    def test_common_nouns_are_dropped_whatever_their_category(self) -> None:
        entities = self._scan(
            [
                _entity("the sofa", "沙发", "general"),
                _entity("office", "办公室", "organization"),
                _entity("firm", "公司", "organization"),
                _entity("head clerk", "首席秘书", "person"),
                _entity("mithril", "秘银", "technical"),
                _entity("St. Petersburg", "圣彼得堡", "place"),
            ]
        )
        assert set(entities) == {"St. Petersburg"}

    def test_titles_and_kinship_words_are_dropped(self) -> None:
        entities = self._scan(
            [_entity("Mother", "母亲"), _entity("Chief", "主任"), _entity("Grete", "格蕾特")]
        )
        assert set(entities) == {"Grete"}

    def test_common_noun_aliases_are_dropped(self) -> None:
        entities = self._scan(
            [_entity("Grete", "格蕾特", aliases=[{"name": "the sister", "translation": "妹妹"}])]
        )
        assert entities["Grete"].aliases == ()

    def test_proper_alias_replaces_a_common_noun_main_name(self) -> None:
        entities = self._scan(
            [_entity("the sister", "妹妹", aliases=[{"name": "Grete", "translation": "格蕾特"}])]
        )
        assert set(entities) == {"Grete"}
        assert entities["Grete"].translation == "格蕾特"

    def test_names_not_written_that_way_in_the_book_are_dropped(self) -> None:
        entities = self._scan(
            [
                _entity("Head Clerk", "首席秘书"),
                _entity("Frodo", "弗罗多"),
                _entity("Grete", "格蕾特"),
            ]
        )
        assert set(entities) == {"Grete"}


def test_scan_prompt_asks_to_skip_ordinary_nouns_and_shared_names() -> None:
    from bookbridge.harness.prompts import build_scan_prompt

    system, _ = build_scan_prompt("x", target_lang="zh-Hans")
    assert "ordinary" in system
    assert "proper nouns only" in system.lower()
    assert "the old wizard" not in system
    assert "only if it refers to that one entity" in system
