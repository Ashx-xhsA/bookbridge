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

All routes require Clerk authentication unless marked public.

### Projects

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/projects` | Translator | List user's projects |
| `POST` | `/api/projects` | Translator | Create project, trigger Worker `/parse` |
| `GET` | `/api/projects/[id]` | Translator | Get project details + chunk list |
| `PATCH` | `/api/projects/[id]` | Translator | Update name, publish/unpublish |
| `DELETE` | `/api/projects/[id]` | Translator | Delete project |

### Chunks

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/projects/[id]/chunks` | Translator | List all chunks with status |
| `POST` | `/api/projects/[id]/chunks/[chunkId]/translate` | Translator | Trigger Worker `/translate/chunk` |
| `GET` | `/api/projects/[id]/chunks/[chunkId]` | Translator | Get chunk content + translation |

### Glossary

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/projects/[id]/glossary` | Translator | List all terms |
| `POST` | `/api/projects/[id]/glossary` | Translator | Add term manually |
| `PATCH` | `/api/projects/[id]/glossary/[termId]` | Translator | Edit / approve term translation |
| `DELETE` | `/api/projects/[id]/glossary/[termId]` | Translator | Delete term |

### Public Reading

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/read/[token]` | Public | Get published project metadata + chunk list |
| `GET` | `/api/read/[token]/chunks/[chunkId]` | Public | Get chunk content for reading view |

### Jobs

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/jobs/[jobId]` | Translator | Poll Worker job status (proxies Worker `/job/{id}`) |

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
