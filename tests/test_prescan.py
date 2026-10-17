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

    def __init__(
        self,
        scan: dict[str, list[dict]],
        fail: set[str] | None = None,
        keep: list[str] | None = None,
    ) -> None:
        self.scan = scan
        self.fail = fail or set()
        self.keep = keep  # names the prune call keeps
        self.client = ScriptedClient(self.respond)

    def respond(self, system: str, user: str, json_mode: bool) -> str:
        task = _task(system)
        if task in self.fail:
            raise TranslatorError("boom")
        if task == "scan_entities":
            found = [e for key, ents in self.scan.items() if key in user for e in ents]
            return json.dumps({"entities": found, "summary": f"Summary: {user.split()[0]}"})
        if task == "book_overview":
            return "  OVERVIEW of the book.  "
        if task == "prune_glossary":
            return json.dumps({"keep": self.keep or []})
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
                    )
                ],
            }
        )
        result = scan_book(router.client, BOOK, target_lang="zh-Hans", max_chunk_chars=60)
        entities = _by_name(result)
        assert set(entities) == {"Georg", "St. Petersburg"}
        georg = entities["Georg"]
        assert georg.translation == "格奥尔格"
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

    def test_no_voice_cards_or_gender(self) -> None:
        router = Router({"friend": [_entity("Georg", "格奥尔格", gender="male")]})
        result = scan_book(router.client, BOOK, target_lang="zh-Hans")
        tasks = {_task(s) for s, _, _ in router.client.calls}
        assert tasks == {"scan_entities", "book_overview"}
        georg = _by_name(result)["Georg"]
        assert not hasattr(georg, "voice") and not hasattr(georg, "gender")

    def test_overview_from_passage_summaries_main_names_and_samples(self) -> None:
        router = Router({"friend": [_entity("Georg", "格奥尔格"), _entity("Frieda", "弗里达")]})
        result = scan_book(router.client, BOOK, target_lang="zh-Hans", max_chunk_chars=60)
        assert result.overview == "OVERVIEW of the book."
        [(system, user, json_mode)] = [
            c for c in router.client.calls if _task(c[0]) == "book_overview"
        ]
        assert "zh-Hans" in system and not json_mode
        summaries = re.findall(r"^\d+\. Summary: (\S+)$", user, re.MULTILINE)
        assert summaries == ["Georg", '"Georg,"', "Georg", "His"]  # every passage, in order
        assert "Georg (格奥尔格)" in user and "Frieda (弗里达)" in user
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

    def test_failed_overview_call_degrades_gracefully(self) -> None:
        router = Router({"friend": [_entity("Georg", "格奥尔格")]}, fail={"book_overview"})
        result = scan_book(router.client, BOOK, target_lang="zh-Hans")
        assert list(_by_name(result)) == ["Georg"]
        assert result.overview == ""

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
        # "bank" is not a category: it becomes "general", which is not kept.
        assert result.entities == []

    def test_keeps_only_people_and_places(self) -> None:
        router = Router(
            {
                "friend": [
                    _entity("Georg", "格奥尔格"),
                    _entity("St. Petersburg", "圣彼得堡", "place"),
                    _entity("Frieda", "弗里达", "organization"),
                    _entity("Bendemann", "本德曼", "technical"),
                ]
            }
        )
        result = scan_book(router.client, BOOK, target_lang="zh-Hans")
        assert sorted(e.english for e in result.entities) == ["Georg", "St. Petersburg"]

    def test_empty_book_makes_no_calls(self) -> None:
        router = Router({})
        assert scan_book(router.client, [], target_lang="zh-Hans") == ScanResult()
        assert router.client.calls == []


def test_mock_client_runs_the_whole_scan() -> None:
    result = scan_book(MockLLMClient(), BOOK, target_lang="zh-Hans")
    names = [e.english for e in result.entities]
    assert "Georg" in names
    assert result.overview


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


def test_scan_prompt_asks_for_a_passage_summary_and_no_gender() -> None:
    from bookbridge.harness.prompts import build_scan_prompt

    system, _ = build_scan_prompt("x", target_lang="zh-Hans")
    assert '"summary"' in system
    assert "gender" not in system


def test_scan_prompt_asks_for_people_places_other_and_a_standard_translation_flag() -> None:
    from bookbridge.harness.prompts import build_scan_prompt

    system, _ = build_scan_prompt("x", target_lang="zh-Hans")
    assert '"person"|"place"|"other"' in system
    assert '"standard_translation": true|false' in system
    for example in ("countries", "geological periods", "species"):
        assert example in system


def test_overview_prompt_asks_for_plot_characters_and_style_in_the_target_language() -> None:
    from bookbridge.harness.prompts import build_overview_prompt

    system, user = build_overview_prompt(
        ["Georg writes a letter.", "His father judges him."],
        [("Georg", "格奥尔格")],
        ["Sample one."],
        target_lang="zh-Hans",
    )
    assert "Task: book_overview" in system and "zh-Hans" in system
    for part in ("storyline", "characters", "tone"):
        assert part in system.lower()
    assert "1. Georg writes a letter.\n2. His father judges him." in user
    assert "- Georg (格奥尔格)" in user
    assert "Sample one." in user


# --- progress and stop (Phase 5 follow-up) -----------------------------------


def test_reports_progress_after_every_passage_then_the_overview() -> None:
    router = Router({"Georg": [_entity("Georg", "格奥尔格")]})
    seen: list[tuple[int, int]] = []

    def progress(done: int, total: int) -> bool:
        seen.append((done, total))
        return True

    scan_book(router.client, BOOK, target_lang="zh-Hans", max_chunk_chars=60, progress=progress)

    passages = sum(1 for c in router.client.calls if _task(c[0]) == "scan_entities")
    total = passages + 1  # + the overview
    assert passages > 1
    assert seen == [(i, total) for i in range(1, total + 1)]


def test_stops_when_progress_says_so() -> None:
    from bookbridge.harness.prescan import ScanStopped

    router = Router({"Georg": [_entity("Georg", "格奥尔格")]})

    def progress(done: int, total: int) -> bool:
        return done < 1  # stop right after the first passage

    with pytest.raises(ScanStopped):
        scan_book(router.client, BOOK, target_lang="zh-Hans", max_chunk_chars=60, progress=progress)
    assert [_task(c[0]) for c in router.client.calls] == ["scan_entities"]


# --- glossary size: no standard-translation names, at most MAX_GLOSSARY_TERMS --


def test_names_with_a_standard_translation_are_dropped() -> None:
    router = Router(
        {
            "friend": [
                _entity("Georg", "格奥尔格"),
                _entity("St. Petersburg", "圣彼得堡", "place", standard_translation=True),
            ]
        }
    )
    result = scan_book(router.client, BOOK, target_lang="zh-Hans")
    assert [e.english for e in result.entities] == ["Georg"]


def test_no_prune_call_while_under_the_cap() -> None:
    router = Router({"friend": [_entity("Georg", "格奥尔格"), _entity("Frieda", "弗里达")]})
    scan_book(router.client, BOOK, target_lang="zh-Hans", max_terms=2)
    assert "prune_glossary" not in {_task(s) for s, _, _ in router.client.calls}


def test_model_prunes_to_the_cap_counting_aliases() -> None:
    router = Router(
        {
            "friend": [
                _entity(
                    "Georg",
                    "格奥尔格",
                    aliases=[{"name": "Mr. Bendemann", "translation": "本德曼先生"}],
                ),
                _entity("Frieda", "弗里达"),
                _entity("St. Petersburg", "圣彼得堡", "place"),
            ]
        },
        keep=["Frieda", "St. Petersburg", "Unknown Name"],
    )
    result = scan_book(router.client, BOOK, target_lang="zh-Hans", max_terms=3)
    assert sorted(e.english for e in result.entities) == ["Frieda", "St. Petersburg"]
    [(system, user, json_mode)] = [
        c for c in router.client.calls if _task(c[0]) == "prune_glossary"
    ]
    assert json_mode and "3" in system
    assert "Georg (格奥尔格)" in user and "Mr. Bendemann" in user


def test_rows_over_the_cap_after_pruning_are_cut_by_mentions() -> None:
    router = Router(
        {"friend": [_entity("Georg", "格奥尔格"), _entity("Frieda", "弗里达")]},
        keep=["Georg", "Frieda"],  # the model ignores the cap
    )
    result = scan_book(router.client, BOOK, target_lang="zh-Hans", max_terms=1)
    assert [e.english for e in result.entities] == ["Georg"]  # most mentioned


def test_failed_prune_call_keeps_the_most_mentioned() -> None:
    router = Router(
        {"friend": [_entity("Frieda", "弗里达"), _entity("Georg", "格奥尔格")]},
        fail={"prune_glossary"},
    )
    result = scan_book(router.client, BOOK, target_lang="zh-Hans", max_terms=1)
    assert [e.english for e in result.entities] == ["Georg"]


def test_default_cap_is_200() -> None:
    from bookbridge.harness.prescan import MAX_GLOSSARY_TERMS

    assert MAX_GLOSSARY_TERMS == 200


def test_names_mentioned_only_once_are_dropped() -> None:
    # Frieda and St. Petersburg each appear in one paragraph of BOOK.
    router = Router(
        {
            "friend": [
                _entity("Georg", "格奥尔格"),
                _entity("Frieda", "弗里达"),
                _entity("St. Petersburg", "圣彼得堡", "place"),
            ]
        }
    )
    result = scan_book(router.client, BOOK, target_lang="zh-Hans")
    assert [e.english for e in result.entities] == ["Georg"]


def test_overview_prompt_leaves_out_people_only_quoted_or_thanked() -> None:
    from bookbridge.harness.prompts import build_overview_prompt

    system, _ = build_overview_prompt([], [], [], target_lang="zh-Hans")
    for word in ("epigraphs", "acknowledgements", "non-fiction"):
        assert word in system
