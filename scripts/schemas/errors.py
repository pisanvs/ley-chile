"""Schema validation errors."""

from __future__ import annotations


class SchemaError(ValueError):
    """Raised when a JSON payload does not match its declared schema.

    Carries the source path (if known) and the dotted field path so a
    bad cache file is identifiable without re-parsing.
    """

    def __init__(self, message: str, *, source: str | None = None, field: str | None = None) -> None:
        loc = []
        if source:
            loc.append(source)
        if field:
            loc.append(f"@{field}")
        prefix = f"[{' '.join(loc)}] " if loc else ""
        super().__init__(f"{prefix}{message}")
        self.source = source
        self.field = field
