---
name: project_issue_audit
description: Issue-by-issue audit result from 2026-04-17 — updated after full backlog restructure
type: project
---

## Closed (workflow/completed, as of 2026-04-17)
- #26: Claude Code tooling (skills, agents, .mcp.json) — closed, committed
- #27: Security baseline (Gitleaks, PR template, OWASP) — closed, committed
- #28: Sprint 1 retrospective — closed, committed

## Open Feature Issues (all updated with TDD specs + OWASP gates)
- #16: S2-1 FastAPI worker — POST /parse, POST /translate/chunk, GET /job/{id}, GET /health
- #17: S2-2 Translation harness — orchestrator, build_prompt, call_claude, status transitions, retry
- #18: S2-3 SQLite → PostgreSQL migration — glossary/store.py, psycopg2
- #19: S2-4 Next.js shell + Clerk + Vercel — layout, middleware, health check, dashboard
- #20: S3-1 PDF upload → chapter list — POST /api/projects/[id]/parse, Zod MIME+size validation
- #21: S3-2 Prisma schema + Dashboard — schema, singleton, GET/POST /api/projects
- #22: S3-3 Translation trigger + polling — translate route, job proxy, useJobPoller hook
- #23: S4-1 Two-column reading view — GET /api/read/[token], public page
- #24: S4-2 Publish → public link — PATCH publish toggle, UUID v4 token
- #25: S4-3 Playwright E2E + responsive — e2e specs, 375px, GitHub Actions
- #29: S3-4 Projects CRUD — GET/PATCH/DELETE /api/projects/[id]
- #30: S3-5 Glossary management — GET/POST/PATCH/DELETE /api/projects/[id]/glossary
- #31: S3-6 Job polling proxy — GET /api/jobs/[jobId]
- #32: S4-4 Public reading routes — GET /api/read/[token] + /chunks/[chunkId]
- #33: S4-5 Quality score display + re-translation — qualityScore to DB, badge, Re-translate button
- #34: S4-6 Bilingual/translation-only toggle — localStorage-persisted layout mode

## Available GitHub Labels (verified 2026-04-17)
sprint-1, sprint-2, sprint-3, sprint-4, feat, tdd, process, bug, documentation, enhancement, good first issue, help wanted, invalid, question, wontfix, duplicate

IMPORTANT: next.js, python-worker, fastapi, api, database, ui, auth, owasp-aXX labels do NOT exist. Use only the verified list.

**Why:** Label verification required after gh issue create failed with "label not found" for 'next.js'. User rule: no workflow/rubric issues — product features only.
**How to apply:** When generating new issues, use only verified labels. Map each issue to a specific API_DESIGN.md endpoint. Never leave a BFF API route without its own issue.
