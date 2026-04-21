# Sprint 1 Retrospective

Sprint covered: Python Foundation — ingestion, glossary, quality, first MCP server, first custom skill.

## What Went Well

- **TDD discipline was strict and mechanical.** Every module shows the red-green-refactor pattern in git: `e14bac8 test(red)` → `ab06b47 feat(green)` → `8e3bab2 refactor` for text cleaning; the same pattern for chunker (`0dcc44c` → `8747d4e` → `fc2587e`), HTML parser, glossary store, and quality checker. Reviewer verification is trivial with `git log`.
- **Custom skill iteration produced measurable gains.** `/tdd-add-module` v1 required 4 manual mid-TDD interventions on the glossary module (fixture setup, dependency declaration, error-handling patterns, definition-of-done). v2 eliminated all 4 — the subsequent quality-checker module built with **0 manual interventions**. Full analysis in [`HW5_RETROSPECTIVE.md`](HW5_RETROSPECTIVE.md).
- **MCP transformed a static resource into a live tool.** Pre-MCP, checking a term translation meant leaving the Claude Code conversation, opening a Python shell, running SQL, and pasting the result back. Post-MCP, Claude calls `lookup_terms(chunk_id=3, target_lang="zh-Hans")` inline while composing a translation prompt — no context switch.
- **PRs landed with CI green from day one.** Even though Sprint 1 CI was minimal (`pytest` + `ruff`), `main` was never red. A Python CI job existed before the first feature PR (#4).
- **Documentation kept pace with code.** PRD v2, `API_DESIGN.md`, and `README.md` were written in the same sprint as the code they describe — not deferred to "documentation week".

## What Didn't Go Well

- **Gitleaks pre-commit was added late.** The first `.env.example` template almost committed with a realistic-looking placeholder that could have been misread as a real key. Gitleaks went into `.pre-commit-config.yaml` only toward the end of Sprint 1.
- **`mcp_servers/glossary_server.py` test coverage was blocked** by the optional `mcp` SDK not being present in the test env. The tests themselves were correct, but `pytest` refused to collect them. This surfaced later as the one visible "0% coverage" row in the Sprint 2 pytest-cov report (`docs/evidence/coverage/pytest-coverage.txt`).
- **Legacy files kept showing as modified** without any human edit (`legacy/merge.py`, `legacy/split_book.py`). Tool-driven auto-reformat kept re-dirtying them. We added a team rule — *always discard these before staging* — to avoid accidental commits.
- **Work clustered into a single push day** (all Sprint 1 commits carry the 2026-03-22 timestamp). Local commits were developed over multiple sessions, but pushed together. This made the git history less granular than it should have been for standup purposes, and informed the Sprint 2 decision to push smaller commits more frequently.

## What We Learned

- **Skills that encode conventions beat READMEs that document them.** `/tdd-add-module` gets invoked automatically; a convention document only gets read if the human remembers to open it.
- **The red-green split matters mechanically, not just philosophically.** Seeing `test(red):` SHA **before** `feat(green):` SHA in `git log` is what the rubric (and future reviewers) check. Intent doesn't show up in `git blame`.
- **MCP is not "yet another API wrapper".** Making data callable from inside an AI session removes an entire class of context-switch bugs.
- **Dataclass + `to_dict()` convention prevents BFF/Worker boundary drift.** The pattern was loose in v1 of the skill — tightening it in v2 eliminated a recurring "which dict shape does this function return?" confusion.

## What to Carry Into Sprint 2

- **Keep the `test(red):` → `feat(next):` cadence,** enforced by a `PreToolUse` hook in `.claude/settings.json` (added early in Sprint 2)
- **Push smaller commits, more often** — each logical step as its own commit, so `git log` doubles as an async status record
- **Build out the agent library** — `code-reviewer` and `security-reviewer` sub-agents planned for Sprint 2
- **Use `/start-issue` + `/create-pr` skills from day one** of Sprint 2 — don't re-invent branch naming or PR templates
- **Keep `CLAUDE.md` small; `@import` large reference docs** (PRD, API_DESIGN) — they're loaded at session start and burn context
