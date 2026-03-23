# BookBridge Glossary MCP Server: Setup Guide

## Overview

The Glossary MCP Server exposes BookBridge's SQLite glossary database as MCP
tools, enabling Claude Code to query, add, and search glossary terms during
translation workflows. This eliminates the need to manually copy-paste term
lists into prompts.

## Prerequisites

- Python 3.11+
- BookBridge installed: `pip install -e ".[dev]"`
- Claude Code CLI (`claude`) installed
- The `mcp` Python package (included in BookBridge dependencies)

## Quick Start

### 1. Install BookBridge

```bash
cd /path/to/bookbridge
pip install -e ".[dev]"
```

This installs all dependencies including the `mcp` package.

### 2. Initialize a Glossary Database

The server creates the database automatically on first run, but you can
also initialize it manually:

```python
from pathlib import Path
from bookbridge.glossary.store import GlossaryStore

store = GlossaryStore(Path("glossary.db"))
store.create_db()
```

### 3. Connect to Claude Code

```bash
claude mcp add glossary-server -- python -m bookbridge.mcp_servers.glossary_server --db /absolute/path/to/glossary.db
```

Replace `/absolute/path/to/glossary.db` with the actual path where you want
the glossary database stored. The file will be created if it does not exist.

### 4. Verify Connection

Start Claude Code and check that the glossary tools are available:

```bash
claude
> What MCP tools are available?
```

You should see the five glossary tools listed.

## Available Tools

### `lookup_terms(chunk_id, target_lang)`
Look up all glossary terms with their translations in a specific language.
Useful before starting translation of a chunk.

**Parameters:**
- `chunk_id` (int): The chunk number (currently returns all terms; chunk filtering planned)
- `target_lang` (str): Language code, e.g., `"zh-Hans"`, `"es"`, `"ar"`

**Example:** "What terms should I use when translating chunk 5 into Chinese?"

### `add_term(english, category, context)`
Add a new term to the glossary.

**Parameters:**
- `english` (str): The English term, e.g., `"Ariekei"`
- `category` (str): One of: `"character"`, `"place"`, `"species"`, `"concept"`, `"invented"`
- `context` (str): A sentence showing how the term is used

**Example:** "Add 'Ariekei' as a species term, seen in 'The Ariekei communicate through Language.'"

### `add_translation(term_id, language_code, translation)`
Add a translation for an existing term.

**Parameters:**
- `term_id` (int): The ID of the term (returned by `add_term` or `list_terms`)
- `language_code` (str): Target language code
- `translation` (str): The translated text

**Example:** "Set the Chinese translation of term 1 to '阿里耶基'."

### `list_terms()`
List all terms in the glossary with their categories. No parameters.

**Example:** "Show me all glossary terms."

### `search_glossary(query)`
Search terms by keyword (case-insensitive partial match on English name).

**Parameters:**
- `query` (str): Search keyword

**Example:** "Search the glossary for anything related to 'embassy'."

## Available Resources

### `glossary://terms`
Returns the full glossary as JSON, including all terms and their translations
in all languages. Useful for getting a complete snapshot.

## Running the Server Standalone (for testing)

You can test the server without Claude Code:

```bash
python -m bookbridge.mcp_servers.glossary_server --db test_glossary.db
```

The server communicates over stdio using the MCP protocol.

## Architecture

```
Claude Code  <--stdio-->  Glossary MCP Server  <--SQLite-->  glossary.db
                              |
                              +-- lookup_terms()
                              +-- add_term()
                              +-- add_translation()
                              +-- list_terms()
                              +-- search_glossary()
                              +-- glossary://terms (resource)
```

The server is stateless between requests -- all data lives in the SQLite
database file. Multiple Claude Code sessions can share the same database.

## Troubleshooting

### "Glossary store not initialized"
The `--db` flag was not passed when starting the server. Make sure the
`claude mcp add` command includes `--db /path/to/glossary.db`.

### Import errors
Ensure BookBridge is installed in the same Python environment:
```bash
pip install -e ".[dev]"
python -c "from bookbridge.mcp_servers.glossary_server import mcp; print('OK')"
```

### Server not appearing in Claude Code
1. Check that `claude mcp add` completed without errors
2. Restart Claude Code after adding the server
3. Verify with `claude mcp list` that the server is registered

### Database permission errors
Ensure the glossary.db path is writable. The server creates the file and
tables automatically on startup if they don't exist.
