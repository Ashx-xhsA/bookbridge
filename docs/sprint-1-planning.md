# Sprint 1 Planning

## Sprint Goal

**"Python Foundation — build and test the core Python modules that the Worker will expose."**

The primary outcome of Sprint 1 is a TDD-verified Python core covering the full offline translation pipeline (PDF ingestion → chunking → glossary extraction → quality checking) plus the team's first Claude Code extensibility artefacts: a custom TDD skill and a Glossary MCP server.

## Dates

- Sprint start: ~ early March 2026
- Sprint end: 2026-04-16 (hand-off to Sprint 2)

## Team (pair project)

- **Shuai Ren** — lead author for Sprint 1 (ingestion + glossary + quality modules)
- **Ash (chen.zhanyi@northeastern.edu)** — supporting role in Sprint 1, lead author for Sprint 2+

## Key Deliverables

| # | Deliverable | PR / Ref |
|---|---|---|
| 1 | `bookbridge.ingestion.pdf_reader` — generic PDF text extraction | PR #4 (ref #1) |
| 2 | `bookbridge.ingestion.text_cleaning` — noise + header/footer removal | PR #5 (ref #2) |
| 3 | `bookbridge.ingestion.chunker` — chapter-boundary detection + `ChunkManifest` | PR #6 (ref #3) |
| 4 | `bookbridge.output.html_parser` — `extract_body_content` regex parser | PR #7 |
| 5 | `bookbridge.glossary.store` — SQLite-backed term store | direct-to-main |
| 6 | `bookbridge.quality` — per-language quality checker (base class + `zh_hans`) | direct-to-main |
| 7 | Glossary MCP server — custom Python MCP exposing `lookup_terms` / `add_term` / `search_glossary` to Claude Code | PR #9 |
| 8 | `tdd-add-module` custom skill v1 → v2 iteration | PR #9 |
| 9 | Documentation — `PRD.md` v2, `API_DESIGN.md`, `README.md`, `HW5_RETROSPECTIVE.md` | PR #8 + PR #9 |

## TDD Commitment

Every module follows strict red-green-refactor order:

1. Invoke `/tdd-add-module` → test-writer drafts failing tests → `test(red):` commit
2. Implement → `feat(green):` commit
3. Refactor → `refactor:` commit

Reviewer verification: `git log --oneline` must show each `test(red):` SHA earlier than its paired `feat(green):` SHA.

## Definition of Done

- [x] PDF → chunks pipeline works end-to-end on a sample book
- [x] Glossary SQLite store supports term insert / lookup / search
- [x] Quality checker produces a structured `CheckReport` per language
- [x] ≥ 1 Glossary MCP server usable from Claude Code
- [x] `tdd-add-module` skill iterated v1 → v2 with documented quantified improvement
- [x] ≥ 5 merged PRs with CI passing (achieved: 6 PRs — #4, #5, #6, #7, #8, #9)
- [x] Every module has ≥ 5 tests, written **before** implementation

## Architecture Constraints (Do Not Violate)

- `pathlib.Path` over `os.path` for all filesystem work
- Type hints on every signature; ruff enforced
- Dataclasses for domain objects (`ChunkManifest`, `ChunkInfo`, `Term`, `CheckReport`)
- Functions under 40 lines
- No raw SQL outside `glossary/store.py`
- Tests live in `tests/`, mirror the source module layout

## Risks Identified at Sprint Start

| Risk | Mitigation |
|---|---|
| PDF parsing edge cases (multi-column, scanned) | Limit to text-based PDFs in Sprint 1; flag image-based as out-of-scope |
| Glossary ambiguity across chapters | Defer cross-chapter consistency check to Sprint 2 quality module |
| Claude Code workflow drift without conventions | Address via the `tdd-add-module` skill from day one |

## Sprint 1 → Sprint 2 Handoff Criteria

- All Python modules importable from a single entry point (`bookbridge.cli`)
- Glossary store schema stable and documented
- Quality checker signature (`check(ChunkManifest) -> CheckReport`) usable as the contract the Worker will wrap in Sprint 2
