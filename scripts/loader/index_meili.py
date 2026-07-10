"""Postgres → Meilisearch. The hot tier only.

Nothing else writes to Meilisearch, so it can always be rebuilt from Postgres
without touching git. Indexing in parallel from the pipeline would create two
ingestion paths that drift, and the drift surfaces as "search returns a norma
whose page 404s".
"""
from __future__ import annotations

import re
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


# Meilisearch primary keys accept ONLY [a-zA-Z0-9_-]. A colon makes the whole
# batch fail with invalid_document_id — and add_documents() is asynchronous, so
# the client call succeeds and the hot tier silently stays empty.
_VALID_DOC_ID = re.compile(r"^[a-zA-Z0-9_-]+$")


def document_id(id_norma: int, slug: str, content_sha256: str, desde_ts: int) -> str:
    """Stable, Meilisearch-legal id for one (article, span) pair.

    `desde_ts` is part of the key. `articulo_documents` emits one document per
    (article, span), and an article whose body was changed then reverted has ONE
    articulo row with TWO disjoint spans. Keying on (id_norma, slug, sha) alone
    would collide, so the later span would overwrite the earlier one and the law
    would drop out of search for one of its two validity windows.
    """
    doc_id = f"{id_norma}_{slug}_{content_sha256[:8]}_{desde_ts}"
    if not _VALID_DOC_ID.match(doc_id):
        raise ValueError(
            f"document id {doc_id!r} is not Meilisearch-legal; ids may contain "
            f"only alphanumerics, hyphens and underscores"
        )
    return doc_id


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
            "id": document_id(id_norma, slug, sha, to_ts(desde)),
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


def sync_articulos(index, docs: list[dict], delete_id_normas: list[int]) -> list:
    """Delete demoted/stale normas' documents first, then add.

    Order matters: a promoted norma whose articles changed must not keep its old
    documents. Returns the enqueued tasks — Meilisearch writes are ASYNCHRONOUS,
    so a rejected batch (bad document id, schema error) fails the *task*, not
    this call. Pass the result to `wait_for_tasks` or the failure is invisible.
    """
    tasks = []
    if delete_id_normas:
        tasks.append(index.delete_documents_by_filter(f"id_norma IN {sorted(delete_id_normas)}"))
    if docs:
        tasks.append(index.add_documents(docs, primary_key="id"))
    return [t for t in tasks if t is not None]


def _task_uid(task) -> int | None:
    if task is None:
        return None
    uid = getattr(task, "task_uid", None)
    if uid is None and isinstance(task, dict):
        uid = task.get("taskUid") or task.get("task_uid")
    return uid


def _task_status(task) -> str | None:
    status = getattr(task, "status", None)
    if status is None and isinstance(task, dict):
        status = task.get("status")
    return status


def wait_for_tasks(client, tasks: list) -> None:
    """Block until every enqueued task settles; raise if any failed.

    Without this, an index that rejected every document (Meilisearch ids admit
    only [a-zA-Z0-9_-]) looks exactly like a successful index: the client call
    returned, the loader advanced its watermark, and search is empty.
    """
    for task in tasks:
        uid = _task_uid(task)
        if uid is None:
            continue
        done = client.wait_for_task(uid)
        status = _task_status(done)
        if status != "succeeded":
            error = getattr(done, "error", None) or (
                done.get("error") if isinstance(done, dict) else None)
            raise RuntimeError(f"Meilisearch task {uid} {status}: {error}")
