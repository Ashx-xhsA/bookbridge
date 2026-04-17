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

## Security (OWASP Top 10 — BookBridge mapping)

| # | Threat | BookBridge Defense |
|---|--------|--------------------|
| A01 | Broken Access Control | `auth()` on every API route; ownership check (`resource.ownerId === userId`) on all `[id]` routes; 403 on mismatch |
| A02 | Cryptographic Failures | No plaintext secrets; all secrets in env vars; HTTPS enforced by Vercel + Railway |
| A03 | Injection | Prisma ORM only (no raw SQL); Zod validates all inputs; no user values in shell commands |
| A04 | Insecure Design | BFF pattern: browser never calls Worker directly; Worker URL is env-var only |
| A05 | Security Misconfiguration | Gitleaks pre-commit blocks secret commits; `.env` never committed; debug mode off in prod |
| A06 | Vulnerable Components | `npm audit` in CI (Gate 2); Semgrep SAST (Gate 3); deps pinned via lockfile |
| A07 | Auth Failures | Clerk handles all auth; no custom auth logic; `auth()` server-side, `useUser()` client-side |
| A08 | Data Integrity Failures | `package-lock.json` pinned; Gitleaks prevents tampered secrets; verify all AI-suggested packages exist on npm/PyPI |
| A09 | Logging Failures | No PII, secrets, or session tokens in logs; generic error messages to client |
| A10 | SSRF | Worker URL from `process.env.WORKER_URL` only; no user-controlled URLs forwarded to Worker |

### Security Gates Active
- **Gate 1** — Gitleaks pre-commit (`.pre-commit-config.yaml`)
- **Gate 2** — `npm audit` in GitHub Actions (`.github/workflows/security.yml`)
- **Gate 3** — Semgrep SAST in GitHub Actions
- **Gate 7** — Security checklist in Definition of Done (`.github/ISSUE_TEMPLATE/feature.md`)
- **Sub-agent** — `security-reviewer` in `.claude/agents/` for PR review

## Don'ts
- Don't store secrets in code
- Don't modify `legacy/`
- Don't use ChromaDB or SQLite as persistent state (PostgreSQL only)

@import docs/PRD.md
@import docs/API_DESIGN.md
