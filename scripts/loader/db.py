"""Postgres connection and schema application for the Railway loader."""
from __future__ import annotations

import os
from pathlib import Path

import psycopg

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "sql" / "001_schema.sql"


def connect(dsn: str | None = None) -> psycopg.Connection:
    resolved = dsn or os.environ.get("DATABASE_URL")
    if not resolved:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(resolved, autocommit=True)


def apply_schema(conn: psycopg.Connection, sql_path: Path = SCHEMA_PATH) -> None:
    conn.execute(sql_path.read_text(encoding="utf-8"))
