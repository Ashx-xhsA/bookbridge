---
name: feedback_issue_scope
description: User's firm rule about what belongs in GitHub Issues — product features only, no workflow/rubric items
type: feedback
---

Do NOT create GitHub Issues for workflow, CI, tooling, sprint planning, or rubric items. This includes: CI pipeline setup, pre-commit hooks, Claude Code skills/agents, sprint retrospectives, security baseline (Gitleaks, PR templates), and any rubric coverage items.

**Why:** User explicitly removed three issues (#26 workflow tooling, #27 security baseline, #28 retrospective) as "workflow issues" and said "we only need issues for the project itself." These are tracked and committed separately, not as open issues.

**How to apply:** Before creating any GitHub Issue, ask: does this deliver a user-facing product feature (PDF upload, translation, glossary, reading view, quality display, etc.)? If the answer is "no — it's about CI, hooks, tooling, or documentation process," do not create the issue. Close existing workflow issues with a "completed" comment instead.
