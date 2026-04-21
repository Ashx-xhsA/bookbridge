# BookBridge — Project 3 Submission Evidence

Evidence for the Project 3 rubric (200 pts), organized by rubric category.

---

## Category 1 — Application Quality (40 pts)

> **Rubric target (Excellent, 40 pts):** Production-ready, deployed on Vercel, polished UI, 2+ user roles, real problem solved, portfolio-worthy.

### 1.1 Problem statement & real-world use case

> **TODO — teammate to fill.** 3–5 sentences answering: What problem does BookBridge solve? Who is the target user? Why does this matter? What makes it a new idea rather than an off-the-shelf tool?

### 1.2 User roles

BookBridge has **two distinct user roles**:

| Role | Authentication | What they can do |
|---|---|---|
| **Book Owner** | Clerk (signed in) | Upload PDFs, run translation jobs, review and edit paragraphs, toggle a book between private and public |
| **Public Reader** | None (anonymous) | Read a published bilingual book via its public `/read/[id]` URL — no account required |

### 1.3 Deployment

| Environment | Platform | URL |
|---|---|---|
| Production — Next.js BFF + frontend | Vercel | https://bookbridge-next.vercel.app/ |
| Production — FastAPI Worker | Railway | https://passionate-serenity-production-3cdd.up.railway.app/ |
| Per-PR preview deploy | Vercel | Every pull request against `main` receives an auto-generated preview URL (e.g. `bookbridge-next-git-<branch>-<team>.vercel.app`), posted as a status check on the PR so reviewers can click through to a live deploy of the proposed changes before merge |

### 1.4 Architecture requirements checklist

| Rubric requirement | Satisfied by |
|---|---|
| Next.js full-stack (App Router) | `app/` directory, Next.js 15 |
| Database (PostgreSQL) | Prisma schema in `prisma/`, PostgreSQL hosted on Railway |
| Authentication (Clerk) | `middleware.ts` + `auth()` guards on API routes; `useUser()` in client components |
| Deployed with preview deploys | Vercel project above (production + per-PR previews) |

---

## Category 2 — Claude Code Mastery (55 pts)

> **Rubric target (Excellent, 55 pts):** Rich CLAUDE.md with @imports and git evolution; 2+ iterated skills with usage evidence; 2+ hooks enforcing quality; MCP server integrated via `.mcp.json`; agents (sub-agents / teams / SDK) with evidence; parallel worktree development; 2+ PRs with writer/reviewer + C.L.E.A.R. + AI disclosure.

### 2.1 CLAUDE.md & Auto-memory

**Root `CLAUDE.md`** uses `@import` for modular organization:

```markdown
@import docs/PRD.md
@import docs/API_DESIGN.md
```

Core `CLAUDE.md` documents: architecture rules (Next.js BFF + Python Worker), project structure, Python/Next.js conventions, a full OWASP Top 10 → BookBridge-defense mapping, active security gates, and `Don'ts`.

**Git evolution of `CLAUDE.md`** (`git log --follow CLAUDE.md`):

| SHA | Commit |
|---|---|
| `81abcd6` | `setup: add CLAUDE.md v1 with tech stack conventions and import references` |
| `c1ee243` | `setup: iterate CLAUDE.md based on init feedback and add testing strategy` |
| `bfdcbe0` | `docs: update PRD, API design, and workflow checklist with rubric coverage` |
| `3a6cb37` | `feat: add code-reviewer agent, PR template, CI security review, and update docs` |

**Auto-memory** is active and recalled automatically at the start of every Claude Code session. The live memory directory lives on the developer's machine outside the repository; a sanitized snapshot is committed to [`docs/claude-memory/`](claude-memory/) (see below). Index file:

```markdown
# Memory Index
- [User Profile](user_profile.md) — CS student, BookBridge pair project …
- [Project Status](project_status.md) — Sprint 4 demo loop done; Sprint 3 CRUD backlog in flight …
- [Evidence Collected](evidence_collected.md) — Rubric evidence: 5+ C.L.E.A.R. PRs, 6+ TDD pairs
- [Workflow Preferences](workflow_preferences.md) — Concise responses; address full review list …
- [gh CLI Quirks](gh_cli_quirks.md) — `gh issue assign` unavailable locally …
- [Legacy Files Churn](legacy_files_churn.md) — `legacy/merge.py` / `split_book.py` keep reappearing …
- [Harness / Worker Provider Decisions](harness_provider_decisions.md) — demo=mock, real=openai_compat …
```

**Memory snapshot committed to repo at [`docs/claude-memory/`](claude-memory/)** (8 files) so graders can read the full memory contents directly. The live memory directory is maintained outside the repository by Claude Code and is not otherwise git-tracked. The snapshot has been redacted of personal identifiers (name, email, local machine paths); the content and structure otherwise mirror the live directory verbatim.

### 2.2 Custom Skills (≥2, one iterated v1 → v2)

Claude Code has migrated slash-command storage from `.claude/skills/` to `.claude/commands/` during this project. Both directories are retained in the repository so graders can observe the migration: `.claude/commands/` holds the current active skills; `.claude/skills/` preserves the earlier versions (including the v1 artefact) as historical evidence.

| Skill | Purpose | Location |
|---|---|---|
| `/tdd-add-module` | Enforce red-green-refactor workflow with BookBridge conventions | `.claude/skills/tdd-add-module.md` (v2) + `.claude/skills/tdd-add-module-v1.md` (v1) + `.claude/commands/tdd-add-module.md` |
| `/start-issue` | Fetch GitHub issue, create correctly-named branch, assign, print acceptance criteria | `.claude/commands/start-issue.md` |
| `/create-pr` | Run quality checks, write standardised PR description with C.L.E.A.R. checklist + AI disclosure metadata, push and open PR | `.claude/commands/create-pr.md` |

**Skill iteration — `/tdd-add-module` v1 → v2** (diff of `.claude/skills/tdd-add-module-v1.md` vs `.claude/skills/tdd-add-module.md`):

| Change | v1 | v2 | Why iterated |
|---|---|---|---|
| Pre-flight checklist | — | explicit reads of `CLAUDE.md`, `docs/API_DESIGN.md`, `docs/PRD.md`, `pyproject.toml` | v1 runs skipped project conventions; teammates re-invented patterns |
| Dependency check (Step 1) | — | verify packages in `pyproject.toml`, install if missing | modules were failing at import time because deps were not declared |
| `models.py` conventions | implied | dataclasses must expose `to_dict() -> dict` | serialization gaps between modules when crossing the BFF boundary |
| Test fixture patterns | — | shown: `tmp_path` + sample-data fixtures | tests in v1 hard-coded paths and leaked DB state |
| Error handling pattern | — | codified: `None` for missing lookups, `ValueError` for bad input, parameterized SQL | caller-vs-implementer confusion between runs |
| Post-refactor checks | single `pytest` run | `pytest` + `ruff format` + `ruff check` + `--cov` | refactor pass was landing without coverage verification |
| Definition of Done | — | 7-item checkbox (tests, lint, commits, docstrings, type hints, dataclasses) | work was merging without full quality gate |

**Usage evidence** (screenshots committed to repo):
- `create-pr` skill in action: `docs/evidence/image-20260418173231573.png`, `image-20260418173255306.png`

### 2.3 Hooks (3 configured in `.claude/settings.json`)

| Hook | Event | Purpose |
|---|---|---|
| Ruff format + check | `PostToolUse` matching `Write|Edit` | auto-format and lint-fix every file Claude edits |
| pytest quality gate | `Stop` | runs `pytest tests/ -q` at the end of every Claude Code session and prints the tail |
| TDD red-commit enforcement | `PreToolUse` matching `Bash` | before any `feat(next):` commit, warn if the current branch has no `test(red):` commit — blocks silent TDD skips |

Config excerpt (`.claude/settings.json`):

```json
"hooks": {
  "PostToolUse": [{"matcher": "Write|Edit",
    "hooks": [{"type": "command",
      "command": "ruff format $CLAUDE_FILE_PATH 2>/dev/null; ruff check --fix $CLAUDE_FILE_PATH 2>/dev/null; true"}]}],
  "Stop": [{"matcher": "",
    "hooks": [{"type": "command",
      "command": "echo '--- pytest quality gate ---'; pytest tests/ -q --tb=short 2>&1 | tail -5; exit 0"}]}],
  "PreToolUse": [{"matcher": "Bash",
    "hooks": [{"type": "command",
      "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -q 'feat(next):'; then RED=$(git log --oneline \"$(git branch --show-current)\" 2>/dev/null | grep -c 'test(red):'); if [ \"$RED\" -eq 0 ]; then echo 'WARNING: No test(red): commit on this branch. TDD rubric requires failing tests committed before implementation.'; fi; fi"}]}]
}
```

### 2.4 MCP Servers

Two MCP servers on this project: a custom Python **glossary-server** registered in the repo's `.mcp.json`, and **Playwright MCP** invoked ad-hoc for in-session UI verification.

**Committed configuration — `.mcp.json` (both servers shared via the repo):**

```json
{
  "mcpServers": {
    "glossary-server": {
      "command": "python",
      "args": ["-m", "bookbridge.mcp_servers.glossary_server", "--db", "glossary.db"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

**`glossary-server`** is a custom Python MCP server (source in `bookbridge/mcp_servers/`) that exposes glossary term lookup and insertion. It originated during Sprint 1, when BookBridge was still a Python CLI / terminal pipeline — it let Claude Code query and mutate the RAG-backed glossary store from inside a session without shelling out.

**Playwright MCP** was added during Next.js UI work to close the "AI can't see what it just changed" loop. Because both servers are in `.mcp.json`, every teammate and CI agent picks them up automatically on clone.

A complete Playwright MCP session (AI writes code → AI opens the live browser → AI + human verify the visible result) is archived at [`docs/evidence/mcp-playwright/`](evidence/mcp-playwright/): a session README, 2 page screenshots (Clerk sign-in redirect + final verified layout), 2 Playwright accessibility snapshots (YAML), and 2 browser console logs. The recorded session (≈1 minute, 2026-04-21 UTC) shows Claude moving the green "Start Reading" button into the title block of the project detail page (`bookbridge-next/app/dashboard/projects/[id]/page.tsx:41-67`) and then using the Playwright-controlled browser — signed in through Clerk — to visually confirm the new layout on a live book (14 chapters, en → zh-Hans). The corresponding code + `.mcp.json` change lives in commit `447c2e0` (merged via PR #63).

### 2.5 Sub-agents (5 agents in `.claude/agents/`)

| Agent | Role |
|---|---|
| `code-reviewer.md` | Performs C.L.E.A.R. code reviews on PRs (correctness, logic errors, edge cases, architecture fit, performance) |
| `security-reviewer.md` | Reviews code for OWASP Top 10 + BookBridge-specific gates (auth/ownership, Zod validation, SSRF, secret hygiene) |
| `test-writer.md` | Writes failing Vitest tests for Next.js TDD issues — produces the `test(red):` commit, never writes implementation |
| `product-architect.md` | Audits PRD ↔ GitHub Issue coverage, generates TDD-structured issues with OWASP gates |
| `rubric-workflow-architect.md` | Maps rubric criteria to implementation decisions and validates development workflow |

**Usage evidence** (committed screenshots):
- `code-reviewer` output: `docs/evidence/image-20260418172430290.png`
- `test-writer` invoked via `/start-issue`: `docs/evidence/image-20260418223933106.png`

### 2.6 Parallel Development — Git Worktrees

Two worktrees are active concurrently at submission time. The main checkout is building a translator provider feature; the second is used to compose this submission report without disturbing the feature branch:

```bash
$ git worktree list
~/Desktop/bookbridge       3b59042 [feat/issue-60-add-openai-compatible-translator-provider]
~/Desktop/bookbridge-docs  0e6c545 [docs/report]
```

The feature/report split is one concrete example of parallel worktree use. The branch history also shows multiple feature branches in flight simultaneously across Sprints 3 and 4:

```
feat/issue-52-harness-translator-providers    # Worker-side translator plumbing
feat/issue-57-publish-toggle-reader-page      # Frontend publish toggle
feat/issue-44-auth-aware-landing-page         # Auth-aware landing
fix/issue-47-upload-dropzone-click            # PDF upload fix
feat/issue-60-add-openai-compatible-...       # current feature
docs/report                                    # current docs worktree
```

### 2.7 Writer/Reviewer Pattern + C.L.E.A.R. + AI Disclosure

Each feature PR follows the writer/reviewer flow:

1. **Writer** — Claude Code drafts the implementation (typically via `/start-issue` + `/tdd-add-module` skills)
2. **Reviewer** — `code-reviewer` sub-agent posts a C.L.E.A.R.-framework review on the PR; human partner adds a second pass and merges

Representative PRs:

| PR | Feature | Writer | Reviewer (C.L.E.A.R. visible in comments) |
|---|---|---|---|
| [#45](https://github.com/UchihaSusie/bookbridge/pull/45) | S3-7 Auth-aware landing page | Claude Code w/ `/start-issue` | `code-reviewer` sub-agent + human |
| [#48](https://github.com/UchihaSusie/bookbridge/pull/48) | Fix: PDF upload dropzone click | Claude Code w/ `/tdd-add-module` | `code-reviewer` sub-agent + human |
| [#39](https://github.com/UchihaSusie/bookbridge/pull/39) | PDF upload API route with worker proxy | Claude Code | `code-reviewer` + partner |

**AI disclosure metadata** — every PR description follows the project's `.github/pull_request_template.md`, which includes a dedicated section declaring:

- Percentage of the change that was AI-generated
- Tool used (Claude Code + model / skills invoked)
- Human review applied (reviewer name + verification steps)

The three PRs linked above each carry this metadata in their PR body.

---

## Category 3 — Testing & TDD (30 pts)

> **Rubric target (Excellent, 30 pts):** TDD red-green-refactor for 3+ features visible in git; 70%+ coverage; unit + integration + E2E (Playwright); tests verify behavior and edge cases.

### 3.1 TDD red-green-refactor — git history

Every feature followed a strict TDD loop: a failing test commit (`test(red):`) lands **before** the implementation commit (`feat(next):` / `feat(green):` / `fix(next):`). **15+ paired features** are visible in `git log`, spanning both the Python Worker (Sprint 1) and the Next.js BFF + frontend (Sprints 2–4).

| Feature | `test(red):` SHA | Impl SHA | Ref |
|---|---|---|---|
| OpenAI-compatible translator provider | `c2f7c5b` | `3b59042` `feat(green)` | #60 |
| Publish toggle + public reader page | `7a55058` | `0d43dad` `feat(next)` | #57 |
| Public reading routes | `70c77c3` | `fcecbb2` `feat(next)` | #32 |
| Publish/unpublish `publicToken` generation | `9d00f08` | `0eae228` `feat(next)` | #24 |
| `projects/[id]` CRUD — PATCH + DELETE | `5307559` | `9e397fb` `feat(next)` | #29 |
| DeleteProjectButton UI | `cfb9992` | `35ab86c` `feat(next)` | #29 |
| Reader view end-to-end | `3b27548` | `dd3edee` `feat(green)` | #51 |
| `bookbridge.harness` + `/translate/chunk` | `278398e` | `05e7a9e` `feat(green)` | #52 |
| PDF upload dropzone click | `3cca656` | `5bbaab3` `feat(next)` | #47 |
| Auth-aware landing page | `57ea257` | `1dd0127` `feat(next)` | #44 |
| Job polling proxy (`GET /api/jobs/[jobId]`) | `07132a7` | `d164b5d` `feat(next)` | #31 |
| FastAPI Worker endpoints | `7c2d8c9` | `9905265` (bulk `feat(next)`) | #16 |
| Quality checker module | `0440a0e` | subsequent green | — |
| Glossary store module | `bccb5b6` | subsequent green | — |
| HTML parser (`extract_body_content`) | `3f40118` | subsequent green | — |
| Chunker chapter detection + manifest | `0dcc44c` | subsequent green | #3 |
| Text cleaning functions | `e14bac8` | subsequent green | #2 |

TDD is additionally enforced mechanically: the `PreToolUse` hook in `.claude/settings.json` (see §2.3) warns before any `feat(next):` commit if the current branch has no `test(red):` commit.

**TDD in flight at submission time** — issue #61 (async conversion of the jobs endpoint) is in the red phase right now: `__tests__/api/jobs-async.test.ts` and `__tests__/api/jobs/[jobId]/route-async.test.ts` are committed as **deliberately failing** tests (assertions in each file begin with `// THE FAILING ASSERTION: …`). Running the full Vitest suite therefore shows 7 expected failures across those 2 files until the corresponding `feat(next):` commit lands. These tests are excluded from the coverage run in §3.3 to avoid v8's failure-gate suppressing the summary; they are kept in the suite as live proof that TDD is a current practice, not just a historical artefact.

### 3.2 Test pyramid — unit, integration, E2E

| Layer | Framework | Location | Scale / example |
|---|---|---|---|
| **Unit** | Vitest | `bookbridge-next/lib/__tests__/` | Pure utilities (e.g. `public-project.ts`, `worker.ts` — 80% / 91% lines) |
| **Unit** | pytest | `tests/test_chunker.py`, `test_glossary.py`, `test_harness.py`, `test_html_parser.py`, `test_pdf_reader.py`, `test_quality.py` | 98 unit tests across 6 modules |
| **Integration** | Vitest | `bookbridge-next/__tests__/` | Next.js API Route tests exercising Prisma + Worker proxy (all routes ≥ 74%, most ≥ 88%) |
| **Integration** | pytest | `tests/test_worker_api.py` | FastAPI TestClient over Worker endpoints (`/parse`, `/translate/chunk`) |
| **E2E** | Playwright | `bookbridge-next/e2e/landing.spec.ts` | 5 test cases: hero section, sign-in link, sign-up link count, three feature cards, demo reader page |

### 3.3 Coverage — 70% threshold cleared on both layers

**Next.js (Vitest, `npm run test:coverage`)** — 18 test files · 111 tests:

```
Statements   : 86.9%  ( 219/252 )
Branches     : 83.33% ( 135/162 )
Functions    : 86.36% ( 19/22 )
Lines        : 87.09% ( 216/248 )
```

Every API route file is covered: `app/api/upload/route.ts` 97.29%, `app/api/projects/[id]/route.ts` 94.73%, `app/api/jobs/[jobId]/route.ts` 88.88%, `app/api/jobs/route.ts` 74%.

**Python Worker (pytest-cov, `pytest tests/ --cov=bookbridge`)** — 110 tests across 7 modules:

```
TOTAL coverage: 77%  (547 statements, 128 missed)
```

Core business modules — glossary store, translator providers, HTML parser, chunker, output models — are at 92–100% line coverage. The uncovered lines are concentrated in the CLI entry point (`cli.py`) and the optional MCP server (`mcp_servers/glossary_server.py`, which requires the optional `mcp` SDK).

Both layers exceed the 70% rubric threshold. Raw terminal output from both runs is archived as reproducible evidence:

- [`docs/evidence/coverage/vitest-coverage.txt`](evidence/coverage/vitest-coverage.txt) — full Vitest run with v8 coverage table (issue #61 red-phase tests excluded, see §3.1)
- [`docs/evidence/coverage/pytest-coverage.txt`](evidence/coverage/pytest-coverage.txt) — full `pytest --cov=bookbridge` output across 110 tests (7 modules)

### 3.4 Test quality — behaviour and edge cases

Tests assert observable behaviour and reject bad inputs, not just happy paths. Representative edge cases:

- **`tests/test_harness.py`** — translator providers reject bad inputs **before** any network call: `test_rejects_empty_text`, `test_rejects_unknown_target_lang`, `test_rejects_unknown_source_lang`, `test_rejects_oversized_text` (200 KB cap), `test_validates_input_before_network_call` (patches `urllib.request.urlopen` and asserts it is **not** called when input validation fails).
- **`tests/test_harness.py` · OpenAICompatTranslator** — builds request with correct `Authorization: Bearer` header, correct URL path, and handles empty-content responses from the upstream API.
- **`tests/test_chunker.py`** — 15 cases covering chapter-boundary detection, manifest integrity, and degenerate inputs (single-page books, no detectable chapters).
- **`bookbridge-next/__tests__/` (API routes)** — OWASP A01 (Broken Access Control): requests where the authenticated Clerk `userId` does not own the resource receive 403; Zod-based input validation rejects malformed payloads with 400 before any Prisma or Worker call is made.
- **`bookbridge-next/e2e/landing.spec.ts`** — verifies not only that the hero renders, but that **both** sign-up CTA links (header "Get Started" + hero "Start Translating") are present with `toHaveCount(2)` — a regression guard against accidental removal of either CTA.

---
