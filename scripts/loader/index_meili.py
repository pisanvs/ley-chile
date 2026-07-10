"""Postgres → Meilisearch. The hot tier only.

Nothing else writes to Meilisearch, so it can always be rebuilt from Postgres
without touching git. Indexing in parallel from the pipeline would create two
ingestion paths that drift, and the drift surfaces as "search returns a norma
whose page 404s".
"""
from __future__ import annotations

from datetime import date, datetime, timezone

import psycopg

OPEN_ENDED_TS = 253402300799  # year 9999; matches Meilisearch's numeric range filters

# Lower sorts first. A `ley` outranks a `res` at equal textual relevance.
_TIPO_RANK = {"ley": 0, "dl": 1, "dfl": 2, "cod": 3, "dto": 4}
_DEFAULT_RANK = 5

SETTINGS: dict = {
    # Order sets ranking priority.
    "searchableAttributes": ["titulo", "label", "body"],
    "filterableAttributes": [
        "id_norma", "tipo", "organismo", "anio_pub", "derogado", "desde_ts", "hasta_ts",
    ],
    "sortableAttributes": ["desde_ts", "anio_pub"],
    "rankingRules": [
        "words", "typo", "proximity", "attribute", "sort", "exactness", "rank_tipo:asc",
    ],
    # NOTE: distinctAttribute is deliberately absent. Index-level distinct applies
    # to every query and would silently break "show me all matching artículos
    # inside this law". Pass distinct: "id_norma" as a per-search parameter.
}


def rank_tipo(tipo: str) -> int:
    return _TIPO_RANK.get(tipo, _DEFAULT_RANK)


def to_ts(d: date | None) -> int:
    if d is None:
        return OPEN_ENDED_TS
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp())


_ARTICULO_SQL = """
SELECT n.id_norma, n.tipo, n.numero, n.titulo, n.organismo, n.derogado,
       n.fecha_publicacion, a.slug, a.label, a.body, a.content_sha256,
       s.desde, s.hasta
  FROM articulo a
  JOIN norma n ON n.id_norma = a.id_norma
  JOIN articulo_span s ON s.articulo_id = a.id
 WHERE n.index_tier = 'full'
   {norma_filter}
"""


def articulo_documents(
    conn: psycopg.Connection, id_normas: list[int] | None = None
) -> list[dict]:
    clause, params = "", ()
    if id_normas:
        clause, params = "AND n.id_norma = ANY(%s)", (id_normas,)
    rows = conn.execute(_ARTICULO_SQL.format(norma_filter=clause), params).fetchall()
    return [
        {
            "id": f"{id_norma}:{slug}:{sha[:8]}",
            "id_norma": id_norma,
            "tipo": tipo,
            "numero": numero,
            "titulo": titulo,
            "organismo": organismo,
            "derogado": derogado,
            "anio_pub": fecha_pub.year if fecha_pub else 0,
            "slug": slug,
            "label": label,
            "body": body,
            "desde_ts": to_ts(desde),
            "hasta_ts": to_ts(hasta),
            "rank_tipo": rank_tipo(tipo),
        }
        for (id_norma, tipo, numero, titulo, organismo, derogado, fecha_pub,
             slug, label, body, sha, desde, hasta) in rows
    ]


def norma_documents(
    conn: psycopg.Connection, id_normas: list[int] | None = None
) -> list[dict]:
    """Every norma, regardless of tier: no norma is ever unfindable by name or number."""
    sql = ("SELECT id_norma, tipo, numero, titulo, organismo, fecha_publicacion, derogado "
           "FROM norma")
    params = ()
    if id_normas:
        sql += " WHERE id_norma = ANY(%s)"
        params = (id_normas,)
    return [
        {
            "id": id_norma, "tipo": tipo, "numero": numero, "titulo": titulo,
            "organismo": organismo, "anio_pub": fp.year if fp else 0,
            "derogado": derogado, "rank_tipo": rank_tipo(tipo),
        }
        for id_norma, tipo, numero, titulo, organismo, fp, derogado in conn.execute(sql, params)
    ]


def sync_articulos(index, docs: list[dict], delete_id_normas: list[int]) -> None:
    """Delete demoted/stale normas' documents first, then add. Order matters: a
    promoted norma whose articles changed must not keep its old documents."""
    if delete_id_normas:
        index.delete_documents_by_filter(f"id_norma IN {sorted(delete_id_normas)}")
    if docs:
        index.add_documents(docs, primary_key="id")
