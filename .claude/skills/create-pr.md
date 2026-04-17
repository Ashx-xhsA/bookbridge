---
name: create-pr
description: Finish work on an issue and open a Pull Request. Runs quality checks, writes a standardised PR description with C.L.E.A.R. review checklist and AI disclosure metadata, then pushes the branch and creates the PR on GitHub.
---

# Create PR Workflow

When invoked as `/create-pr <number>`, follow these steps in order.

## Step 1: Confirm You Are on the Right Branch

```bash
git branch --show-current
```

The current branch must match the issue number (e.g. `feat/issue-20-...`).
If you are on `main`, stop and tell the user to switch to the feature branch first.

## Step 2: Run Quality Checks

Run all checks and show the output. Do NOT proceed if any check fails.

**For Python changes:**
```bash
pytest tests/ -v --tb=short
ruff format --check bookbridge/ tests/
ruff check bookbridge/ tests/
```

**For Next.js changes:**
```bash
npm run lint
npx tsc --noEmit
npm test -- --run
```

If checks fail, stop and tell the user what to fix. Do not open a PR with a broken build.

## Step 3: Check for Uncommitted Changes

```bash
git status
```

If there are uncommitted changes, ask the user whether to commit them before continuing.

## Step 4: Fetch Issue Details

```bash
gh issue view <number> --repo UchihaSusie/bookbridge
```

Extract the issue title and acceptance criteria checklist — used to write the PR body.

## Step 5: Push the Branch

```bash
git push -u origin $(git branch --show-current)
```

## Step 6: Create the PR

Use the template below. Fill in every section — do not leave placeholders.

```bash
gh pr create \
  --repo UchihaSusie/bookbridge \
  --title "<issue title>" \
  --body "$(cat <<'EOF'
## Summary
Closes #<number>

<2–3 bullet points describing what this PR does, written for a reviewer who hasn't seen the issue>

## Acceptance Criteria
<paste the checklist from the issue — mark completed items with [x]>

## C.L.E.A.R. Self-Review
- [ ] **Correct** — logic is right, edge cases handled
- [ ] **Legible** — naming is clear, no magic numbers
- [ ] **Efficient** — no obvious performance issues
- [ ] **Abstracted** — no duplicated logic, helpers extracted where needed
- [ ] **Risk-aware** — no secrets in code, no SQL injection, OWASP top 10 considered

## AI Disclosure
- AI-generated: ~__%
- Tool used: Claude Code (claude-sonnet-4-6)
- Human review: yes — logic verified, tests checked manually
EOF
)"
```

## Step 7: Print Completion Summary

Output:

---
**PR opened**: <PR URL>
**Branch**: `<branch-name>` → `main`

**Reviewer checklist** (ask your teammate to review using C.L.E.A.R.):
- Read the Summary and Acceptance Criteria
- Leave at least one comment per C.L.E.A.R. dimension
- Approve only when all criteria are checked

**Next step**: assign a reviewer on GitHub, then start the next issue with `/start-issue <next-number>`.
---

## Constraints

- Never skip Step 2 — a PR with failing checks wastes the reviewer's time
- Always include the AI disclosure block — it is required by the rubric
- Always link `Closes #<number>` so GitHub auto-closes the issue on merge
- Do not merge the PR yourself — wait for teammate review
