# CI/CD Pipeline Guide (W14)

## Overview

8 required stages for full rubric credit (35 pts). All must appear as green checks in GitHub Actions.

| Stage | Where | Status |
|---|---|---|
| 1. Lint (ESLint + Prettier) | `ci.yml` → `nextjs` job | Fixed — two named steps |
| 2. Type check (tsc --noEmit) | `ci.yml` → `nextjs` job | Ready (needs package.json script) |
| 3. Unit + integration tests | `ci.yml` → `nextjs` job | Ready (needs package.json script) |
| 4. E2E (Playwright) | `ci.yml` → `e2e` job | Fixed — uses build+start in CI |
| 5. Security scan (npm audit) | `ci.yml` → `nextjs` job | Fixed — now in main pipeline |
| 6. AI PR review (Claude) | `security.yml` | Working via Anthropic SDK |
| 7. Preview deploy | Vercel GitHub integration | Teammate sets up once |
| 8. Production deploy on merge | Vercel GitHub integration | Automatic after step 7 |

---

## Files Changed

### `.github/workflows/ci.yml`
- Added `npm audit --audit-level=high` as named step (Stage 5)
- Split lint into two named steps: `Lint (ESLint)` and `Format check (Prettier)`
- Added `Build Next.js for E2E` step before Playwright runs
- Added `needs: nextjs` to `e2e` job so E2E waits for unit tests to pass
- Added Playwright HTML report upload on failure (for debugging)

### `playwright.config.ts`
- `webServer.command` now uses `npm run build && npm run start` in CI
- Added `timeout: 120 * 1000` for slow CI runners
- Locally still uses `npm run dev` as before

---

## package.json Scripts to Add (when create-next-app runs)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "format:check": "prettier --check \"app/**/*.{ts,tsx}\" \"lib/**/*.{ts,tsx}\"",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## GitHub Secrets to Add

Go to: repo → Settings → Secrets and variables → Actions → New repository secret

| Secret Name | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard |
| `CLERK_SECRET_KEY` | Clerk dashboard |
| `DATABASE_URL` | Neon / Supabase (teammate sets up) |

> Anyone with collaborator (write) access to the repo can add secrets — you don't need to be the repo owner.

---

## Vercel Setup (Teammate Does This Once)

1. Go to vercel.com → sign in with GitHub
2. "Add New Project" → import the bookbridge repo
3. Framework Preset: **Next.js** (auto-detected)
4. Add environment variables:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `DATABASE_URL`
   - `WORKER_URL`
5. Click Deploy

After this:
- Every PR automatically gets a **preview URL** visible to everyone via GitHub PR checks
- Merging to `main` automatically triggers a **production deploy**
- No YAML or extra config needed — Vercel handles stages 7 and 8

---

## Team Situation

- **Teammate (repo owner)**: connects Vercel + Railway + provisions PostgreSQL (one-time setup)
- **You**: add GitHub secrets, fix CI YAML, write code
- **Everyone**: sees deploy results through GitHub PR checks — no Vercel account needed

You do NOT need to wait for deployment to start building. Build the app first, deployment becomes meaningful once there's something to deploy.

---

## Build Order (What to Build Before Deploying)

1. Run `create-next-app` to bootstrap `app/` and `package.json`
2. Build FastAPI worker endpoints in `worker_api/` (wraps existing Python core)
3. Set up Prisma schema in `prisma/schema.prisma`
4. Build at least one working Next.js API route in `app/api/`
5. → Then teammate connects Vercel + Railway + runs `prisma migrate deploy`

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| ESLint + Prettier in one `run:` line | Must be **two separate named steps** for rubric evidence |
| npm audit only in `security.yml` | Also add it to `ci.yml` so it's visible in main pipeline tab |
| E2E uses `npm run dev` | Use `build && start` in CI — dev server is slow and flaky |
| Vercel not connected before first PR | No historical evidence in PR checks — connect it early |
| `ANTHROPIC_API_KEY` secret missing | AI review step goes red — add to GitHub secrets first |
| DeepSeek API key | Won't work — rubric requires Claude/Anthropic API key |
