# Skill Iteration: tdd-add-module v1 to v2

## Summary

After testing v1 on the glossary store module (Task 1), six shortcomings were
identified. v2 addresses all of them with concrete additions.

## What Changed and Why

### 1. Added Pre-flight Checklist (NEW section)

**v1 problem:** Started coding without systematically reading project context files.
Had to backtrack to check conventions mid-implementation.

**v2 fix:** Added explicit checklist: read CLAUDE.md, API_DESIGN.md, PRD.md, and
pyproject.toml before writing any code. Also identifies which existing module to
use as a structural reference.

### 2. Added Dependency Check Step (NEW Step 1)

**v1 problem:** No guidance on checking or updating pyproject.toml. For the glossary
module, SQLite was in stdlib so no changes were needed, but a module requiring
`chromadb` or `spacy` would have been missed.

**v2 fix:** Added Step 1 (Dependency Check) that explicitly lists: check what the
module needs, verify against pyproject.toml, add and install if missing.

### 3. Added Test Fixture Patterns (NEW subsection in Step 3)

**v1 problem:** v1 said "use pytest fixtures" but gave no examples. For the glossary
module, every test manually created a store with `tmp_path`, leading to 16 lines
of repeated boilerplate across test classes.

**v2 fix:** Added "Test Fixture Patterns" subsection with concrete examples:
`@pytest.fixture` for store creation with `tmp_path`, and a `sample_terms` fixture
for pre-populated test data.

### 4. Added Error Handling Pattern (NEW subsection in Step 4)

**v1 problem:** No guidance on how to handle missing records, invalid inputs, or
resource cleanup. During glossary implementation, had to decide independently
whether `get_term(999)` should return None or raise an exception.

**v2 fix:** Added "Error Handling Pattern" with clear rules: return None for missing
lookups, raise ValueError for bad input, use contextmanager for cleanup, use
parameterized SQL queries.

### 5. Enhanced Code Pattern References (IMPROVED Step 2)

**v1 problem:** v1 said "reference ingestion/ as template" generically. Did not
specify which files to look at or which patterns to copy (to_dict, __init__.py
docstring convention, constant extraction).

**v2 fix:** Step 2 now lists specific conventions for models.py (to_dict pattern
from ingestion/models.py) and __init__.py (docstring format). Also lists multiple
reference modules by category.

### 6. Added Definition of Done (NEW section)

**v1 problem:** No clear criteria for when the module is complete. Could stop after
GREEN without refactoring, or skip coverage checks.

**v2 fix:** Added "Definition of Done" checklist: all tests pass, no ruff errors,
3 commits present, docstrings complete, type hints present, dataclasses have to_dict.

## Side-by-side Comparison

| Aspect                  | v1                                | v2                                         |
|-------------------------|-----------------------------------|--------------------------------------------|
| Pre-flight              | None                              | 4-item checklist + reference module picker  |
| Dependency handling     | Not mentioned                     | Explicit Step 1 with pyproject.toml check  |
| Test fixtures           | "use pytest fixtures" (no detail) | Concrete examples with tmp_path and setup  |
| Error handling          | Not mentioned                     | Return None / raise ValueError / cleanup   |
| Code pattern references | "reference ingestion/"            | Per-file conventions + multiple references |
| Definition of Done      | None                              | 7-item checklist                           |
| Total sections          | 7                                 | 10                                         |

## Impact on Task 2

v2 was used to build the quality checker module (Task 2). The pre-flight checklist
caught that `docs/API_DESIGN.md` already specified the exact method signatures for
`BaseQualityChecker`. The fixture patterns eliminated boilerplate. The Definition
of Done ensured all checks were completed before committing.
