## Summary
<!-- What does this PR do? Link the issue it closes. -->
Closes #

## Changes
<!-- Bullet list of what changed -->
- 

## Test Plan
<!-- How did you verify this works? -->
- [ ] `pytest tests/ -v` passes (Python changes)
- [ ] `npm run lint && npx tsc --noEmit` passes (Next.js changes)
- [ ] Manually tested the happy path
- [ ] Edge cases covered (empty input, error states, auth failure)

---

## AI Disclosure
<!-- Required for all PRs — be honest, approximate % is fine -->

| Field | Value |
|---|---|
| % AI-generated | <!-- e.g. 70% --> |
| Tool used | <!-- e.g. Claude Code (claude-sonnet-4-6) --> |
| Human review applied | <!-- Yes / No + what you changed --> |

---

## C.L.E.A.R. Self-Review
<!-- Run /code-reviewer or answer manually before requesting human review -->

- [ ] **C — Correctness**: Logic produces correct output; return codes are right; async/await is correct
- [ ] **L — Logic & Edge Cases**: Empty inputs, nulls, pagination boundaries, Worker-down scenario handled
- [ ] **E — Efficiency**: No N+1 queries; large result sets are paginated; no redundant LLM calls
- [ ] **A — Architecture**: BFF pattern followed; PostgreSQL is source of truth; Prisma used for DB; Server Components by default
- [ ] **R — Risks**: Unhandled exceptions caught; timeouts set on external calls; no data corruption risk

---

## Security Checklist
<!-- Run /security-reviewer or check manually -->

- [ ] All new API routes call `auth()` and return 401 if unauthenticated
- [ ] Resource-by-ID routes check `resource.ownerId === userId` (return 403 if mismatch)
- [ ] All request inputs validated with Zod before use
- [ ] No hardcoded secrets; error messages don't expose internals
- [ ] `npm audit` passes with no high/critical vulnerabilities
