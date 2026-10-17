# BookBridge API Design v2

> v1 covered the Python CLI internal API only. v2 adds the FastAPI Worker HTTP API and Next.js BFF API Routes to support the web app architecture.

---

## Part 1: Python Worker Internal API

These are the internal Python module interfaces used within the Worker service.

### Ingestion Module (`bookbridge.ingestion`)

#### pdf_reader.py
- `extract_pages(pdf_path: Path) -> dict[int, str]` — extract text per page
- `is_noise_line(line: str) -> bool` — detect OCR garbage lines
- `is_running_header(line: str) -> bool` — detect repeated page headers
- `clean_page_text(text: str) -> str` — clean a single page of text
- `is_noise_page(text: str) -> bool` — detect empty or garbage pages

#### chunker.py
- `detect_chapter_breaks(pages: dict[int, str]) -> set[int]` — find structural break points
- `build_chunk_manifest(pages, max_pages_per_chunk) -> ChunkManifest` — build manifest

#### Data Classes
- `ChunkInfo(chunk_id, title, start_page, end_page, page_count)`
- `ChunkManifest(source_file, total_pages, chunks: list[ChunkInfo])`

---

### Glossary Module (`bookbridge.glossary`)

#### store.py
- `GlossaryStore(db_path: Path)` — manages SQLite + ChromaDB storage (local RAG layer)
- `add_term(english, category, context) -> Term`
- `lookup_terms(chunk_id, target_lang) -> list[Term]` — RAG retrieval for translation context
- `set_translation(term_id, lang, translation)`
- `search_glossary(query) -> list[Term]`

#### models.py
- `Term(id, english, category, notes, first_chunk)`
- `Translation(term_id, language_code, translation, approved)`
- `Occurrence(term_id, chunk_id, page_number, context_sentence)`

---

### Harness Module (`bookbridge.harness`)

#### orchestrator.py
- `TranslationJob(project_id, chunk_id, target_lang, skill)` — job dataclass
- `translate_chunk(job: TranslationJob, pg_conn) -> str` — main orchestration entry point
  - Loads chunk text from PostgreSQL
  - Retrieves relevant glossary terms via RAG
  - Builds prompt with skill template
  - Calls Claude API
  - Writes result + status back to PostgreSQL
- `build_prompt(chunk_text, terms, skill_template) -> str`
- `call_claude(prompt: str) -> str` — Claude API wrapper

---

### Quality Module (`bookbridge.quality`)

#### base.py
- `BaseQualityChecker.check_glossary_consistency(translation, glossary) -> list[Issue]`
- `BaseQualityChecker.check_completeness(original, translation) -> bool`
- `BaseQualityChecker.llm_quality_review(original, translation, criteria) -> QualityScore`

---

## Part 2: Worker HTTP API (FastAPI)

Deployed on Railway. Called by Next.js API Routes.

### `POST /parse`
Parse an uploaded PDF and write chunks to PostgreSQL.

**Request:**
```json
{
  "project_id": "string",
  "pdf_url": "string",
  "target_language": "zh-Hans | es | ar",
  "skill": "literary | academic | technical"
}
```
**Response:**
```json
{
  "job_id": "string",
  "status": "queued"
}
```

---

### `POST /translate/chunk`
Translate a single chapter chunk.

**Request:**
```json
{
  "project_id": "string",
  "chunk_id": "string"
}
```
**Response:**
```json
{
  "job_id": "string",
  "status": "queued"
}
```

---

### `GET /job/{job_id}`
Poll translation or parse job status.

**Response:**
```json
{
  "job_id": "string",
  "status": "queued | translating | translated | failed",
  "error": "string | null"
}
```

---

### `POST /glossary/extract`
Extract named entities from all parsed chunks of a project.

**Request:**
```json
{
  "project_id": "string"
}
```
**Response:**
```json
{
  "job_id": "string",
  "status": "queued"
}
```

---

## Part 3: Next.js BFF API Routes (App Router)

> Updated 2026-10-17 to match the code after the EPUB/TXT refactor (Phase 5). Parts 1, 2 and 4 still describe the pre-refactor design and will be rewritten together with the README.

All routes need a Clerk session unless marked **Public** or **Worker**. Every `[id]` route checks ownership: missing project → 404, someone else's → 403. Route params and query strings are validated with Zod first (400 on failure). Public routes take the project's `publicToken` (a UUID) as the authorization and return 404 for both unknown and unpublished tokens.

### Projects and upload

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/projects` | Owner | List the user's projects |
| `POST` | `/api/upload` | Owner | Upload an EPUB or TXT (form data, max 4.5 MB); the Worker `/parse` splits it into chapters and paragraph `Segment`s. Over 1.5 M characters → 413 |
| `GET` | `/api/projects/[id]` | Owner | Project metadata, chapter list (no text), jobs, glossary |
| `PATCH` | `/api/projects/[id]` | Owner | Rename; publish / unpublish (publishing rotates `publicToken`) |
| `DELETE` | `/api/projects/[id]` | Owner | Delete the project and everything under it |

### Reading (owner)

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/projects/[id]/chapters/[chapterId]` | Owner | One chapter's paragraphs, aligned: `{ index, source, translation \| null, status, issues }[]`. Untranslated paragraphs keep their place. `status` is `pending` / `translated` / `reviewed` / `flagged` / `failed`; `issues` are the review issues still open |
| `GET` | `/api/projects/[id]/search?q=` | Owner | Search source and translation (2–100 chars, case-insensitive, max 50 hits): `{ chapterId, chapterNumber, chapterTitle, index, snippet }[]` |
| `GET` | `/api/projects/[id]/export?format=md\|epub&layout=…` | Owner | Download the whole book. `md`: `layout=translation` (default) or `bilingual`. `epub`: bilingual EPUB 3, `layout=side` (default, source left / translation right) or `stacked` (source paragraph, then its translation). Exports never include review details |

### Translation jobs

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/jobs` | Owner | Translate one chapter: sends its paragraphs, the preceding context, matched glossary and the book bible to the Worker (`/translate/segments/async`) |
| `GET` | `/api/jobs/[jobId]` | Owner | Poll a job |
| `DELETE` | `/api/jobs/[jobId]` | Owner | Delete the job record (the UI's Stop button); the Worker is not told to stop |
| `GET` | `/api/projects/[id]/translate-batch` | Owner | Chapters still to translate, for "Translate All" |
| `POST` | `/api/projects/[id]/summarize` | Owner | Summarize a chapter (shown in the UI only, not used as translation context) |

### Glossary and book bible

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/projects/[id]/glossary` | Owner | List all terms |
| `POST` | `/api/projects/[id]/glossary` | Owner | Add a term, optionally as an alias of another (`aliasOfId`) |
| `PATCH` | `/api/projects/[id]/glossary/[termId]` | Owner | Edit translation, gender, voice; approve |
| `DELETE` | `/api/projects/[id]/glossary/[termId]` | Owner | Delete a term |
| `GET` | `/api/projects/[id]/bible` | Owner | Bible review status, the book overview (stored as `styleGuide`), scan status with live progress (`scanDone` / `scanTotal`) and `scanLost` (no progress for 10 minutes) |
| `PATCH` | `/api/projects/[id]/bible` | Owner | Edit the book overview; confirm or reopen as draft |
| `POST` | `/api/projects/[id]/bible/scan` | Owner | Start a pre-scan of the whole book (returns a job to poll): one model call per ~12k-char passage for names and a summary, then one call for the overview. 409 while a scan is still reporting progress |
| `DELETE` | `/api/projects/[id]/bible/scan` | Owner | Stop a running scan. The Worker stops at its next progress report; the current bible is kept |

### Public reading (shared link)

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/read/[token]` | Public | Published project metadata and chapter list |
| `GET` | `/api/read/[token]/chunks/[chunkId]` | Public | One chapter: joined `originalText` / `translatedText` plus aligned `segments: { index, source, translation }[]` (no status or issues) |
| `GET` | `/api/read/[token]/search?q=` | Public | Same search as the owner route, scoped to the published project |

### Settings

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/settings` | Owner | The user's model provider settings (`hasApiKey` only, never the key) |
| `PATCH` | `/api/settings` | Owner | Save provider, base URL and API key |

### Worker callbacks

Server to server only. The Worker authenticates with the shared secret in `X-Worker-Secret`; there is no Clerk session.

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/internal/worker-callback` | Worker | Per-paragraph translation results with review status and open issues |
| `POST` | `/api/internal/worker-callback/glossary` | Worker | New proper nouns extracted after translation |
| `POST` | `/api/internal/worker-callback/bible` | Worker | Pre-scan result: names of people and places with aliases (merged into the glossary) and the book overview |
| `POST` | `/api/internal/worker-callback/bible/progress` | Worker | Scan progress after each step; replies `{continue: false}` when the scan was stopped or replaced |

---

## Part 4: Prisma Schema (PostgreSQL)

```prisma
model Project {
  id           String   @id @default(cuid())
  ownerId      String
  title        String
  language     String
  skill        String
  status       String   @default("parsing")
  isPublic     Boolean  @default(false)
  publicToken  String?  @unique
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  chunks       Chunk[]
  terms        Term[]
}

model Chunk {
  id              String   @id @default(cuid())
  projectId       String
  project         Project  @relation(fields: [projectId], references: [id])
  title           String
  startPage       Int
  endPage         Int
  orderIndex      Int
  originalText    String
  translatedText  String?
  status          ChunkStatus @default(UNTRANSLATED)
  qualityScore    Float?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

enum ChunkStatus {
  UNTRANSLATED
  QUEUED
  TRANSLATING
  TRANSLATED
  FAILED
}

model Term {
  id           String        @id @default(cuid())
  projectId    String
  project      Project       @relation(fields: [projectId], references: [id])
  english      String
  category     String
  notes        String?
  translations TermTranslation[]
}

model TermTranslation {
  id           String  @id @default(cuid())
  termId       String
  term         Term    @relation(fields: [termId], references: [id])
  languageCode String
  translation  String
  approved     Boolean @default(false)
}
```
