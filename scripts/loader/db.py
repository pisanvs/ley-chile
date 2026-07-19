"""Postgres connection and schema application for the Railway loader."""
from __future__ import annotations

import os
from pathlib import Path

import psycopg

SQL_DIR = Path(__file__).resolve().parents[2] / "sql"
SCHEMA_PATH = SQL_DIR / "001_schema.sql"


def connect(dsn: str | None = None) -> psycopg.Connection:
    resolved = dsn or os.environ.get("DATABASE_URL")
    if not resolved:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(resolved, autocommit=True)


def apply_schema(conn: psycopg.Connection, sql_path: Path | None = None) -> None:
    """Apply every sql/*.sql in filename order.

    This used to hard-code 001_schema.sql, so a second migration file would
    never have run and the loader would have failed on the first INSERT naming
    a column that was never added.

    Every file is idempotent (CREATE ... IF NOT EXISTS, ALTER TABLE ... ADD
    COLUMN IF NOT EXISTS), which is what makes re-running the whole set on each
    loader start safe — and is how the schema has always been applied here.
    Ordering is lexical, so keep the numeric prefixes.

    Pass `sql_path` to apply exactly one file (tests do this).
    """
    for path in [sql_path] if sql_path else sorted(SQL_DIR.glob("*.sql")):
        conn.execute(path.read_text(encoding="utf-8"))
