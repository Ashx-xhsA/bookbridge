---
name: tdd-add-module
description: Add a new module to BookBridge using strict TDD (red-green-refactor) workflow with project conventions enforced. v2 with fixture patterns, dependency handling, and definition of done.
---

# TDD Module Builder for BookBridge (v2)

When asked to add a new module to BookBridge, follow this strict TDD workflow.

## Pre-flight Checklist

Before writing any code, read and internalize these project files:
- [ ] `CLAUDE.md` -- coding conventions, tech stack, do's and don'ts
- [ ] `docs/API_DESIGN.md` -- planned API for the module (function signatures, data classes)
- [ ] `docs/PRD.md` -- understand where this module fits in the product
- [ ] `pyproject.toml` -- current dependencies and project config

Identify the closest existing module to use as a structural reference:
- `bookbridge/ingestion/` -- for data processing modules (PDF, chunking)
- `bookbridge/glossary/` -- for SQLite-backed storage modules
- `bookbridge/output/` -- for output generation modules

## Step 1: Dependency Check

Before creating any files, verify dependencies:
1. List what external packages the module needs
2. Check if they are already in `pyproject.toml` under `[project.dependencies]`
3. If new packages are needed, add them to `pyproject.toml` and run `pip install -e ".[dev]"`
4. For stdlib modules (sqlite3, pathlib, json, etc.), no changes needed

## Step 2: Create Module Structure

```
bookbridge/<module_name>/
  __init__.py          # one-line docstring: """<Module> module: <purpose>."""
  models.py            # dataclasses with to_dict() methods (follow ingestion/models.py pattern)
  <core_file>.py       # main implementation file(s)
```

Conventions for `models.py`:
- Import from `dataclasses`: `dataclass`, `field` (if needed)
- Every dataclass gets a `to_dict() -> dict` method for serialization
- Use type hints: `list[X]`, `dict[K, V]`, `X | None` (not Optional)

Conventions for `__init__.py`:
- Single-line module docstring matching project pattern
- Example: `"""Glossary module: SQLite-backed term storage and retrieval."""`

## Step 3: RED -- Write Failing Tests

Create `tests/test_<module_name>.py` with tests covering:
- Happy path for each public function
- Edge cases (empty input, missing data, invalid arguments)
- At least 3 test classes grouping related functionality
- Name tests descriptively: `test_<what>_<condition>_<expected>`

### Test Fixture Patterns

For modules that need shared setup, use `pytest` fixtures:

```python
import pytest

# For SQLite-backed modules: use tmp_path for isolated DB per test
@pytest.fixture
def store(tmp_path):
    """Create a fresh GlossaryStore with initialized DB."""
    from bookbridge.glossary.store import GlossaryStore
    s = GlossaryStore(tmp_path / "test.db")
    s.create_db()
    return s

# For modules that need sample data
@pytest.fixture
def sample_terms(store):
    """Pre-populate store with test data."""
    store.add_term("Ariekei", "species", "context")
    store.add_term("Embassytown", "place", "context")
    return store
```

Use `tmp_path` (pytest built-in) for any file/DB operations -- never hardcode paths.

### Running RED tests

```bash
pytest tests/test_<module_name>.py -v
```

All tests MUST fail (ImportError or AssertionError). If any pass, the test is not
checking new behavior.

Commit: `test(red): add failing tests for <module_name> (ref #<issue>)`

## Step 4: GREEN -- Implement Minimum Code

Implement the minimum code to make all tests pass. Follow these conventions strictly:

- Type hints on ALL function signatures (enforced by ruff)
- Use dataclasses for structured data (never raw dicts for domain objects)
- Functions under 40 lines; extract helpers when longer
- Use `pathlib.Path` for all file paths, never `os.path`
- Google-style docstrings on all public functions with Args/Returns sections
- Use `rich.console` or `logging` instead of `print()`

### Error Handling Pattern

- Return `None` for single-item lookups that find nothing (not exceptions)
- Raise `ValueError` for invalid input that the caller should fix
- Use `try/finally` or `contextmanager` for resource cleanup (DB connections, files)
- SQLite: always use parameterized queries (never f-strings for SQL)

```bash
pytest tests/test_<module_name>.py -v
```

All tests MUST pass. Also verify existing tests are not broken:
```bash
pytest tests/ -v --tb=short
```

Commit: `feat(green): implement <module_name> to pass all tests (ref #<issue>)`

## Step 5: REFACTOR -- Improve Quality

- Extract magic numbers and strings into named constants at module level
- Extract repeated patterns into helper methods (e.g., `_row_to_model()`)
- Use `@contextmanager` for resource management where applicable
- Add type aliases if function signatures are complex
- Simplify with early returns where applicable

### Post-refactor Checks

```bash
pytest tests/ -v --tb=short         # all tests still pass
ruff format bookbridge/ tests/      # auto-format
ruff check bookbridge/ tests/       # no lint errors
pytest tests/ --cov=bookbridge --cov-report=term  # check coverage
```

Commit: `refactor: improve <module_name> code quality (ref #<issue>)`

## Constraints

- Do NOT modify existing tests or code in other modules
- Do NOT modify anything in `legacy/`
- Do NOT use `print()` -- use `rich.console` or `logging`
- Do NOT hardcode file paths
- Do NOT store secrets in code
- Do NOT use raw dicts for domain objects -- always use dataclasses

## Definition of Done

A module is complete when ALL of the following are true:
- [ ] All new tests pass (`pytest tests/test_<module>.py -v`)
- [ ] All existing tests still pass (`pytest tests/ -v`)
- [ ] No ruff format or lint errors (`ruff format --check . && ruff check .`)
- [ ] 3 clean commits: `test(red):`, `feat(green):`, `refactor:`
- [ ] Docstrings on all public functions
- [ ] Type hints on all function signatures
- [ ] `models.py` uses dataclasses with `to_dict()` methods
