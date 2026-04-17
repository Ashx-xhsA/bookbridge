---
name: Security Rubric Gates
description: 5 security gates under CI/CD section (35 pts total); minimum 4 required; OWASP gate cross-counts in Claude Code Mastery (55 pts)
type: project
---

Security requirements live inside the CI/CD Pipeline section (35 pts total). Minimum 4 of 5 gates must be green.

**The 5 gates:**
1. Pre-commit secrets detection (Gitleaks or equivalent) — artifact: `.pre-commit-config.yaml`
2. Dependency scanning (`npm audit` in CI) — artifact: one line in `.github/workflows/ci.yml`
3. SAST tool or security-focused sub-agent — artifact: `.claude/agents/security-reviewer.md` (also satisfies Agents rubric in Claude Code Mastery 55 pts)
4. Security acceptance criteria in Definition of Done — artifact: `.github/ISSUE_TEMPLATE/feature.md`
5. OWASP Top 10 awareness in CLAUDE.md — artifact: `## Security` section in `CLAUDE.md`

**Why:** Gate 5 (OWASP in CLAUDE.md) cross-counts toward Claude Code Mastery section as well. Missing it costs points in two rubric sections simultaneously. It should be done first.

**Why:** Gate 3 (security sub-agent) also satisfies the Agents rubric requirement in Claude Code Mastery (55 pts). Creating `security-reviewer.md` in `.claude/agents/` kills two rubric items with one artifact.

**How to apply:** Always recommend targeting all 5 gates, not just the minimum 4. Total implementation time is under 2 hours and all are pure config/docs artifacts done before Sprint 2 application code.

**Status as of 2026-04-17:** All 5 gates are complete (commit 3a6cb37). Artifacts committed:
- Gate 1: `.pre-commit-config.yaml` (Gitleaks v8.18.4)
- Gate 2: `npm audit --audit-level=high` in `.github/workflows/security.yml`
- Gate 3: `.claude/agents/security-reviewer.md` + CI posts Claude review as PR comment
- Gate 4: `.github/ISSUE_TEMPLATE/feature.md` with Security DoD checklist
- Gate 5: OWASP Top 10 table in `CLAUDE.md`

**Known gap:** `security.yml` workflow file is missing the `name:` field at the top level (line 1 says `name: Security Gates` but the YAML `on:` key is immediately after with no document break — technically valid but the workflow tab in GitHub Actions will show the filename as the display name, not "Security Gates". Cosmetic only, does not affect execution.
