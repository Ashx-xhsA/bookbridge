"""Project level configuration for BookBridge."""

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class BookBridgeConfig:
    """Global configuration for a BookBridge project."""

    project_dir: Path = field(default_factory=lambda: Path.cwd())
    max_pages_per_chunk: int = 20
    noise_threshold: float = 0.6
    target_languages: list[str] = field(default_factory=lambda: ["zh-Hans"])
