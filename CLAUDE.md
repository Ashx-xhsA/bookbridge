# BookBridge

Two-layer architecture: **Next.js 15 App Router** (BFF + frontend, Vercel) + **Python FastAPI Worker** (Railway). Sprint 1 Python core is complete; Sprints 2–4 build the web stack on top.

## Architecture Rules
- Next.js API Routes proxy all Worker calls — browser never talks to Worker directly
- PostgreSQL is the single source of truth; ChromaDB is a local RAG cache on the Worker only
- Wrap existing Python core (`ingestion/`, `glossary/`, `harness/`, `quality/`) via FastAPI — do not rewrite them
- Server Components by default; add `'use client'` only for interactivity or browser APIs

## Project Structure
```
bookbridge/         # Python Worker package
  ingestion/        # PDF reading, chunking, term extraction
  glossary/         # ChromaDB RAG store (local to Worker)
  harness/          # translation orchestrator + Claude API client
  quality/          # per-language quality checkers
  worker_api/       # FastAPI endpoints
  mcp_servers/      # glossary and translation MCP servers
tests/              # pytest suite (Python Worker)
app/                # Next.js App Router (Sprint 2+)
  api/              # BFF API Routes
prisma/             # Prisma schema + migrations
docs/               # PRD, API design, sprint notes
legacy/             # reference baseline — do not modify
```

## Python Conventions
- Type hints on all signatures; ruff enforced
- Dataclasses for domain objects (`ChunkManifest`, `ChunkInfo`, `Term`, `TranslationJob`)
- `pathlib.Path` over `os.path`; functions under 40 lines
- TDD: write failing test first, then implement
- Run: `pytest tests/ -v --tb=short`
- Coverage: `pytest tests/ --cov=bookbridge --cov-report=term`

## Next.js Conventions
- Prisma client as singleton (`lib/prisma.ts`)
- Validate API Route input with Zod before calling Worker or Prisma
- Clerk `auth()` server-side; `useUser()` client-side

## Commit Prefixes
`test(red):` · `feat(green):` · `refactor:` · `feat(next):` · `feat(worker):`

## Don'ts
- Don't store secrets in code
- Don't modify `legacy/`
- Don't use ChromaDB or SQLite as persistent state (PostgreSQL only)

@import docs/PRD.md
@import docs/API_DESIGN.md
