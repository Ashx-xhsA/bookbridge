# BookBridge Internal API Design

## Ingestion Module (bookbridge.ingestion)

### pdf_reader.py
- `extract_pages(pdf_path: Path) -> dict[int, str]` extracts text per page
- `is_noise_line(line: str) -> bool` detects OCR garbage lines
- `is_running_header(line: str) -> bool` detects repeated page headers
- `clean_page_text(text: str) -> str` cleans a single page of text
- `is_noise_page(text: str) -> bool` detects empty or garbage pages

### chunker.py
- `detect_chapter_breaks(pages: dict[int, str]) -> set[int]` finds structural break points
- `build_chunk_manifest(pages, max_pages_per_chunk) -> ChunkManifest` builds manifest

### Data Classes
- `ChunkInfo(chunk_id, title, start_page, end_page, page_count)`
- `ChunkManifest(source_file, total_pages, chunks: list[ChunkInfo])`

## Glossary Module (bookbridge.glossary)

### store.py
- `GlossaryStore(db_path: Path)` manages SQLite + ChromaDB storage
- `add_term(english, category, context) -> Term` adds a new glossary term
- `lookup_terms(chunk_id, target_lang) -> list[Term]` retrieves relevant terms via RAG
- `set_translation(term_id, lang, translation)` sets or updates a translation
- `search_glossary(query) -> list[Term]` semantic search across all terms

### models.py
- `Term(id, english, category, notes, first_chunk)`
- `Translation(term_id, language_code, translation, approved)`
- `Occurrence(term_id, chunk_id, page_number, context_sentence)`

## Quality Module (bookbridge.quality)

### base.py
- `BaseQualityChecker.check_glossary_consistency(translation, glossary) -> list[Issue]`
- `BaseQualityChecker.check_completeness(original, translation) -> bool`
- `BaseQualityChecker.llm_quality_review(original, translation, criteria) -> QualityScore`

## Output Module (bookbridge.output)

### assembler.py
- `assemble_book(project_id, mode, lang) -> Path` generates final HTML output
- `mode` is either "bilingual" or "translated_only"
