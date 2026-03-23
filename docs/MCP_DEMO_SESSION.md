# MCP Glossary Server: Demonstration Session Log

## Setup

### 1. Install dependencies
```bash
cd /path/to/bookbridge
pip install -e ".[dev]"
```

### 2. Connect the MCP server to Claude Code
```bash
claude mcp add glossary-server -- python -m bookbridge.mcp_servers.glossary_server --db glossary.db
```

### 3. Verify connection
After running `claude mcp add`, the server appears in Claude Code's MCP
configuration. Claude Code can now call the glossary tools directly.

## Demonstrated Workflow: Preparing to Translate Chapter 3

### Scenario
"I'm about to translate Chapter 3 of Embassytown into Chinese. I need to
check what glossary terms exist and add any missing ones."

### Step 1: List current terms (empty at start)

**Tool call:** `list_terms()`
**Result:**
```json
[]
```
No terms yet -- this is a fresh glossary database.

### Step 2: Add key terms from the book

**Tool call:** `add_term("Ariekei", "species", "The alien species native to Embassytown")`
**Result:**
```json
{
  "id": 1,
  "english": "Ariekei",
  "category": "species",
  "notes": "The alien species native to Embassytown",
  "first_chunk": 0
}
```

**Tool call:** `add_term("Embassytown", "place", "The human settlement on the Ariekei planet")`
**Result:**
```json
{
  "id": 2,
  "english": "Embassytown",
  "category": "place",
  "notes": "The human settlement on the Ariekei planet",
  "first_chunk": 0
}
```

**Tool call:** `add_term("Avice", "character", "The protagonist, a human immerser")`
**Result:**
```json
{
  "id": 3,
  "english": "Avice",
  "category": "character",
  "notes": "The protagonist, a human immerser",
  "first_chunk": 0
}
```

### Step 3: Add Chinese translations

**Tool call:** `add_translation(1, "zh-Hans", "阿里耶基")`
**Result:**
```json
{
  "term_id": 1,
  "language_code": "zh-Hans",
  "translation": "阿里耶基",
  "approved": false
}
```

**Tool call:** `add_translation(2, "zh-Hans", "大使城")`
**Tool call:** `add_translation(3, "zh-Hans", "艾维斯")`

### Step 4: Look up terms for translation

**Tool call:** `lookup_terms(chunk_id=3, target_lang="zh-Hans")`
**Result:**
```json
[
  {
    "id": 1,
    "english": "Ariekei",
    "category": "species",
    "notes": "The alien species native to Embassytown",
    "first_chunk": 0,
    "translations": [{"term_id": 1, "language_code": "zh-Hans", "translation": "阿里耶基", "approved": false}]
  },
  {
    "id": 2,
    "english": "Embassytown",
    "category": "place",
    "notes": "The human settlement on the Ariekei planet",
    "first_chunk": 0,
    "translations": [{"term_id": 2, "language_code": "zh-Hans", "translation": "大使城", "approved": false}]
  },
  {
    "id": 3,
    "english": "Avice",
    "category": "character",
    "notes": "The protagonist, a human immerser",
    "first_chunk": 0,
    "translations": [{"term_id": 3, "language_code": "zh-Hans", "translation": "艾维斯", "approved": false}]
  }
]
```

### Step 5: Search for a specific term

**Tool call:** `search_glossary("embassy")`
**Result:**
```json
[
  {
    "id": 2,
    "english": "Embassytown",
    "category": "place",
    "notes": "The human settlement on the Ariekei planet",
    "first_chunk": 0
  }
]
```

## What This Enables

With the glossary MCP server connected, Claude Code can:

1. **Before translation:** Query `lookup_terms` to get the full term list with
   approved translations, then include them in the translation prompt.

2. **During translation:** If Claude encounters a new proper noun not in the
   glossary, it calls `add_term` to register it immediately.

3. **After translation:** Search the glossary to verify consistency across
   chapters -- ensuring "Ariekei" is always "阿里耶基" throughout the book.

4. **Cross-session persistence:** The SQLite database persists across Claude Code
   sessions, so glossary knowledge accumulates over time.
