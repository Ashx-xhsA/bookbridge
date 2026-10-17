"""Phase 6 eval: translate the chosen chapters under configs A/B/C and score them.

    set -a && source .env && set +a
    python -m evals.run --book evals/books/otherlands --chapters 0-3 --configs A,B,C --runs 2

- The bible scan (glossary + overview) is done once and cached per chapter
  selection, so B and C share it.
- Each run translates the chapters in order; the context window carries the
  end of one chapter into the next, as in production.
- A judge call per chapter reads each finished translation and reports how
  each reference term was rendered, for the consistency score. Judge and
  scan usage are reported separately from each config's cost.
- evals/results/<date>-<commit>.json holds numbers only (it is committed);
  the translations of each run go to <book>/runs/ (gitignored, copyrighted).
"""

from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import time
from collections.abc import Sequence
from pathlib import Path

from bookbridge.harness import get_llm_client
from bookbridge.harness.models import (
    AliasTarget,
    BookBible,
    ContextSegment,
    GlossaryEntry,
    LLMClient,
)
from bookbridge.harness.parsing import strip_code_fence
from bookbridge.harness.pipeline import translate_segments
from bookbridge.harness.prescan import ScannedEntity
from bookbridge.harness.retry import complete_with_retry
from evals.book import ChapterPair, chapter_range, load_book
from evals.configs import EvalConfig, select
from evals.metrics import TermScore, agreement, consistency, occurrences, truncation_rate
from evals.reference import ReferenceTerm, load_reference
from evals.scan_cache import ensure_scan

RESULTS_DIR = Path(__file__).parent / "results"
# Paragraphs of the previous chapter offered as context (production sends 10).
PRECEDING = 10


def glossary_for(entities: Sequence[ScannedEntity]) -> list[GlossaryEntry]:
    entries = []
    for e in entities:
        entries.append(GlossaryEntry(e.english, e.translation, e.category))
        target = AliasTarget(e.english, e.translation)
        entries += [
            GlossaryEntry(a.english, a.translation, e.category, alias_of=target) for a in e.aliases
        ]
    return entries


def _usage(client: LLMClient) -> dict:
    return dict(vars(client.usage)) if hasattr(client, "usage") else {}


def _delta(before: dict, after: dict) -> dict:
    return {k: after[k] - before.get(k, 0) for k in after}


def run_config(
    client: LLMClient,
    chapters: Sequence[ChapterPair],
    config: EvalConfig,
    *,
    entities: Sequence[ScannedEntity],
    overview: str,
    reference: Sequence[ReferenceTerm],
    target_lang: str,
    judge: LLMClient,
) -> dict:
    """Translate every chapter once under `config` and score the result."""
    glossary = glossary_for(entities) if config.glossary else []
    bible = BookBible(overview=overview)
    before, start = _usage(client), time.monotonic()
    texts, preceding, review = [], [], {"found": 0, "fixed": 0}
    for chapter in chapters:
        result = translate_segments(
            client,
            chapter.source,
            target_lang=target_lang,
            glossary=glossary,
            preceding=preceding,
            config=config.translation,
            bible=bible,
        )
        texts.append(
            {"title": chapter.title, "sources": chapter.source, "translations": result.translations}
        )
        preceding = [
            ContextSegment(s, t) for s, t in zip(chapter.source, result.translations, strict=True)
        ][-PRECEDING:]
        review["found"] += result.review.flagged
        review["fixed"] += result.review.fixed
    seconds = time.monotonic() - start
    usage = _delta(before, _usage(client))
    return _score(texts, reference, target_lang, judge, usage, seconds, review, config)


def _score(
    texts: list[dict],
    reference: Sequence[ReferenceTerm],
    target_lang: str,
    judge: LLMClient,
    usage: dict,
    seconds: float,
    review: dict,
    config: EvalConfig,
) -> dict:
    sources = [s for c in texts for s in c["sources"]]
    translations = [t for c in texts for t in c["translations"]]
    renderings: dict[str, list[str | None]] = {}
    for chapter in texts:
        used = judge_renderings(judge, chapter, [t.english for t in reference])
        for term in reference:
            for i in occurrences(chapter["sources"], term.english):
                renderings.setdefault(term.english, []).append(used.get(i, {}).get(term.english))
    agree, consist = agreement(sources, translations, reference), consistency(renderings)
    return {
        "agreement": _score_dict(agree),
        "consistency": _score_dict(consist),
        "truncation": truncation_rate(sources, translations, target_lang),
        "failed": sum(1 for t in translations if t is None),
        "segments": len(sources),
        "source_chars": sum(len(s) for s in sources),
        "usage": usage,
        "seconds": round(seconds, 1),
        "review": review if config.translation.review_max_retries else None,
        "texts": texts,
    }


def _score_dict(score: TermScore) -> dict:
    return {
        "hits": score.hits,
        "total": score.total,
        "rate": score.rate,
        "per_term": {k: list(v) for k, v in score.per_term.items()},
    }


def judge_renderings(judge: LLMClient, chapter: dict, names: Sequence[str]) -> dict[int, dict]:
    """How each term was rendered, per segment of one translated chapter."""
    pairs = [(s, t or "") for s, t in zip(chapter["sources"], chapter["translations"], strict=True)]
    wanted = [i for i, (s, _) in enumerate(pairs) if any(occurs_any(n, s) for n in names)]
    if not wanted:
        return {}
    system = "\n".join(
        [
            "Task: judge_renderings",
            "For each numbered pair, give the exact words the translation uses for each "
            "listed English name that appears in the source, copied verbatim from the "
            "translation, or null if the translation leaves it out.",
            'Return only JSON: {"<pair number>": {"<English name>": str|null}}',
        ]
    )
    body = "\n\n".join(
        f"{n}.\n[source] {pairs[i][0]}\n[translation] {pairs[i][1]}"
        for n, i in enumerate(wanted, start=1)
    )
    user = "Names: " + ", ".join(names) + "\n\n" + body
    try:
        reply = complete_with_retry(judge, system, user, json_mode=True)
    except Exception:  # a failed judge call leaves those occurrences unscored
        return {}
    picked = parse_used_renderings(reply, [pairs[i] for i in wanted], names)
    return {wanted[k]: v for k, v in picked.items()}


def occurs_any(name: str, text: str) -> bool:
    return bool(occurrences([text], name))


def parse_used_renderings(
    content: str, pairs: Sequence[tuple[str, str]], names: Sequence[str]
) -> dict[int, dict[str, str]]:
    """Judge reply → {pair index: {name: rendering}}, keeping only names in that
    source and renderings found verbatim in that translation."""
    try:
        data = json.loads(strip_code_fence(content))
    except json.JSONDecodeError:
        return {}
    out: dict[int, dict[str, str]] = {}
    for key, found in data.items() if isinstance(data, dict) else []:
        if not (str(key).isdigit() and isinstance(found, dict)):
            continue
        i = int(key) - 1
        if not 0 <= i < len(pairs):
            continue
        source, translation = pairs[i]
        kept = {
            name: text.strip()
            for name, text in found.items()
            if name in names and isinstance(text, str) and text.strip()
            and text.strip() in translation and occurs_any(name, source)
        }  # fmt: skip
        if kept:
            out[i] = kept
    return out


def _spread(values: list[float]) -> dict:
    return {"mean": statistics.fmean(values), "min": min(values), "max": max(values)}


def summarize(runs: Sequence[dict]) -> dict:
    def rates(key: str) -> list[float]:
        return [r[key]["rate"] for r in runs if r[key]["rate"] is not None]

    tokens = [
        (r["usage"].get("prompt_tokens", 0) + r["usage"].get("completion_tokens", 0))
        / r["source_chars"]
        * 1000
        for r in runs
    ]
    seconds = [r["seconds"] / r["source_chars"] * 1000 for r in runs]
    return {
        "runs": len(runs),
        "agreement": _spread(rates("agreement")) if rates("agreement") else None,
        "consistency": _spread(rates("consistency")) if rates("consistency") else None,
        "truncation": statistics.fmean(r["truncation"] for r in runs),
        "failed": statistics.fmean(r["failed"] for r in runs),
        "tokens_per_1k_chars": statistics.fmean(tokens),
        "seconds_per_1k_chars": statistics.fmean(seconds),
    }


def results_payload(
    *,
    book: str,
    chapters: list[int],
    model: str,
    commit: str,
    runs: dict[str, list[dict]],
    scan_usage: dict,
    judge_usage: dict,
) -> dict:
    """Number-only results (no book text): safe to commit."""
    return {
        "date": time.strftime("%Y-%m-%d"),
        "commit": commit,
        "model": model,
        "book": book,
        "chapters": chapters,
        "scan_usage": scan_usage,
        "judge_usage": judge_usage,
        "configs": {
            name: {
                "summary": summarize(config_runs),
                "runs": [{k: v for k, v in r.items() if k != "texts"} for r in config_runs],
            }
            for name, config_runs in runs.items()
        },
    }


def _commit() -> str:
    out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True)
    return out.stdout.strip() or "unknown"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--book", type=Path, required=True)
    parser.add_argument("--chapters", required=True, help="positions in book.json, e.g. 0-3")
    parser.add_argument("--configs", default="A,B,C")
    parser.add_argument("--runs", type=int, default=2)
    parser.add_argument("--reference", type=Path, help="default: <book>/reference.json")
    args = parser.parse_args()

    book = load_book(args.book)
    positions = chapter_range(args.chapters)
    chapters = book.chapters(positions)
    reference = load_reference(args.reference or args.book / "reference.json")
    client, judge = get_llm_client(), get_llm_client()
    before_scan = _usage(client)
    entities, overview = ensure_scan(client, args.book, chapters, positions, book.target_lang)
    scan_usage = _delta(before_scan, _usage(client))

    runs: dict[str, list[dict]] = {}
    out_dir = args.book / "runs"
    out_dir.mkdir(exist_ok=True)
    stamp = f"{time.strftime('%Y-%m-%d')}-{_commit()}"
    for config in select(args.configs):
        for n in range(1, args.runs + 1):
            print(f"config {config.name}, run {n}/{args.runs} …", flush=True)
            run = run_config(
                client, chapters, config, entities=entities, overview=overview,
                reference=reference, target_lang=book.target_lang, judge=judge,
            )  # fmt: skip
            (out_dir / f"{stamp}-{config.name}-{n}.json").write_text(
                json.dumps(run["texts"], ensure_ascii=False, indent=1), encoding="utf-8"
            )
            runs.setdefault(config.name, []).append(run)

    payload = results_payload(
        book=book.name, chapters=positions, model=getattr(client, "model", type(client).__name__),
        commit=_commit(), runs=runs, scan_usage=scan_usage, judge_usage=_usage(judge),
    )  # fmt: skip
    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"{stamp}.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    for name, data in payload["configs"].items():
        s = data["summary"]
        print(
            f"{name}: consistency {s['consistency']} agreement {s['agreement']} "
            f"truncation {s['truncation']:.3f} tokens/1k {s['tokens_per_1k_chars']:.0f}"
        )
    print(f"results: {out}")


if __name__ == "__main__":
    main()
