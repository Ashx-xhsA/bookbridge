---
name: start-issue
description: Start work on a GitHub issue. Fetches issue details, creates a correctly-named branch, assigns the issue, and prints the acceptance criteria so you know exactly what to build.
---

# Start Issue Workflow

When invoked as `/start-issue <number>`, follow these steps in order.

## Step 1: Fetch Issue Details

Run:
```bash
gh issue view <number> --repo UchihaSusie/bookbridge
```

Read the output and extract:
- **Title** (used to generate the branch name)
- **Labels** (used to pick the branch prefix)
- **Acceptance Criteria** (the checklist in the issue body)

## Step 2: Generate Branch Name

Rules:
- Use the label to pick a prefix:
  - `feat` label → `feat/`
  - `process` or `documentation` label → `chore/`
  - `bug` label → `fix/`
  - No matching label → `feat/`
- Slug the issue title: lowercase, replace spaces with `-`, remove special characters, max 5 words
- Final format: `{prefix}issue-{number}-{slug}`

Examples:
- Issue #20 "S3-1 TDD PDF upload → Worker /parse → chapter list" → `feat/issue-20-pdf-upload-worker-parse`
- Issue #27 "S1-8 Security baseline + PR workflow template" → `chore/issue-27-security-baseline-pr-template`

## Step 3: Check You Are on main and It Is Up to Date

Run:
```bash
git checkout main && git pull origin main
```

If there are uncommitted changes, stop and tell the user to stash or commit them first.

## Step 4: Create and Switch to the Branch

```bash
git checkout -b {branch-name}
```

Confirm the branch was created:
```bash
git branch --show-current
```

## Step 5: Assign the Issue

```bash
gh issue assign <number> --repo UchihaSusie/bookbridge @me
```

## Step 6: Print a Start Summary

Output a clean summary in this format:

---
**Issue #<number>**: <title>
**Branch**: `<branch-name>`

**Acceptance Criteria — your definition of done:**
<paste the checklist from the issue body, formatted as a markdown checklist>

**Next step**: start coding. When done, run `/create-pr <number>` to open a PR.
---

## Constraints

- Never create the branch from anything other than `main`
- Never skip Step 3 — working from a stale `main` causes merge conflicts
- If the issue is already assigned or the branch already exists, tell the user and stop
- Do not start implementing the issue — this skill only sets up the workspace
