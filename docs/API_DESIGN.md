# BookBridge API Design

BookBridge has two services. The **Next.js app** (Vercel) serves the UI and the API routes, and is the only thing the browser talks to. The **Python Worker** (FastAPI, Railway) reads books and calls the translation model. PostgreSQL, accessed only from Next.js through Prisma, holds all data; the Worker keeps no state.

## Request flow

1. **Upload.** `POST /api/upload` sends the EPUB or TXT to the Worker's `/parse`, which returns chapters of paragraphs. Next.js stores them as `Chapter` and `Segment` rows.
2. **Translate a chapter.** `POST /api/jobs` gathers the chapter's paragraphs, the last few translated paragraphs before it, the glossary terms that occur in it, the book's translation notes and the user's model credentials, and sends them to `/translate/segments/async`. The Worker replies `202` and works in the background.
3. **Results come back by callback.** After each batch the Worker posts the translated paragraphs to `/api/internal/worker-callback` (authenticated with a shared secret), and new names to `/worker-callback/glossary`. The UI polls `GET /api/jobs/[jobId]` and reloads the chapter.
4. **Optional whole-book scan.** `POST /api/projects/[id]/bible/scan` calls `/bible/scan/async`; the Worker reports progress after each step and finally posts the overview and the names it found, which are merged into the glossary.

Glossary terms are found in the text by exact matching on names and aliases (see `match_glossary`), so only the names that actually appear in a batch go into its prompt.

---

## Part 1: Python Worker Internal API

The modules the FastAPI Worker wraps. All prompt building and parsing is pure Python and tested without a model (`MockLLMClient`).

### Ingestion (`bookbridge.ingestion`)

- `read_epub(data: bytes, source_file="", limits=None) -> Book` — reads XHTML in spine order, splits chapters by the EPUB 3 nav (or EPUB 2 NCX) and extracts block-level paragraphs. Treats the archive as untrusted (zip-bomb caps in `EpubLimits`, `defusedxml`, path-traversal checks); raises `DRMProtectedError` or `IngestionError`
- `read_txt(data: bytes, source_file="", paragraphs_per_part=…) -> Book` — decodes the text (`decode_text`), strips a Project Gutenberg header/footer, splits paragraphs (`split_paragraphs`) and groups them into chapters at heading lines (`group_by_headings`), or into fixed-size parts when there are none
- Data classes: `Book(source_file, chapters)`, `Chapter(number, title, paragraphs)`

### Harness (`bookbridge.harness`)

- `translate_segments(client, segments, *, target_lang, glossary, preceding, config, bible, on_progress) -> SegmentsResult` — the translation loop:
  - `plan_batches` groups paragraphs into batches of up to `max_batch_chars`
  - each batch is sent as `<<<1>>> … <<<n>>>` (`format_segments`) and the reply is split back by the same markers (`parse_segments`); a count mismatch raises `SegmentAlignmentError`, and the batch is halved and retried until single paragraphs (which get extra attempts)
  - the prompt (`build_translation_prompt`) carries the glossary terms found in the batch, the last `context_window` source/translation pairs, and the book overview
  - optional review (`review_batch`, when `review_max_retries > 0`): rule checks plus a second model call that flags and fixes mistranslations
  - a provider failure stops the job and keeps what is done (`aborted=True`)
- `match_glossary(glossary, text) -> list[GlossaryEntry]` — exact matching with word boundaries, plurals/possessives and case rules; aliases match too and carry their `alias_of` target, so the prompt says who is meant while the alias is translated as written
- `extract_terms(...)` — after translation, asks the model for new names of people and places (`is_proper_noun` filters the rest)
- `scan_book(client, chapters, *, target_lang, progress) -> ScanResult` — optional whole-book pre-scan: one call per ~12k-char passage for names, aliases and a summary, then one call for the overview; `progress` returning `False` raises `ScanStopped`
- `get_llm_client(api_key=None, base_url=None, model=None) -> LLMClient` — `openai_compat` (any OpenAI-format API) or `mock`; `complete_with_retry` retries transient provider errors. A passed-in `base_url` is untrusted (`providers/url_guard.py`): it must be public https, is re-resolved before every call, and redirects are not followed. The env `LLM_BASE_URL` is trusted
- `TranslationConfig` — switches used by the app and by `evals/`: `glossary_mode` (`matched` / `full`), `context_window`, `book_bible`, `review_max_retries`, `max_batch_chars`

### Quality (`bookbridge.quality`)

- `check_segment(source, translation, *, target_lang, glossary) -> list[Issue]` — deterministic checks used by the review step: a glossary term in the source must keep its fixed translation; an alias must not be swapped for the main name; truncation by length ratio; untranslated text; language-specific rules (`ChineseSimplifiedChecker`: half-width punctuation)
- `Issue(category, severity, message)`; `has_errors(issues)`

---

## Part 2: Worker HTTP API (FastAPI)

Deployed on Railway and called only by the Next.js API routes. Long jobs return `202` at once and report back through the BFF callbacks in Part 3. Requests may carry the user's own model credentials in `llm: {llm_api_key, llm_base_url, llm_model}`; without them the Worker's env provider is used. `llm_base_url` gets the same SSRF check as in the harness above. `job_id` must match `^[a-zA-Z0-9_-]{8,128}$`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | `{"status": "ok"}` |
| `POST` | `/parse` | Multipart EPUB or TXT upload (max 50 MB). Returns `{job_id, status: "completed", chapters: [{number, title, paragraphs}]}`; 422 for unsupported, DRM-protected or unreadable files |
| `POST` | `/translate/segments/async` | Translate one chapter's paragraphs (body below). Results are posted to `/api/internal/worker-callback` after each batch; new names go to `/worker-callback/glossary` |
| `POST` | `/bible/scan/async` | Whole-book pre-scan: `{job_id, project_id, target_lang, chapters: string[][], llm?}`. Progress goes to `/worker-callback/bible/progress`, the result (overview + names with aliases) to `/worker-callback/bible` |
| `POST` | `/summarize` | `{text, max_words (20–300), target_lang?, llm?}` → `{summary}` |

`POST /translate/segments/async` body:

```json
{
  "job_id": "string",
  "project_id": "string | null",
  "target_lang": "zh-Hans",
  "segments": [{ "index": 0, "source": "paragraph text" }],
  "preceding": [{ "source": "…", "translation": "… | null" }],
  "glossary": [{
    "english": "Mithrandir", "translation": "米斯兰达", "category": "person",
    "approved": true, "alias_of": { "english": "Gandalf", "translation": "甘道夫" }
  }],
  "bible": { "style_guide": "translation notes / book overview" },
  "config": {
    "glossary_mode": "matched", "context_window": 3, "book_bible": true,
    "review_max_retries": 0, "max_batch_chars": 6000
  },
  "llm": { "llm_api_key": "…", "llm_base_url": "…", "llm_model": "…" }
}
```

Returns `202 {"job_id": "…", "status": "accepted"}`.

---

## Part 3: Next.js BFF API Routes (App Router)

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

### Glossary and translation notes

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/projects/[id]/glossary` | Owner | List all terms |
| `POST` | `/api/projects/[id]/glossary` | Owner | Add a term, optionally as an alias of another (`aliasOfId`) |
| `PATCH` | `/api/projects/[id]/glossary/[termId]` | Owner | Edit translation, gender, voice; approve |
| `DELETE` | `/api/projects/[id]/glossary/[termId]` | Owner | Delete a term |
| `GET` | `/api/projects/[id]/bible` | Owner | The translation notes / book overview (stored as `styleGuide`), its review status, scan status with live progress (`scanDone` / `scanTotal`) and `scanLost` (no progress for 10 minutes) |
| `PATCH` | `/api/projects/[id]/bible` | Owner | Edit the translation notes; confirm or reopen as draft |
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
| `PATCH` | `/api/settings` | Owner | Save provider, base URL and API key. The key is encrypted (AES-256-GCM, `lib/api-key-crypto.ts`) before it is stored. The base URL must be public https (`http://localhost` only outside production), or the route returns `400` |

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

The full schema is in [`bookbridge-next/prisma/schema.prisma`](../bookbridge-next/prisma/schema.prisma). PostgreSQL is the only store; the Worker keeps no state.

| Model | Holds |
|---|---|
| `User` | Clerk id, email, the user's model provider, base URL and API key (`apiKey` holds `enc:v1:…` ciphertext bound to the Clerk id; decrypted only in `lib/llm-credentials.ts`) |
| `Project` | One uploaded book: title, source and target language, status, `isPublic` / `publicToken` for the share link, `reviewEnabled` (double-check, off by default), `sourceChars` |
| `Chapter` | Number, the book's own title, optional summary |
| `Segment` | One source paragraph and its translation, `index` within the chapter, `status` (`pending` / `translated` / `reviewed` / `flagged` / `failed`) and open `reviewIssues` |
| `TranslationJob` | A chapter translation or bible scan, polled by the UI |
| `GlossaryTerm` | A name of a person or place and its fixed translation; `aliasOfId` links a nickname to the entity it names; `approved` / `userEdited` protect it from re-scans; `mentions` from the scan |
| `BookBible` | The translation notes / book overview (column `styleGuide`), its review status, and scan status with live progress |
