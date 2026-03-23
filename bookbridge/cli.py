"""BookBridge CLI entry point."""

import typer
from rich.console import Console

app = typer.Typer(help="BookBridge: Skill driven book translation system")
console = Console()


@app.command()
def scan(pdf_path: str = typer.Argument(..., help="Path to the PDF file to scan")):
    """Ingest a PDF: extract text, detect chapters, and produce a chunk manifest."""
    from pathlib import Path

    from bookbridge.ingestion.chunker import build_chunk_manifest
    from bookbridge.ingestion.pdf_reader import extract_pages

    path = Path(pdf_path)
    if not path.exists():
        console.print(f"[red]ERROR: PDF not found at {path}[/red]")
        raise typer.Exit(code=1)

    console.print(f"[bold]Scanning:[/bold] {path.name}")
    pages = extract_pages(path)
    console.print(f"  Extracted {len(pages)} pages")

    manifest = build_chunk_manifest(pages)
    console.print(f"  Detected {len(manifest.chunks)} chunks")

    import json

    output = json.dumps(manifest.to_dict(), indent=2)
    console.print(output)


@app.command()
def status():
    """Show the current project status."""
    console.print("[bold]BookBridge[/bold] v0.1.0")
    console.print("No active project. Run [bold]bookbridge scan <pdf>[/bold] to start.")


if __name__ == "__main__":
    app()
