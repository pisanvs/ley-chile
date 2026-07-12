"""Usage-based indexing policy (spec §7.3).

Seed statically, promote on signal, cap at budget. v1 never demotes: exceeding
the budget refuses further promotion and logs. Eviction ships when the cap
actually binds — until then it is speculative machinery.

The signal that makes this work is `cold_surface`: Meilisearch could not find
something a user wanted and Postgres could. Without the cold path, the policy
is self-fulfilling — an unindexed phrase is never found, so its norma never
earns promotion, so the phrase stays unfindable.
"""
from __future__ import annotations

import psycopg

SEED_TIPOS = frozenset({"ley", "dl", "dfl", "cod"})
PROMOTION_THRESHOLD = 3


def apply_seed(conn: psycopg.Connection) -> int:
    """Seed tier: substantive legislation, plus any dto that modifies something."""
    result = conn.execute(
        """
        UPDATE norma SET index_tier = 'full', seeded = true
         WHERE seeded = false
           AND (tipo = ANY(%s) OR id_norma IN (SELECT causa_id FROM modificacion))
        """,
        (sorted(SEED_TIPOS),),
    )
    return result.rowcount


def refresh_signal(conn: psycopg.Connection) -> None:
    conn.execute("REFRESH MATERIALIZED VIEW analytics.norma_signal")


def estimate_tier_bytes(conn: psycopg.Connection) -> int:
    row = conn.execute(
        """
        SELECT COALESCE(SUM(octet_length(a.body)), 0)
          FROM articulo a JOIN norma n ON n.id_norma = a.id_norma
         WHERE n.index_tier = 'full'
        """
    ).fetchone()
    return int(row[0])


def compute_promotions(conn: psycopg.Connection, *, budget_bytes: int) -> list[int]:
    """Normas scoring >= threshold in the trailing 90 days, while under budget."""
    if estimate_tier_bytes(conn) >= budget_bytes:
        return []
    return [
        r[0]
        for r in conn.execute(
            """
            SELECT s.id_norma
              FROM analytics.norma_signal s
              JOIN norma n ON n.id_norma = s.id_norma
             WHERE n.index_tier = 'meta' AND s.score >= %s
             ORDER BY s.score DESC, s.id_norma
            """,
            (PROMOTION_THRESHOLD,),
        ).fetchall()
    ]


def apply_promotions(conn: psycopg.Connection, id_normas: list[int]) -> None:
    if not id_normas:
        return
    conn.execute(
        "UPDATE norma SET index_tier = 'full' WHERE id_norma = ANY(%s) AND seeded = false",
        (id_normas,),
    )


def prune_events(conn: psycopg.Connection, *, days: int = 90) -> int:
    result = conn.execute(
        "DELETE FROM analytics.event WHERE ts < now() - make_interval(days => %s)", (days,)
    )
    return result.rowcount
