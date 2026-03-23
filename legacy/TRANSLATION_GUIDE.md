# Embassytown Bilingual Translation Guide

This guide walks you through translating the book in 25 Cursor conversations.

## Before You Start

All 25 English chunk files are ready in `translate_book/chunks/`. Each chunk is under 20 content pages so it fits in one conversation.

## How Each Conversation Works

1. Open a **new** Cursor chat (Cmd+L or the chat icon)
2. Copy and paste the prompt listed below for that chunk
3. Wait for the AI to output the bilingual HTML
4. Copy the **entire** response
5. Save it as the file listed (create it in `translate_book/chunks/`)
6. Move on to the next chunk

## The Prompt to Use

For each conversation, paste this prompt (replacing the file path):

---

> Please read the file `translate_book/chunks/chunk_XX_YYYY.txt` and translate it into a bilingual HTML format.
>
> Rules:
> - For each page (marked by `--- Page N of 376 ---`), output the English text first, then the Mandarin Chinese translation directly below it
> - Wrap each English page in `<div class="page-en"><h3>Page N</h3>` and each Chinese page in `<div class="page-zh"><h3>第N页</h3>`
> - Translate faithfully, preserving literary style and paragraph structure
> - Keep character names and place names in English with a Chinese annotation in parentheses on first occurrence only (e.g., "Avice (艾薇丝)")
> - Keep the term "Language" (capital L, the alien language concept) as "语言" with a note on first occurrence that this refers to the Ariekei's unique language
> - Skip the chunk header (the === lines) — only translate the page content
> - Output raw HTML only, no markdown code fences
> - Do NOT include `<html>`, `<head>`, or `<body>` tags — just the div elements

---

## All 25 Conversations

### Conversation 1 — Front Matter
- **Read:** `translate_book/chunks/chunk_01_front_matter.txt`
- **Save as:** `translate_book/chunks/chunk_01_bilingual.html`
- **Content:** Cover, copyright, dedication, acknowledgments, epigraph (pages 1-22)

### Conversation 2 — PROEM: 0.1 & 0.2
- **Read:** `translate_book/chunks/chunk_02_proem_01_02.txt`
- **Save as:** `translate_book/chunks/chunk_02_bilingual.html`
- **Content:** PROEM sections 0.1 and 0.2 (pages 23-42)

### Conversation 3 — PROEM: 0.3
- **Read:** `translate_book/chunks/chunk_03_proem_03.txt`
- **Save as:** `translate_book/chunks/chunk_03_bilingual.html`
- **Content:** PROEM section 0.3 (pages 43-55)

### Conversation 4 — Part One (a)
- **Read:** `translate_book/chunks/chunk_04_part1_a.txt`
- **Save as:** `translate_book/chunks/chunk_04_bilingual.html`
- **Content:** Latterday 1, Formerly 1 (pages 56-73)

### Conversation 5 — Part One (b)
- **Read:** `translate_book/chunks/chunk_05_part1_b.txt`
- **Save as:** `translate_book/chunks/chunk_05_bilingual.html`
- **Content:** Latterday 2, Formerly 2 first half (pages 74-90)

### Conversation 6 — Part One (c)
- **Read:** `translate_book/chunks/chunk_06_part1_c.txt`
- **Save as:** `translate_book/chunks/chunk_06_bilingual.html`
- **Content:** Formerly 2 second half, Latterday 3 (pages 91-105)

### Conversation 7 — Part Two (a)
- **Read:** `translate_book/chunks/chunk_07_part2_a.txt`
- **Save as:** `translate_book/chunks/chunk_07_bilingual.html`
- **Content:** Latterday 4, Formerly 3 (pages 106-120)

### Conversation 8 — Part Two (b)
- **Read:** `translate_book/chunks/chunk_08_part2_b.txt`
- **Save as:** `translate_book/chunks/chunk_08_bilingual.html`
- **Content:** Latterday 5, Formerly 4 (pages 121-135)

### Conversation 9 — Part Two (c)
- **Read:** `translate_book/chunks/chunk_09_part2_c.txt`
- **Save as:** `translate_book/chunks/chunk_09_bilingual.html`
- **Content:** Latterday 6, Formerly 5 (pages 136-148)

### Conversation 10 — Part Two (d)
- **Read:** `translate_book/chunks/chunk_10_part2_d.txt`
- **Save as:** `translate_book/chunks/chunk_10_bilingual.html`
- **Content:** Latterday 7, Formerly 6, Latterday 8 (pages 149-153)

### Conversation 11 — Part Three (a)
- **Read:** `translate_book/chunks/chunk_11_part3_a.txt`
- **Save as:** `translate_book/chunks/chunk_11_bilingual.html`
- **Content:** Formerly 7, Formerly 8 (pages 154-167)

### Conversation 12 — Part Three (b)
- **Read:** `translate_book/chunks/chunk_12_part3_b.txt`
- **Save as:** `translate_book/chunks/chunk_12_bilingual.html`
- **Content:** Formerly 9, Formerly 10 (pages 168-177)

### Conversation 13 — Part Four (a)
- **Read:** `translate_book/chunks/chunk_13_part4_a.txt`
- **Save as:** `translate_book/chunks/chunk_13_bilingual.html`
- **Content:** Sections 9, 10 (pages 178-196)

### Conversation 14 — Part Four (b)
- **Read:** `translate_book/chunks/chunk_14_part4_b.txt`
- **Save as:** `translate_book/chunks/chunk_14_bilingual.html`
- **Content:** Sections 11, 12 (pages 197-211)

### Conversation 15 — Part Four (c)
- **Read:** `translate_book/chunks/chunk_15_part4_c.txt`
- **Save as:** `translate_book/chunks/chunk_15_bilingual.html`
- **Content:** Section 13 (pages 212-216)

### Conversation 16 — Part Five (a)
- **Read:** `translate_book/chunks/chunk_16_part5_a.txt`
- **Save as:** `translate_book/chunks/chunk_16_bilingual.html`
- **Content:** Section 14 (pages 217-230)

### Conversation 17 — Part Five (b)
- **Read:** `translate_book/chunks/chunk_17_part5_b.txt`
- **Save as:** `translate_book/chunks/chunk_17_bilingual.html`
- **Content:** Sections 15, 16 (pages 231-239)

### Conversation 18 — Part Six (a)
- **Read:** `translate_book/chunks/chunk_18_part6_a.txt`
- **Save as:** `translate_book/chunks/chunk_18_bilingual.html`
- **Content:** Section 17 (pages 240-252)

### Conversation 19 — Part Six (b)
- **Read:** `translate_book/chunks/chunk_19_part6_b.txt`
- **Save as:** `translate_book/chunks/chunk_19_bilingual.html`
- **Content:** Section 18 (pages 253-263)

### Conversation 20 — Part Seven (a)
- **Read:** `translate_book/chunks/chunk_20_part7_a.txt`
- **Save as:** `translate_book/chunks/chunk_20_bilingual.html`
- **Content:** Sections 19, 20 (pages 264-282)

### Conversation 21 — Part Seven (b)
- **Read:** `translate_book/chunks/chunk_21_part7_b.txt`
- **Save as:** `translate_book/chunks/chunk_21_bilingual.html`
- **Content:** Sections 21, 22 (pages 283-293)

### Conversation 22 — Part Seven (c)
- **Read:** `translate_book/chunks/chunk_22_part7_c.txt`
- **Save as:** `translate_book/chunks/chunk_22_bilingual.html`
- **Content:** Sections 23, 24 (pages 294-311)

### Conversation 23 — Part Eight (a)
- **Read:** `translate_book/chunks/chunk_23_part8_a.txt`
- **Save as:** `translate_book/chunks/chunk_23_bilingual.html`
- **Content:** Sections 25, 26 (pages 312-325)

### Conversation 24 — Part Eight (b)
- **Read:** `translate_book/chunks/chunk_24_part8_b.txt`
- **Save as:** `translate_book/chunks/chunk_24_bilingual.html`
- **Content:** Sections 27, 28, 29 (pages 326-347)

### Conversation 25 — Part Nine
- **Read:** `translate_book/chunks/chunk_25_part9.txt`
- **Save as:** `translate_book/chunks/chunk_25_bilingual.html`
- **Content:** Sections 30, 31 (pages 348-367)

---

## After All 25 Conversations Are Done

Run the merge script to combine everything into the final bilingual book:

```bash
cd /Users/shuairen/stripe/kafka
python3 translate_book/merge.py
```

This produces `Embassytown_bilingual.html` — open it in any browser to read.

## Checking Progress

You can run `merge.py` at any time to see how many chunks are done. It will report which ones are missing and still produce a partial book with whatever is available.

## Tips

- You can do them in any order (though sequential is recommended for translation consistency)
- If a conversation gets cut off, start a new one for the same chunk
- The AI can read the .txt file directly from the path — no need to paste the text yourself
- Each conversation is independent — no context carries over between them
