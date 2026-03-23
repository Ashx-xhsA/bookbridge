# BookBridge: Product Requirements Document

## Problem Statement

BookBridge is an AI powered translation system designed for long documents,
addressing key limitations of traditional translation tools: inconsistent
terminology across sections, loss of narrative and technical context, and
inefficient processing of documents that exceed single prompt context windows.

Instead of translating text in isolated segments, BookBridge first performs
full document structural analysis to extract chapters, recurring entities,
and domain specific terminology. It then enables selective chunk by chunk
translation with enforced glossary consistency, improving translation quality
beyond basic single pass conversion. The system uses document type specific
AI skills (e.g., literary fiction, academic papers, technical documentation)
to better preserve tone, register, and style appropriate to each genre.

BookBridge supports both bilingual (side by side) and translation only output
views, making it adaptable for different user needs. It represents a shift
toward structured AI workflows for long context translation rather than
single step prompt generation.

## Target Users

### International Students
Students studying in a non native language who need to read lengthy English
textbooks, papers, or course materials. They prefer bilingual output so they
can compare the original and translated text side by side, reinforcing
language learning while ensuring comprehension. BookBridge helps them read
without constantly switching to a dictionary, turning reading time into both
study and language improvement.

### Researchers and Professionals
Academics and professionals who need to stay current with the latest English
language publications: research papers, industry reports, standards documents.
They understand most of the content but encounter specialized terms, idioms,
or dense passages that require lookup. Constantly switching to a translation
tool or dictionary interrupts their reading flow. BookBridge provides inline
translations that let them maintain focus, avoiding the context switch penalty
of external lookups.

### Casual Readers (Foreign Language Books)
Readers who want to enjoy books that are not yet available in their native
language. When they try using general purpose translators, they find that
character names and invented terminology are translated inconsistently across
chapters, breaking immersion. BookBridge provides a clean, glossary consistent
translated version (without the original text) for smooth, uninterrupted
reading. For example, a reader translating a 300+ page science fiction novel
would see consistent character and place names throughout.

## Functional Requirements

### FR1: PDF Ingestion
- Accept any English language PDF as input
- Auto detect chapter and section boundaries
- Output structured text chunks with metadata (page ranges, detected titles)
- Handle OCR artifacts and running headers gracefully

### FR2: Glossary Management
- Extract named entities (characters, places, concepts) automatically via NLP
- Store terms with categories, occurrence counts, and chunk locations
- Support human review and approval of term translations
- Provide semantic search across glossary via embeddings (RAG)

### FR3: Translation
- Translate individual chunks on demand (random access, not sequential only)
- Inject relevant glossary terms into each translation context
- Apply configurable translation style via skill files
- Support multiple target languages (zh Hans, es, ar)

### FR4: Quality Assurance
- Check glossary consistency across translated chunks
- Language specific checks (punctuation, register, RTL support)
- LLM based quality review with scoring
- Retry mechanism for low quality translations

### FR5: Output Assembly
- Bilingual HTML (English + target language, page by page)
- Translation only HTML for clean reading
- Sidebar navigation with chapter links and quality indicators
- Incremental assembly (handle partial progress gracefully)

## Non Functional Requirements
- CLI first interface (typer)
- All state in SQLite (portable, no server needed)
- MCP server interfaces for Claude Code integration
- 80%+ test coverage on core modules

## Acceptance Criteria (Sprint 1: Ingestion)
- [ ] AC1: PDF reader extracts clean text from any English PDF
- [ ] AC2: Running headers and OCR noise are removed
- [ ] AC3: Smart chunker detects chapter/part boundaries
- [ ] AC4: Chunk manifest (JSON) lists all chunks with page ranges and titles
- [ ] AC5: CLI `bookbridge scan <pdf>` runs full ingestion pipeline
