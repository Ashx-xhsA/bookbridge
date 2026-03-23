---
name: tdd-add-module
description: Add a new module to BookBridge using strict TDD (red-green-refactor) workflow with project conventions enforced.
---

# TDD Module Builder for BookBridge

When asked to add a new module to BookBridge, follow this strict TDD workflow.

## Step 1: Understand the Module

- Read `CLAUDE.md` for project conventions and tech stack
- Read `docs/API_DESIGN.md` for the module's planned API (if defined)
- Identify which existing module is closest in structure (use `bookbridge/ingestion/` as default reference)
- Determine what external dependencies the module needs

## Step 2: Create Module Structure

```
bookbridge/<module_name>/
  __init__.py          # package docstring describing the module's purpose
  models.py            # dataclasses for structured data (if needed)
  <core_file>.py       # main implementation file(s)
```

Create the directory and `__init__.py` with a descriptive docstring.

## Step 3: RED -- Write Failing Tests

Create `tests/test_<module_name>.py` with tests covering:
- Happy path for each public function
- Edge cases (empty input, missing data, invalid arguments)
- At least 3 test classes grouping related functionality

Test file conventions:
- Import from the module: `from bookbridge.<module_name>.<file> import ...`
- Use `pytest` fixtures for shared setup
- Name tests descriptively: `test_<what>_<condition>_<expected>`

Run tests to confirm they ALL FAIL:
```bash
pytest tests/test_<module_name>.py -v
```

Commit: `test(red): add failing tests for <module_name> (ref #<issue>)`

## Step 4: GREEN -- Implement Minimum Code

Implement the minimum code to make all tests pass:
- Type hints on ALL function signatures
- Use dataclasses for structured data (never raw dicts for domain objects)
- Functions under 40 lines
- Use `pathlib.Path` for file paths
- Google-style docstrings on all public functions

Run tests to confirm they ALL PASS:
```bash
pytest tests/test_<module_name>.py -v
```

Commit: `feat(green): implement <module_name> to pass all tests (ref #<issue>)`

## Step 5: REFACTOR -- Improve Quality

- Extract magic numbers into named constants
- Improve docstrings with parameter descriptions
- Add type aliases if signatures are complex
- Simplify with early returns where applicable
- Ensure `ruff format` and `ruff check` pass

Run tests to confirm they STILL PASS:
```bash
pytest tests/test_<module_name>.py -v
```

Commit: `refactor: improve <module_name> code quality (ref #<issue>)`

## Constraints

- Do NOT modify existing tests or code in other modules
- Do NOT modify anything in `legacy/`
- Do NOT use `print()` -- use `rich.console` or `logging`
- Do NOT hardcode file paths
- Do NOT store secrets in code
