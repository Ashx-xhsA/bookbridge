"""Phase 4c: translate → review → revise loop inside translate_segments."""

from __future__ import annotations

import json
import re
from collections.abc import Callable

import pytest

from bookbridge.harness.config import TranslationConfig
from bookbridge.harness.models import GlossaryEntry, ProviderError, Usage
from bookbridge.harness.parsing import format_segments, parse_segments
from bookbridge.harness.pipeline import SegmentOutcome, translate_segments
from bookbridge.harness.prompts import CONTEXT_HEADING, SEGMENTS_HEADING
from bookbridge.harness.providers.mock import MockLLMClient

FRODO = GlossaryEntry("Frodo", "弗罗多", "person")
_SOURCE_RE = re.compile(r"^\[source\] (.*)$", re.MULTILINE)


def _task(system: str) -> str:
    found = re.search(r"^Task: (\w+)$", system, re.MULTILINE)
    return found.group(1) if found else ""


def _no_issues(user: str) -> str:
    return json.dumps({"issues": []})


class Router:
    """Fake LLM that answers by task; each handler gets the user message."""

    def __init__(
        self,
        translate: Callable[[str], str] = lambda s: f"T:{s}",
        review: Callable[[str], str] = _no_issues,
        revise: Callable[[str], str] = lambda s: f"R:{s}",
    ) -> None:
        self.translate, self.review, self.revise = translate, review, revise
        self.calls: list[tuple[str, str, bool]] = []
        self.usage = Usage()

    def tasks(self) -> list[str]:
        return [_task(system) for system, _, _ in self.calls]

    def complete(self, system: str, user: str, *, json_mode: bool = False) -> str:
        self.calls.append((system, user, json_mode))
        task = _task(system)
        if task == "review":
            assert json_mode
            return self.review(user)
        sources = _SOURCE_RE.findall(user.split("## Segments to revise", 1)[-1])
        if task == "revise":
            return format_segments([self.revise(s) for s in sources])
        block = user.split(SEGMENTS_HEADING, 1)[1]
        segs = parse_segments(block, expected=block.count("<<<"))
        return format_segments([self.translate(s) for s in segs])


def _run(client: Router, segments: list[str], **cfg) -> object:
    config = TranslationConfig(**{"max_batch_chars": 6000, **cfg})
    return translate_segments(
        client, segments, target_lang="zh-Hans", glossary=[FRODO], config=config
    )


class TestSwitch:
    def test_default_is_one_retry(self) -> None:
        assert TranslationConfig().review_max_retries == 1

    @pytest.mark.parametrize("value", [-1, 3])
    def test_rejects_out_of_range(self, value: int) -> None:
        with pytest.raises(ValueError, match="review_max_retries"):
            TranslationConfig(review_max_retries=value)

    def test_zero_makes_no_review_calls(self) -> None:
        client = Router()
        result = _run(client, ["Frodo ran."], review_max_retries=0)
        assert client.tasks() == ["translate"]
        assert result.reviewed == set()
        assert result.issues == {}


class TestReview:
    def test_clean_batch_costs_one_review_call(self) -> None:
        client = Router(translate=lambda s: "弗罗多跑了。")
        result = _run(client, ["Frodo ran.", "Frodo hid."])
        assert client.tasks() == ["translate", "review"]
        assert result.reviewed == {0, 1}
        assert result.issues == {}
        assert result.review.flagged == 0

    def test_rule_error_is_revised_and_rechecked(self) -> None:
        client = Router(translate=lambda s: "佛罗多跑了。", revise=lambda s: "弗罗多跑了。")
        result = _run(client, ["Frodo ran."])
        assert client.tasks() == ["translate", "review", "revise", "review"]
        assert result.translations == ["弗罗多跑了。"]
        assert result.issues == {}
        assert result.reviewed == {0}
        assert (result.review.flagged, result.review.fixed) == (1, 1)

    def test_reviewer_error_triggers_revision(self) -> None:
        verdicts = iter(
            [
                json.dumps({"issues": [{"segment": 1, "category": "pronoun",
                                        "severity": "error", "message": "她 → 他"}]}),
                json.dumps({"issues": []}),
            ]
        )  # fmt: skip
        client = Router(
            translate=lambda s: "她说。", review=lambda u: next(verdicts), revise=lambda s: "他说。"
        )
        result = _run(client, ["He said."])
        assert result.translations == ["他说。"]
        assert "她 → 他" in client.calls[2][1]  # the revise prompt lists the problem

    def test_warnings_are_kept_but_not_revised(self) -> None:
        client = Router(translate=lambda s: "他走了, 又回来了。")
        result = _run(client, ["He left and came back."])
        assert client.tasks() == ["translate", "review"]
        assert [i.category for i in result.issues[0]] == ["punctuation"]
        assert result.reviewed == {0}

    def test_only_flagged_segments_are_sent_for_revision(self) -> None:
        client = Router(
            translate=lambda s: "佛罗多。" if "Frodo" in s else "下雨了。",
            revise=lambda s: "弗罗多。",
        )
        result = _run(client, ["Frodo.", "It rained."])
        revise_user = client.calls[2][1]
        assert "[source] Frodo." in revise_user and "It rained." not in revise_user
        assert result.translations == ["弗罗多。", "下雨了。"]

    def test_stops_after_max_retries_and_keeps_the_issue(self) -> None:
        client = Router(translate=lambda s: "佛罗多。", revise=lambda s: "佛罗多！")
        result = _run(client, ["Frodo."])
        assert client.tasks() == ["translate", "review", "revise", "review"]
        assert result.translations == ["佛罗多！"]
        assert [i.category for i in result.issues[0]] == ["term"]
        assert (result.review.flagged, result.review.fixed) == (1, 0)

    def test_two_retries_allow_a_second_revision(self) -> None:
        attempts = iter(["佛罗多！", "弗罗多！"])
        client = Router(translate=lambda s: "佛罗多。", revise=lambda s: next(attempts))
        result = _run(client, ["Frodo."], review_max_retries=2)
        assert client.tasks() == ["translate", "review", "revise", "review", "revise", "review"]
        assert result.translations == ["弗罗多！"]
        assert result.review.fixed == 1

    def test_misaligned_revision_keeps_the_previous_translation(self) -> None:
        client = Router(translate=lambda s: "佛罗多。")

        def complete(system: str, user: str, *, json_mode: bool = False) -> str:
            if _task(system) == "revise":
                client.calls.append((system, user, json_mode))
                return "no markers at all\n\nand two parts"
            return Router.complete(client, system, user, json_mode=json_mode)

        client.complete = complete  # type: ignore[method-assign]
        result = _run(client, ["Frodo.", "Frodo again."])
        assert result.translations == ["佛罗多。", "佛罗多。"]
        assert set(result.issues) == {0, 1}

    def test_failed_review_call_keeps_translation_unreviewed(self) -> None:
        def review(user: str) -> str:
            raise ProviderError("503", retryable=False)

        client = Router(review=review)
        result = _run(client, ["It rained."])
        assert result.translations == ["T:It rained."]
        assert result.reviewed == set()
        assert result.aborted is False

    def test_revised_text_feeds_the_rolling_window(self) -> None:
        client = Router(translate=lambda s: "佛罗多。" if "Frodo" in s else "x。",
                        revise=lambda s: "弗罗多。")  # fmt: skip
        _run(client, ["Frodo.", "Next."], max_batch_chars=6, context_window=1)
        next_translate = [u for s, u, _ in client.calls if _task(s) == "translate"][1]
        assert CONTEXT_HEADING in next_translate
        assert "[translation] 弗罗多。" in next_translate

    def test_failed_segments_are_not_reviewed(self) -> None:
        client = Router(translate=lambda s: "")  # empty output → misaligned → failed
        result = _run(client, ["It rained."])
        assert result.translations == [None]
        assert "review" not in client.tasks()


class TestProgress:
    def test_reports_outcomes_after_review(self) -> None:
        seen: list[list[SegmentOutcome]] = []
        client = Router(translate=lambda s: "佛罗多。", revise=lambda s: "弗罗多。")
        translate_segments(
            client, ["Frodo.", "Next."], target_lang="zh-Hans", glossary=[FRODO],
            config=TranslationConfig(max_batch_chars=6), on_progress=seen.append,
        )  # fmt: skip
        assert [[(o.index, o.translation) for o in batch] for batch in seen] == [
            [(0, "弗罗多。")],
            [(1, "佛罗多。")],  # "Next." has no Frodo; translation kept as is
        ]
        assert seen[0][0].reviewed is True and seen[0][0].issues == []


class TestMock:
    def test_mock_client_runs_the_whole_loop(self) -> None:
        client = MockLLMClient()
        result = translate_segments(
            client, ["Frodo ran home quickly that night."], target_lang="zh-Hans",
            glossary=[FRODO],
        )  # fmt: skip
        assert result.translations[0] is not None
        assert result.reviewed == {0}
        assert client.usage.calls == 4  # translate, review, revise, review
