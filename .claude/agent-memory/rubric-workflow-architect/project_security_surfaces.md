---
name: Architecture Security Attack Surfaces
description: BookBridge-specific security risks mapped to OWASP categories; these inform the security-reviewer sub-agent and Zod validation patterns
type: project
---

BookBridge has four primary attack surfaces that the grader and security sub-agent will check:

**1. IDOR on project/chunk/glossary routes (OWASP A01)**
Every API route with `[id]` in the path must verify `project.ownerId === auth().userId` after the auth check. An auth check alone is insufficient — Translator A can still read Translator B's data. This is the most common bug pattern in multi-tenant apps and will be scrutinized.

Pattern to enforce in every `app/api/projects/[id]/*` handler:
```typescript
const { userId } = await auth()
if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
const project = await prisma.project.findUnique({ where: { id: params.id } })
if (!project || project.ownerId !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 })
```

**2. Worker shared-secret isolation (OWASP A05)**
The FastAPI Worker on Railway must not be publicly accessible. Implement a FastAPI dependency in `bookbridge/worker_api/auth.py` that checks `X-Worker-Secret` header against `os.environ["WORKER_SECRET"]`. The BFF sends this header on all Worker calls. Secret stored in Railway + Vercel env vars only.

**3. Public token security (OWASP A02)**
The `publicToken` field on Project must be generated with `crypto.randomBytes(32).toString('hex')` — not cuid() or Math.random(). Predictable tokens allow enumeration of published projects.

**4. PDF upload validation (OWASP A04)**
On `POST /api/projects`, validate MIME type (`application/pdf`) and file size (max ~50 MB) in the Next.js route handler before forwarding to Worker. Zod cannot validate binary data; use manual checks.

**5. Centralized Zod schemas (OWASP A03)**
Create `lib/schemas.ts` with Zod schemas for all POST/PATCH bodies. Import and `.parse()` at the top of each route handler before any Prisma or Worker call.

**How to apply:** The security-reviewer sub-agent should check for all five patterns in every PR. Reference these surfaces when writing the agent's instructions.
