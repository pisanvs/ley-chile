"""Idempotent upserts from snapshot rows into Postgres.

Everything is keyed so a re-applied delta is a no-op. `index_tier` and `seeded`
are deliberately excluded from the norma upsert: they are loader-owned retier
state, not artifact-owned, and a reload must not reset them.
"""
from __future__ import annotations

from typing import Iterable

import psycopg

from schemas.snapshot import EventRow, ModRow, NormaRow, VersionRow
from spans import ArticleRow, SpanRow


def load_normas(conn: psycopg.Connection, rows: Iterable[NormaRow]) -> int:
    rows = list(rows)
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO norma (id_norma, tipo, numero, titulo, organismo,
                               clasificacion, derogado, fecha_publicacion, law_dir)
            VALUES (%(id_norma)s, %(tipo)s, %(numero)s, %(titulo)s, %(organismo)s,
                    %(clasificacion)s, %(derogado)s, %(fecha_publicacion)s, %(law_dir)s)
            ON CONFLICT (id_norma) DO UPDATE SET
                tipo = EXCLUDED.tipo, numero = EXCLUDED.numero, titulo = EXCLUDED.titulo,
                organismo = EXCLUDED.organismo, clasificacion = EXCLUDED.clasificacion,
                derogado = EXCLUDED.derogado, fecha_publicacion = EXCLUDED.fecha_publicacion,
                law_dir = EXCLUDED.law_dir
            """,
            [r.__dict__ for r in rows],
        )
    return len(rows)


def load_versions(conn: psycopg.Connection, rows: Iterable[VersionRow]) -> int:
    rows = list(rows)
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO version (id_norma, desde, hasta, commit_sha, causa_id,
                                 subject, magnitude, texto_sha256, canonical_sha256)
            VALUES (%(id_norma)s, %(desde)s, %(hasta)s, %(commit_sha)s, %(causa_id)s,
                    %(subject)s, %(magnitude)s, %(texto_sha256)s, %(canonical_sha256)s)
            ON CONFLICT (id_norma, desde) DO UPDATE SET
                hasta = EXCLUDED.hasta, commit_sha = EXCLUDED.commit_sha,
                causa_id = EXCLUDED.causa_id, subject = EXCLUDED.subject,
                magnitude = EXCLUDED.magnitude, texto_sha256 = EXCLUDED.texto_sha256,
                canonical_sha256 = EXCLUDED.canonical_sha256
            """,
            [r.__dict__ for r in rows],
        )
    return len(rows)


def load_articles(conn: psycopg.Connection, rows: Iterable[ArticleRow]) -> int:
    rows = list(rows)
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO articulo (id_norma, slug, label, raw_heading, body, content_sha256)
            VALUES (%(id_norma)s, %(slug)s, %(label)s, %(raw_heading)s, %(body)s, %(content_sha256)s)
            ON CONFLICT (id_norma, slug, content_sha256) DO UPDATE SET
                label = EXCLUDED.label, raw_heading = EXCLUDED.raw_heading
            """,
            [r.__dict__ for r in rows],
        )
    return len(rows)


def load_spans(conn: psycopg.Connection, rows: Iterable[SpanRow]) -> int:
    """Resolve articulo_id from the dedup key, then upsert the span."""
    rows = list(rows)
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO articulo_span (articulo_id, desde, hasta, ord)
            SELECT a.id, %(desde)s, %(hasta)s, %(ord)s
              FROM articulo a
             WHERE a.id_norma = %(id_norma)s
               AND a.slug = %(slug)s
               AND a.content_sha256 = %(content_sha256)s
            ON CONFLICT (articulo_id, desde, ord) DO UPDATE SET hasta = EXCLUDED.hasta
            """,
            [r.__dict__ for r in rows],
        )
    return len(rows)


def load_mods(conn: psycopg.Connection, rows: Iterable[ModRow]) -> int:
    rows = list(rows)
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO modificacion (causa_id, target_id, fecha, commit_sha)
            VALUES (%(causa_id)s, %(target_id)s, %(fecha)s, %(commit_sha)s)
            ON CONFLICT (causa_id, target_id, fecha) DO UPDATE SET commit_sha = EXCLUDED.commit_sha
            """,
            [r.__dict__ for r in rows],
        )
    return len(rows)


def load_events(conn: psycopg.Connection, rows: Iterable[EventRow]) -> int:
    rows = list(rows)
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO publication_event
                (id_norma, commit_sha, fecha, causa_id, subject, magnitude)
            VALUES (%(id_norma)s, %(commit_sha)s, %(fecha)s, %(causa_id)s,
                    %(subject)s, %(magnitude)s)
            ON CONFLICT (id_norma, commit_sha) DO UPDATE SET
                fecha = EXCLUDED.fecha, causa_id = EXCLUDED.causa_id,
                subject = EXCLUDED.subject, magnitude = EXCLUDED.magnitude
            """,
            [r.__dict__ for r in rows],
        )
    return len(rows)


def replace_norma(conn: psycopg.Connection, id_norma: int) -> None:
    """Drop a norma's derived rows so a delta can rewrite them.

    Required because a re-exported norma may close a previously open-ended
    version range, which the EXCLUDE constraint would otherwise reject.
    The norma row itself survives, preserving index_tier and seeded.
    """
    conn.execute("DELETE FROM version WHERE id_norma = %s", (id_norma,))
    conn.execute("DELETE FROM publication_event WHERE id_norma = %s", (id_norma,))
    conn.execute("DELETE FROM articulo WHERE id_norma = %s", (id_norma,))  # cascades to spans


def set_load_state(
    conn: psycopg.Connection, *, watermark: str, snapshot_version: str, last_delta_seq: int
) -> None:
    conn.execute(
        """
        INSERT INTO load_state (id, watermark, snapshot_version, last_delta_seq)
        VALUES (true, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            watermark = EXCLUDED.watermark,
            snapshot_version = EXCLUDED.snapshot_version,
            last_delta_seq = EXCLUDED.last_delta_seq
        """,
        (watermark, snapshot_version, last_delta_seq),
    )


def get_load_state(conn: psycopg.Connection) -> tuple[str, str, int] | None:
    row = conn.execute(
        "SELECT watermark, snapshot_version, last_delta_seq FROM load_state WHERE id"
    ).fetchone()
    return (row[0].isoformat(), row[1], row[2]) if row else None
