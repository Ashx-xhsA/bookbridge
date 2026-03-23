#!/usr/bin/env python3
"""
Merges all chunk_XX_bilingual.html files into a single styled bilingual book.

Usage:
    python merge.py

Output:
    ../Embassytown_bilingual.html
"""

import os
import re
import glob

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CHUNKS_DIR = os.path.join(SCRIPT_DIR, "chunks")
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "..", "Embassytown_bilingual.html")

CHUNK_META = [
    ("chunk_01_bilingual.html", "Front Matter", "front-matter"),
    ("chunk_02_bilingual.html", "PROEM: 0.1 &amp; 0.2", "proem-01-02"),
    ("chunk_03_bilingual.html", "PROEM: 0.3", "proem-03"),
    ("chunk_04_bilingual.html", "Part One (a): Latterday 1, Formerly 1", "part1-a"),
    ("chunk_05_bilingual.html", "Part One (b): Latterday 2, Formerly 2", "part1-b"),
    ("chunk_06_bilingual.html", "Part One (c): Formerly 2, Latterday 3", "part1-c"),
    ("chunk_07_bilingual.html", "Part Two (a): Latterday 4, Formerly 3", "part2-a"),
    ("chunk_08_bilingual.html", "Part Two (b): Latterday 5, Formerly 4", "part2-b"),
    ("chunk_09_bilingual.html", "Part Two (c): Latterday 6, Formerly 5", "part2-c"),
    ("chunk_10_bilingual.html", "Part Two (d): Latterday 7-8, Formerly 6", "part2-d"),
    ("chunk_11_bilingual.html", "Part Three (a): Formerly 7, 8", "part3-a"),
    ("chunk_12_bilingual.html", "Part Three (b): Formerly 9, 10", "part3-b"),
    ("chunk_13_bilingual.html", "Part Four (a): Sections 9, 10", "part4-a"),
    ("chunk_14_bilingual.html", "Part Four (b): Sections 11, 12", "part4-b"),
    ("chunk_15_bilingual.html", "Part Four (c): Section 13", "part4-c"),
    ("chunk_16_bilingual.html", "Part Five (a): Section 14", "part5-a"),
    ("chunk_17_bilingual.html", "Part Five (b): Sections 15, 16", "part5-b"),
    ("chunk_18_bilingual.html", "Part Six (a): Section 17", "part6-a"),
    ("chunk_19_bilingual.html", "Part Six (b): Section 18", "part6-b"),
    ("chunk_20_bilingual.html", "Part Seven (a): Sections 19, 20", "part7-a"),
    ("chunk_21_bilingual.html", "Part Seven (b): Sections 21, 22", "part7-b"),
    ("chunk_22_bilingual.html", "Part Seven (c): Sections 23, 24", "part7-c"),
    ("chunk_23_bilingual.html", "Part Eight (a): Sections 25, 26", "part8-a"),
    ("chunk_24_bilingual.html", "Part Eight (b): Sections 27, 28, 29", "part8-b"),
    ("chunk_25_bilingual.html", "Part Nine: Sections 30, 31", "part9"),
]

HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Embassytown / 大使城 — Bilingual Edition</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    max-width: 900px;
    margin: 0 auto;
    padding: 20px 30px;
    font-size: 16px;
    line-height: 1.8;
    color: #222;
    background: #fafaf7;
  }}
  h1 {{
    text-align: center;
    font-size: 2em;
    margin-bottom: 0.3em;
    border-bottom: 2px solid #333;
    padding-bottom: 0.3em;
  }}
  h1 small {{
    display: block;
    font-size: 0.5em;
    color: #666;
    font-weight: normal;
  }}
  nav {{
    background: #f0efe8;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 15px 20px;
    margin: 20px 0 40px;
  }}
  nav h2 {{
    margin-top: 0;
    font-size: 1.1em;
  }}
  nav ol {{
    margin: 0;
    padding-left: 1.5em;
    columns: 2;
    column-gap: 30px;
  }}
  nav li {{
    margin-bottom: 4px;
    font-size: 0.9em;
  }}
  nav a {{
    text-decoration: none;
    color: #1a5276;
  }}
  nav a:hover {{
    text-decoration: underline;
  }}
  .chunk-section {{
    margin-bottom: 60px;
    page-break-before: always;
  }}
  .chunk-section h2 {{
    background: #333;
    color: #fff;
    padding: 10px 18px;
    border-radius: 4px;
    font-size: 1.15em;
  }}
  .chunk-content {{
    border-left: 3px solid #ccc;
    padding-left: 20px;
  }}
  .page-en {{
    font-family: Georgia, 'Times New Roman', serif;
    color: #333;
    margin-bottom: 20px;
  }}
  .page-zh {{
    font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
    color: #1a3a5c;
    margin-bottom: 40px;
    border-bottom: 1px dashed #ccc;
    padding-bottom: 20px;
  }}
  @media print {{
    nav {{ page-break-after: always; }}
    .chunk-section {{ page-break-before: always; }}
    body {{ max-width: none; padding: 0 15px; }}
  }}
</style>
</head>
<body>

<h1>
  Embassytown / 大使城
  <small>China Miéville — Bilingual English / 中文 Edition</small>
</h1>

<nav>
  <h2>Table of Contents / 目录</h2>
  <ol>
{toc_entries}
  </ol>
</nav>

{body_sections}

<footer style="text-align:center; color:#999; margin-top:80px; padding:20px; border-top:1px solid #ddd;">
  <p>Embassytown by China Miéville — Bilingual translation for personal reading use.</p>
</footer>

</body>
</html>
"""


def extract_body_content(html_text: str) -> str:
    """Extract meaningful content from a bilingual chunk HTML file.

    Handles both full HTML documents and raw HTML fragments.
    """
    body_match = re.search(r"<body[^>]*>(.*?)</body>", html_text, re.DOTALL | re.IGNORECASE)
    if body_match:
        return body_match.group(1).strip()
    if "<" in html_text:
        html_text = re.sub(r"<!DOCTYPE[^>]*>", "", html_text, flags=re.IGNORECASE)
        html_text = re.sub(r"<html[^>]*>|</html>", "", html_text, flags=re.IGNORECASE)
        html_text = re.sub(r"<head[^>]*>.*?</head>", "", html_text, flags=re.DOTALL | re.IGNORECASE)
        return html_text.strip()
    return html_text.strip()


def main():
    found = []
    missing = []

    for filename, label, anchor in CHUNK_META:
        path = os.path.join(CHUNKS_DIR, filename)
        if os.path.exists(path):
            found.append((filename, label, anchor, path))
        else:
            missing.append((filename, label))

    if missing:
        print(f"WARNING: {len(missing)} bilingual chunk(s) not found:")
        for fn, label in missing:
            print(f"  - {fn}  ({label})")
        print()

    if not found:
        print("ERROR: No bilingual chunk files found in chunks/")
        print("Complete the translation conversations first, then run this script.")
        return

    print(f"Found {len(found)} of {len(CHUNK_META)} bilingual chunks.\n")

    toc_lines = []
    body_sections = []

    for filename, label, anchor, path in found:
        toc_lines.append(f'    <li><a href="#{anchor}">{label}</a></li>')

        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()

        content = extract_body_content(raw)

        section_html = (
            f'<section class="chunk-section" id="{anchor}">\n'
            f'  <h2>{label}</h2>\n'
            f'  <div class="chunk-content">\n'
            f'    {content}\n'
            f'  </div>\n'
            f'</section>\n'
        )
        body_sections.append(section_html)

    toc_entries = "\n".join(toc_lines)
    body_html = "\n".join(body_sections)
    final = HTML_TEMPLATE.format(toc_entries=toc_entries, body_sections=body_html)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(final)

    print(f"Bilingual book written to: {OUTPUT_PATH}")
    print(f"({len(found)} sections included)")

    if missing:
        print(f"\nNote: {len(missing)} chunks still missing. Re-run after completing all translations.")


if __name__ == "__main__":
    main()
