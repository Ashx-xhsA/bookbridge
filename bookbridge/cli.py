"""BookBridge CLI entry point."""

import typer
from rich.console import Console

app = typer.Typer(help="BookBridge: Skill driven book translation system")
console = Console()


@app.command()
def scan(book_path: str = typer.Argument(..., help="Path to the EPUB or TXT file to scan")):
    """Ingest a book: split it into chapters and paragraphs and print a summary."""
    from pathlib import Path

    from bookbridge.ingestion.epub_reader import read_epub
    from bookbridge.ingestion.models import IngestionError
    from bookbridge.ingestion.txt_reader import read_txt

    path = Path(book_path)
    readers = {".epub": read_epub, ".txt": read_txt}
    reader = readers.get(path.suffix.lower())
    if reader is None or not path.exists():
        console.print(f"[red]ERROR: expected an existing .epub or .txt file, got {path}[/red]")
        raise typer.Exit(code=1)

    console.print(f"[bold]Scanning:[/bold] {path.name}")
    try:
        book = reader(path.read_bytes(), source_file=path.name)
    except IngestionError as exc:
        console.print(f"[red]ERROR: {exc}[/red]")
        raise typer.Exit(code=1) from exc

    for chapter in book.chapters:
        console.print(
            f"  {chapter.number:>3}. {chapter.title}  ({len(chapter.paragraphs)} paragraphs)"
        )
    console.print(f"  Detected {len(book.chapters)} chapters")


@app.command()
def status():
    """Show the current project status."""
    console.print("[bold]BookBridge[/bold] v0.1.0")
    console.print(
        "No active project. Run [bold]bookbridge scan <book.epub|book.txt>[/bold] to start."
    )


if __name__ == "__main__":
    app()
