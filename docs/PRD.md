# BookBridge Product Requirements Document v2

> Version history: v1 was a Python CLI implementation (see git history). From v2 onwards, the project adopts a Next.js Web App + Python Worker architecture.

---

## Problem Statement

BookBridge is an AI-powered long-document translation web platform. After uploading a PDF, the platform automatically parses the chapter structure and supports selective per-chapter translation. Results are presented in an immersive two-column reading view (original on the left, translation on the right). Compared to traditional whole-document translation, BookBridge guarantees cross-chapter terminology consistency and supports progressive reading — no need to wait for the entire book to be translated.

---

## Target Users

### Translator (Registered User)
Uploads PDFs, selects target language and translation style, manages the glossary, triggers per-chapter translation, and publishes projects as public links.

### Reader (Guest)
Accesses published projects via a public link without registering. Reads in the two-column view and toggles between bilingual and translation-only modes.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend / BFF | Next.js 15 App Router |
| Authentication | Clerk |
| Database | PostgreSQL (Neon) via Prisma |
| Translation Worker | Python 3.11, existing bookbridge core wrapped with FastAPI, deployed on Railway |
| Vector Retrieval | ChromaDB (local to Worker, RAG acceleration layer) |
| LLM | Anthropic Claude API (called by Python Worker) |
| Deployment | Vercel (Next.js) + Railway (Python Worker) |
| CI/CD | GitHub Actions |

---

## Functional Requirements

### FR1: Authentication (Clerk)
- Translator: accesses Dashboard after sign-up / login
- Reader: accesses public projects directly via link, no login required

### FR2: Project Management (Translator)
- Upload PDF, set project name, target language, and translation style (literary / academic / technical)
- Project list shows: name, progress (translated chapters / total chapters), publish status
- Publish / unpublish project, generating a public reading link

### FR3: PDF Parsing (Python Worker)
- Extract page text, detect chapter boundaries, clean noise and running headers
- Generate ChunkManifest and write to PostgreSQL
- Each chunk's initial status: `untranslated`

### FR4: Glossary Management (Translator, within Dashboard)
- Worker automatically extracts named entities and writes them to PostgreSQL
- Translator can review, edit, and approve term translations
- Manual term addition supported

### FR5: Chapter Translation (Python Worker)
- Accepts single-chapter translation requests; status transitions: `untranslated → queued → translating → translated | failed`
- Injects relevant glossary terms into Claude API prompt via RAG
- Writes translation results back to PostgreSQL
- Automatic single retry on failure

### FR6: Reading View (Reader + Translator)

**Layout (inspired by Readest):**
- Top toolbar: Toggle Sidebar | book title centered | font size controls
- Left sidebar (collapsible): chapter names + page numbers + translation status badges (○ untranslated / ⟳ translating / ✓ translated)
- Main area: left column = original text, right column = translation, two-column book-page layout
- Untranslated chapters: right column shows original text with a "Translate This Chapter" banner at the top (visible to Translator only)
- Bottom: reading progress bar + page number

**Interactions:**
- Click a chapter in the sidebar → jump to that position
- "Translate This Chapter" → triggers Worker task; right column updates in real time via polling
- Top toggle: bilingual / translation-only mode

### FR7: Quality Checking (Python Worker)
- Glossary consistency check across translated chunks
- LLM quality scoring; results written to PostgreSQL
- Per-chapter quality scores displayed in Dashboard

---

## Core Data Model

```
User          (Clerk managed)
Project       id, owner_id, title, language, skill, status, is_public, public_token
Chunk         id, project_id, title, start_page, end_page, original_text,
              translated_text, status, quality_score, order_index
Term          id, project_id, english, category, notes
Translation   id, term_id, language_code, translation, approved
```

---

## Worker API (FastAPI)

| Endpoint | Description |
|---|---|
| `POST /parse` | Receive PDF, parse and write chunks to PostgreSQL |
| `POST /translate/chunk` | Translate a single chapter |
| `GET /job/{job_id}` | Query job status |
| `POST /glossary/extract` | Extract terms from parsed chunks |

---

## Sprint Plan

### Sprint 1 — Python Foundation (Complete)
**Goal: build and test the core Python CLI modules that the Worker will expose**
- TDD ingestion pipeline: text cleaning, smart chunker, HTML body extractor (PRs #4-7)
- TDD glossary SQLite store with ChromaDB vector retrieval
- TDD quality checker with per-language base class
- Glossary MCP server (tools: lookup, add, list terms)
- Custom TDD skill `tdd-add-module` iterated v1→v2
- CLAUDE.md, README, PRD v2, API Design documentation

### Sprint 2 — Deploy First
**Goal: establish a deployable full-stack skeleton so the CI/CD pipeline runs continuously from this sprint onward**
- Python Worker: FastAPI endpoints (`/parse`, `/translate/chunk`, `/job/{id}`)
- Implement `harness/` (translation orchestrator: chunk → Claude API → write results)
- Migrate SQLite → PostgreSQL (psycopg2)
- Deploy Python Worker to Railway
- Next.js 15 shell: Clerk auth (sign-in / sign-up pages live) + protected route skeleton + base layout
- Connect Vercel; production deploy on merge to main
- GitHub Actions CI pipeline live: lint, typecheck, unit tests, preview deploy, prod deploy, npm audit, AI PR review

### Sprint 3 — Next.js Full Features
**Goal: complete user flow from PDF upload to seeing a translated chapter**
- Prisma schema (Project / Chunk / Term tables)
- PDF upload → call Worker `/parse` → display chapter list
- Dashboard UI (project list + create project)
- Trigger single-chapter translation → polling → status update
- Glossary management (view / edit terms in Dashboard)

### Sprint 4 — Reading View + Polish
**Goal: complete two-column reading experience and production-grade polish**
- Two-column reading view (toggleable sidebar, status badges, font size controls)
- "Translate This Chapter" banner → Worker → polling → real-time right-column update
- Publish project → public link → Reader reading view
- Bilingual / translation-only mode toggle
- Quality score display + manual re-translation of low-score chapters
- Playwright E2E test cases added to existing CI pipeline
- Responsive UI optimization

---

## Non-Functional Requirements
- Next.js API Routes act as BFF; Python Worker accepts tasks via REST
- All persistent state stored in PostgreSQL (single source of truth)
- ChromaDB is a local RAG acceleration layer on the Worker only, not source of truth
- 80%+ test coverage on core modules
- CI/CD pipeline: lint, typecheck, unit tests, E2E (Playwright), security scan, AI PR review, Vercel preview deploy
