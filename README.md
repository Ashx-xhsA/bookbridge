> **Team:** See [`docs/workflow-checklist.md`](docs/workflow-checklist.md) for rubric progress — please review and tick off items you've completed.

# BookBridge

BookBridge is an AI-powered long-document translation web platform. Upload a PDF, select chapters to translate, and read the results in an immersive two-column bilingual view. Terminology stays consistent across the entire book via a project-scoped glossary.

**Live:** _coming Sprint 2_ · **Stack:** Next.js 15 · Python FastAPI · PostgreSQL · Claude API · Vercel + Railway

---

## Architecture

```mermaid
graph TD
    Browser["Browser (Reader / Translator)"]
    Next["Next.js 15 App Router\n(Vercel)"]
    Worker["Python FastAPI Worker\n(Railway)"]
    PG["PostgreSQL\n(Neon)"]
    Chroma["ChromaDB\n(local to Worker)"]
    Claude["Anthropic Claude API"]

    Browser -->|"HTTPS"| Next
    Next -->|"REST"| Worker
    Worker -->|"read / write"| PG
    Next -->|"read / write"| PG
    Worker -->|"RAG retrieval"| Chroma
    Worker -->|"translate"| Claude
```

| Layer | Technology |
|---|---|
| Frontend / BFF | Next.js 15 App Router |
| Authentication | Clerk |
| Database | PostgreSQL (Neon) via Prisma |
| Translation Worker | Python 3.11 + FastAPI (Railway) |
| Vector Retrieval | ChromaDB (RAG glossary injection) |
| LLM | Anthropic Claude API |
| CI/CD | GitHub Actions |
| Deployment | Vercel (Next.js) + Railway (Worker) |

---

## Sprint Progress

| Sprint | Goal | Status |
|---|---|---|
| 1 — Python Foundation | Core Python modules: ingestion, glossary, quality checker, MCP server | ✅ Complete |
| 2 — Deploy First | FastAPI Worker + Next.js shell + full CI/CD pipeline live | 🔄 In progress |
| 3 — Next.js Full Features | PDF upload → parse → translate → glossary management | ⬜ Planned |
| 4 — Reading View + Polish | Two-column reader, publish/share, E2E tests | ⬜ Planned |

---

## Project Structure

```
bookbridge/
├── CLAUDE.md                        # AI assistant context: conventions, architecture, OWASP
├── .mcp.json                        # MCP server config shared with the team
├── .claude/
│   ├── settings.json                # Claude Code hooks (lint-on-edit, test gate)
│   ├── skills/
│   │   ├── tdd-add-module.md        # TDD workflow for adding Python modules (v2)
│   │   ├── start-issue.md           # Creates a branch and prints acceptance criteria for an issue
│   │   └── create-pr.md             # Runs checks, writes PR with C.L.E.A.R. + AI disclosure
│   └── agents/
│       ├── architect.md             # Rubric review and sprint planning agent
│       ├── security-reviewer.md     # OWASP-aware PR security review agent
│       └── test-writer.md           # TDD test stub generation agent
├── .github/
│   ├── pull_request_template.md     # Enforces C.L.E.A.R. checklist and AI disclosure on every PR
│   └── workflows/                   # GitHub Actions: lint, typecheck, tests, deploy, AI review
├── bookbridge/                      # Python Worker package
│   ├── ingestion/                   # PDF extraction, text cleaning, chapter chunking
│   ├── glossary/                    # SQLite + ChromaDB glossary store
│   ├── harness/                     # Translation orchestrator (chunk → Claude API → PostgreSQL)
│   ├── quality/                     # Per-language quality checkers
│   └── mcp_servers/                 # Glossary MCP server (5 tools + 1 resource)
├── tests/                           # 81 tests, all passing
├── docs/
│   ├── PRD.md                       # Product requirements (English)
│   ├── PRD-zh.md                    # Product requirements (Chinese)
│   ├── API_DESIGN.md                # Internal API specifications
│   └── workflow-checklist.md        # Rubric workflow requirements and completion tracker
└── legacy/                          # Original manual pipeline (read-only reference)
```

---

## Development Workflow

Every issue follows the same cycle:

```
/start-issue <n>   →   write code (TDD)   →   /create-pr <n>   →   teammate reviews   →   merge
```

**`/start-issue <n>`** — fetches the issue from GitHub, creates a correctly-named branch (`feat/issue-<n>-...`), and prints the acceptance criteria.

**`/create-pr <n>`** — runs lint + tests, writes a PR description with C.L.E.A.R. self-review checklist and AI disclosure metadata, then opens the PR.

### TDD cycle (Python Worker)

```bash
pytest tests/test_<module>.py -v          # RED — all fail
# implement
pytest tests/test_<module>.py -v          # GREEN — all pass
ruff format bookbridge/ tests/
ruff check bookbridge/ tests/
```

Commit conventions: `test(red):` → `feat(green):` → `refactor:`

---

## Running Tests

```bash
pip install -e ".[dev]"
pytest tests/ -v --tb=short
pytest tests/ --cov=bookbridge --cov-report=term
```

---

## MCP Server

```bash
claude mcp add glossary-server -- python -m bookbridge.mcp_servers.glossary_server --db /path/to/glossary.db
```

See [docs/MCP_SETUP.md](docs/MCP_SETUP.md) for full setup instructions.
