import pytest
from bookbridge.output.html_parser import extract_body_content


class TestExtractBodyContent:
    def test_extracts_body_from_full_html(self):
        html = "<html><head><title>T</title></head><body><p>Hello</p></body></html>"
        result = extract_body_content(html)
        assert "<p>Hello</p>" in result

    def test_strips_head_and_html_from_fragment(self):
        html = "<!DOCTYPE html><html><head><style>*{}</style></head><p>Content</p></html>"
        result = extract_body_content(html)
        assert "<p>Content</p>" in result
        assert "<style>" not in result
        assert "DOCTYPE" not in result

    def test_returns_plain_text_unchanged(self):
        text = "Just plain text, no HTML."
        assert extract_body_content(text) == text

    def test_empty_body_returns_empty(self):
        html = "<html><body></body></html>"
        result = extract_body_content(html)
        assert result.strip() == ""

    def test_body_with_attributes(self):
        html = '<html><body class="main"><div>Content</div></body></html>'
        result = extract_body_content(html)
        assert "<div>Content</div>" in result

    def test_strips_whitespace(self):
        html = "<html><body>  \n  Hello  \n  </body></html>"
        result = extract_body_content(html)
        assert result == "Hello"

    def test_multiline_body(self):
        html = "<html><body>\n<p>Line 1</p>\n<p>Line 2</p>\n</body></html>"
        result = extract_body_content(html)
        assert "<p>Line 1</p>" in result
        assert "<p>Line 2</p>" in result

    def test_fragment_with_only_tags(self):
        html = "<div>Some chunk</div><p>More content</p>"
        result = extract_body_content(html)
        assert "Some chunk" in result
