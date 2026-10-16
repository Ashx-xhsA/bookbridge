---
name: log-chat
description: Record a summary of the current chat into docs/chat-log/ and update docs/PROGRESS.md. Run at the end of each chat session.
---

# Log Chat

When invoked as `/log-chat [topic]`, follow these steps.

## Step 1: Write the chat log

Create `docs/chat-log/YYYY-MM-DD-<topic>.md`. Use today's date. For the topic, use a short kebab-case English slug, taken from the argument or inferred from the chat. If the file already exists, append `-2`, `-3`, and so on.

Write it in Chinese, using this structure:

```markdown
# YYYY-MM-DD — <主题>

## 讨论了什么
- （要点，3～8 条）

## 决定
- （本次确定的事；没有就写「无」）

## 改动的文件
- `path` — 一句话说明（没有就写「无」）

## 待办 / 待决定
- [ ] （下一步要做的事，或还没定的问题）
```

Rules:
- Summarize. Don't paste the transcript or long quotes.
- Only record what actually happened in this chat. Don't invent decisions or numbers.
- No secrets, API keys, or personal data.

## Step 2: Update PROGRESS.md

In `docs/PROGRESS.md`:
- Add each new decision to the 决策记录 (decision log) table.
- Add a dated entry at the top of 进展日志 (progress log) that links to the new chat log.
- Update the 当前状态 (current status) table and the 待决定 (to decide) list.

## Step 3: Report

Tell the user in one line which files were written. Don't commit unless they ask.
