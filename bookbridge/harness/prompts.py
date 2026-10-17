"""Prompt builders for translation, review, revision and term extraction.

Every context component is rendered by its own helper and is skipped
entirely when its TranslationConfig switch is off — tests assert the
heading is absent, which is what keeps the eval ablations honest.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from bookbridge.harness.config import TranslationConfig
from bookbridge.harness.matching import match_glossary, occurs
from bookbridge.harness.models import BookBible, CharacterCard, ContextSegment, GlossaryEntry
from bookbridge.harness.parsing import REVIEW_CATEGORIES, format_segments, marker
from bookbridge.quality.models import Issue

# Same budget as v1 (~2000 tokens); only the "full" baseline can reach it.
MAX_GLOSSARY_TERMS = 200

BIBLE_HEADING = "## Book bible (highest priority)"
GLOSSARY_HEADING = "## Glossary"
CONTEXT_HEADING = "## Preceding text (context only — do not translate)"
SEGMENTS_HEADING = "## Segments to translate"
REVIEW_HEADING = "## Segments to review"
REVISE_HEADING = "## Segments to revise"
RECHECK_HEADING = "## Revisions to verify"


def select_glossary(
    glossary: Sequence[GlossaryEntry], batch_text: str, config: TranslationConfig
) -> list[GlossaryEntry]:
    """Pick the terms to inject for one batch, approved first, then longest first."""
    if config.glossary_mode == "matched":
        picked = match_glossary(glossary, batch_text)
    else:
        picked = list(glossary)
    picked.sort(key=lambda g: (not g.approved, -len(g.english)))
    return picked[:MAX_GLOSSARY_TERMS]


def _term_line(g: GlossaryEntry) -> str:
    line = f"- {g.english} → {g.translation} ({g.category})"
    if g.alias_of:
        line += f"; refers to {g.alias_of.english} / {g.alias_of.translation}"
    return line


def render_glossary(entries: Sequence[GlossaryEntry]) -> str:
    if not entries:
        return ""
    lines = [GLOSSARY_HEADING]
    approved = [_term_line(g) for g in entries if g.approved]
    suggested = [_term_line(g) for g in entries if not g.approved]
    if approved:
        lines += ["", "Approved — use these translations verbatim:", *approved]
    if suggested:
        lines += ["", "Suggested — follow unless context clearly overrides:", *suggested]
    if any(g.alias_of for g in entries):
        lines += [
            "",
            'A term that "refers to" someone is another name for that entity: use it '
            "to know who is meant, but translate the name as listed — never replace "
            "it with the main name.",
        ]
    return "\n".join(lines)


def _present_characters(
    bible: BookBible, batch_text: str, glossary: Sequence[GlossaryEntry]
) -> list[CharacterCard]:
    """Characters named in the batch directly or through one of their aliases."""
    lowered = batch_text.lower()
    via_alias = {
        g.alias_of.english
        for g in glossary
        if g.alias_of and occurs(g.english, batch_text, lowered)
    }
    return [
        c for c in bible.characters
        if c.name in via_alias or occurs(c.name, batch_text, lowered)
    ]  # fmt: skip


def _card_line(c: CharacterCard) -> str:
    details = [d for d in (c.gender, c.voice, c.notes) if d]
    suffix = f" — {'; '.join(details)}" if details else ""
    return f"- {c.name} ({c.translation}){suffix}"


def render_bible(
    bible: BookBible | None,
    batch_text: str,
    glossary: Sequence[GlossaryEntry],
    config: TranslationConfig,
) -> str:
    if not config.book_bible or bible is None or bible.empty:
        return ""
    lines = [BIBLE_HEADING]
    if bible.style_guide.strip():
        lines += ["", "Style guide:", bible.style_guide.strip()]
    cards = _present_characters(bible, batch_text, glossary)
    if cards:
        lines += ["", "Characters in this passage (pronouns, address, voice):"]
        lines += [_card_line(c) for c in cards]
    return "\n".join(lines)


def render_context(preceding: Sequence[ContextSegment], window: int) -> str:
    if window <= 0 or not preceding:
        return ""
    lines = [CONTEXT_HEADING]
    for seg in preceding[-window:]:
        lines += ["", f"[source] {seg.source}"]
        if seg.translation:
            lines.append(f"[translation] {seg.translation}")
    return "\n".join(lines)


def _system_prompt(source_lang: str, target_lang: str, count: int, sections: Sequence[str]) -> str:
    parts = [
        "Task: translate",
        f"You are a literary translator. Translate from {source_lang} to {target_lang}.",
        f"Target language: {target_lang}",
        f"The input has {count} segment(s), each introduced by a marker line such as "
        f"{marker(1)}. Translate every segment faithfully and completely.",
        f"Output exactly {count} segment(s): each marker line on its own, followed by "
        "the translation of that segment. Keep the markers and their order; never "
        "merge, split, skip or add segments. Output nothing else.",
    ]
    return _join(parts, sections)


def _context_sections(
    batch_text: str,
    glossary: Sequence[GlossaryEntry],
    config: TranslationConfig,
    bible: BookBible | None,
) -> list[str]:
    """Bible and glossary sections — identical for translator, reviewer and reviser."""
    return [
        render_bible(bible, batch_text, glossary, config),
        render_glossary(select_glossary(glossary, batch_text, config)),
    ]


def _join(parts: Sequence[str], sections: Sequence[str]) -> str:
    out = list(parts)
    for section in sections:
        if section:
            out += ["", section]
    return "\n".join(out)


def _user_message(
    preceding: Sequence[ContextSegment], config: TranslationConfig, heading: str, body: str
) -> str:
    context = render_context(preceding, config.context_window)
    parts = [context, ""] if context else []
    return "\n".join([*parts, heading, body])


def build_translation_prompt(
    batch: Sequence[str],
    *,
    source_lang: str,
    target_lang: str,
    glossary: Sequence[GlossaryEntry],
    preceding: Sequence[ContextSegment],
    config: TranslationConfig,
    bible: BookBible | None = None,
) -> tuple[str, str]:
    """Return (system, user) messages for translating one batch."""
    sections = _context_sections("\n".join(batch), glossary, config, bible)
    system = _system_prompt(source_lang, target_lang, len(batch), sections)
    return system, _user_message(preceding, config, SEGMENTS_HEADING, format_segments(batch))


def _issue_lines(label: str, issues: Sequence[Issue]) -> list[str]:
    return [f"[{label}] ({i.severity}, {i.category}) {i.message}" for i in issues]


def _issues_json_instruction() -> str:
    categories = "|".join(f'"{c}"' for c in REVIEW_CATEGORIES)
    return (
        'Return only JSON: {"issues": [{"segment": <marker number>, "quote": str, '
        f'"category": {categories}, "severity": "error"|"warning", "fix": str, '
        '"message": str}]}. "quote" is the wrong words copied exactly from the '
        "translation (for an omission, the words where the missing content belongs); "
        '"fix" is what should replace them. Decide first: if you cannot quote wrong '
        'words, it is not a problem — leave it out. Return {"issues": []} if there is '
        "nothing to report."
    )


_SEVERITY_RULE = (
    'Severity "error" only for problems that change the meaning: mistranslation, '
    "omission, addition, wrong pronoun or gender, wrong form of address, a glossary "
    "term not used, or an alias replaced by the main name — and only with a concrete "
    '"fix". Wording, rhythm, fluency, style and voice are at most "warning". '
    "Do not list anything you conclude is fine."
)


def build_review_prompt(
    pairs: Sequence[tuple[str, str]],
    *,
    source_lang: str,
    target_lang: str,
    glossary: Sequence[GlossaryEntry],
    preceding: Sequence[ContextSegment],
    config: TranslationConfig,
    bible: BookBible | None,
    rule_issues: Mapping[int, Sequence[Issue]],
) -> tuple[str, str]:
    """Ask an editor model for problems the rule checks cannot see, as JSON.

    `rule_issues` (keyed by position in `pairs`) is shown under each segment
    so the reviewer doesn't repeat it.
    """
    parts = [
        "Task: review",
        f"You are a senior literary editor checking a translation from {source_lang} "
        f"to {target_lang}.",
        f"Target language: {target_lang}",
        "Compare each translation with its source and report real problems. Do not "
        "repeat problems listed under [automatic check]; do not report matters of taste.",
        _SEVERITY_RULE,
        _issues_json_instruction(),
    ]
    batch_text = "\n".join(src for src, _ in pairs)
    system = _join(parts, _context_sections(batch_text, glossary, config, bible))
    blocks = [
        "\n".join(
            [
                marker(n),
                f"[source] {src}",
                f"[translation] {tgt}",
                *_issue_lines("automatic check", rule_issues.get(n - 1, ())),
            ]
        )  # fmt: skip
        for n, (src, tgt) in enumerate(pairs, start=1)
    ]
    return system, _user_message(preceding, config, REVIEW_HEADING, "\n".join(blocks))


def build_recheck_prompt(
    items: Sequence[tuple[str, str, str, Sequence[Issue]]],
    *,
    source_lang: str,
    target_lang: str,
    glossary: Sequence[GlossaryEntry],
    preceding: Sequence[ContextSegment],
    config: TranslationConfig,
    bible: BookBible | None,
) -> tuple[str, str]:
    """Second round: did the revision fix the listed problems without breaking meaning?

    `items` are (source, previous translation, revised translation, problems).
    Unlike the first review this is not a fresh search, so rounds converge.
    """
    parts = [
        "Task: recheck",
        f"You are a senior literary editor verifying revisions of a translation from "
        f"{source_lang} to {target_lang}.",
        f"Target language: {target_lang}",
        "For each segment, check only (1) whether each [problem to verify] is fixed in "
        "the revised translation and (2) whether the revision introduced a new error "
        "that changes the meaning. Report only unfixed problems and such new errors. "
        "Do not look for new style, wording or fluency problems.",
        _SEVERITY_RULE,
        _issues_json_instruction(),
    ]
    batch_text = "\n".join(src for src, _, _, _ in items)
    system = _join(parts, _context_sections(batch_text, glossary, config, bible))
    blocks = [
        "\n".join(
            [
                marker(n),
                f"[source] {src}",
                f"[previous translation] {old}",
                f"[revised translation] {new}",
                *_issue_lines("problem to verify", issues),
            ]
        )  # fmt: skip
        for n, (src, old, new, issues) in enumerate(items, start=1)
    ]
    return system, _user_message(preceding, config, RECHECK_HEADING, "\n".join(blocks))


def build_revision_prompt(
    items: Sequence[tuple[str, str, Sequence[Issue]]],
    *,
    source_lang: str,
    target_lang: str,
    glossary: Sequence[GlossaryEntry],
    preceding: Sequence[ContextSegment],
    config: TranslationConfig,
    bible: BookBible | None,
) -> tuple[str, str]:
    """Ask for corrected translations of flagged segments, in the marker protocol."""
    count = len(items)
    parts = [
        "Task: revise",
        f"You are a literary translator revising a translation from {source_lang} "
        f"to {target_lang}.",
        f"Target language: {target_lang}",
        "Each segment shows the source, the current translation and the problems "
        "found in it. Rewrite the translation to fix those problems, staying faithful "
        "to the source; keep what is already right.",
        f"Output exactly {count} segment(s): each marker line ({marker(1)}, …) on its "
        "own, followed by the revised translation only. Keep the markers and their "
        "order. Output nothing else.",
    ]
    batch_text = "\n".join(src for src, _, _ in items)
    system = _join(parts, _context_sections(batch_text, glossary, config, bible))
    blocks = [
        "\n".join(
            [marker(n), f"[source] {src}", f"[translation] {tgt}", *_issue_lines("problem", issues)]
        )  # fmt: skip
        for n, (src, tgt, issues) in enumerate(items, start=1)
    ]
    return system, _user_message(preceding, config, REVISE_HEADING, "\n".join(blocks))


def build_extraction_prompt(
    pairs: Sequence[tuple[str, str]], *, target_lang: str, known_terms: Sequence[str]
) -> tuple[str, str]:
    """Return (system, user) messages asking for new proper nouns / terms as JSON."""
    system = "\n".join(
        [
            "Task: extract_terms",
            "You build a translation glossary from source/translation pairs.",
            f"Target language: {target_lang}",
            "Proper nouns only: list the names of people, places, organizations and "
            "other named things that appear in the source, with the translation actually "
            "used in the translation text. Never list common nouns, job titles, kinship "
            "words or forms of address. Skip anything in the known-terms list.",
            'Return only JSON: {"terms": [{"english": str, "translation": str, '
            '"category": "person"|"place"|"organization"|"technical"|"general"}]}. '
            'Return {"terms": []} if there are none.',
        ]
    )
    known = ", ".join(known_terms) if known_terms else "(none)"
    body = "\n\n".join(
        f"{marker(i)}\n[source] {src}\n[translation] {tgt}"
        for i, (src, tgt) in enumerate(pairs, start=1)
    )
    return system, f"Known terms: {known}\n\n{body}"


def build_scan_prompt(passage: str, *, target_lang: str) -> tuple[str, str]:
    """Ask for the named entities in one passage of the book (pre-scan)."""
    system = "\n".join(
        [
            "Task: scan_entities",
            "You prepare a translation bible for a novel, one passage at a time.",
            f"Target language: {target_lang}",
            "Proper nouns only: list the named characters, places, organizations and "
            "other named things (ships, books, events) in the passage. For each give the "
            "translation to use throughout the book. Under `aliases`, list other proper "
            'names the passage uses for the same entity (nicknames, "Mr. Samsa"), each '
            "with its own translation — an alias is translated as written, never as "
            "the main name. Add an alias only if it refers to that one entity in this "
            "passage — never a surname shared by family members.",
            "Never list common nouns, even for people or recurring objects: no ordinary "
            'roles or job titles ("head clerk", "the maid"), kinship words or forms of '
            'address ("father", "Mother", "sir"), places like "office" or "living room", '
            'or objects like "sofa" or "desk". If a person has no name, leave them out.',
            'Return only JSON: {"entities": [{"name": str, "translation": str, '
            '"category": "person"|"place"|"organization"|"technical"|"general", '
            '"gender": "male"|"female"|"unknown"|null, "note": str|null, '
            '"aliases": [{"name": str, "translation": str}]}]}',
        ]
    )
    return system, passage


def build_voice_prompt(
    characters: Sequence[tuple[str, str, Sequence[str]]], *, target_lang: str
) -> tuple[str, str]:
    """Ask for one voice card per character from sample passages."""
    system = "\n".join(
        [
            "Task: voice_cards",
            "You describe how each character speaks, for a translator.",
            f"Target language: {target_lang}",
            "For each character write one or two sentences, in the target language, "
            "on register, tone and verbal habits, and how they address others.",
            'Return only JSON: {"voices": [{"name": str, "voice": str}]}',
        ]
    )
    blocks = [
        f"### {name}\n({translation})\n" + "\n".join(f"- {s}" for s in samples)
        for name, translation, samples in characters
    ]
    return system, "\n\n".join(blocks)


def build_style_prompt(samples: Sequence[str], *, target_lang: str) -> tuple[str, str]:
    """Ask for a short style guide for translating this book."""
    system = "\n".join(
        [
            "Task: style_guide",
            "You write a style guide for translating a novel.",
            f"Target language: {target_lang}",
            "From the sample passages, describe in 3–6 short bullet points, in the "
            "target language: narrative voice, register, sentence rhythm, how to "
            "render dialogue, and anything to avoid. Return only the bullet points.",
        ]
    )
    return system, "\n\n".join(samples)
