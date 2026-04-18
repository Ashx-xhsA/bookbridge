"""HTML content extraction utilities for bilingual chunk files."""

import re


def extract_body_content(html_text: str) -> str:
    """Extract meaningful content from a bilingual chunk HTML file.

    Handles three cases:
    1. Full HTML document with body tags: extracts content between them
    2. HTML fragment without body: strips DOCTYPE, html, head tags
    3. Plain text: returns as is
    """
    body_match = re.search(r"<body[^>]*>(.*?)</body>", html_text, re.DOTALL | re.IGNORECASE)
    if body_match:
        return body_match.group(1).strip()

    if "<" in html_text:
        result = re.sub(r"<!DOCTYPE[^>]*>", "", html_text, flags=re.IGNORECASE)
        result = re.sub(r"<html[^>]*>|</html>", "", result, flags=re.IGNORECASE)
        result = re.sub(r"<head[^>]*>.*?</head>", "", result, flags=re.DOTALL | re.IGNORECASE)
        return result.strip()

    return html_text.strip()
