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
    # Order sets ranking priority. `nombres_uso_comun` sits directly after
    # `titulo` because it is how people actually refer to a norma ("ley de
    # partidos", "Código de Comercio") — indexing only the formal título meant
    # the most natural query for a law matched nothing at all. `materias` is
    # last: BCN subject tags are useful signal but broad enough to over-match if
    # they outrank the article text.
    "searchableAttributes": ["titulo", "nombres_uso_comun", "label", "body", "materias"],
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


def document_id(id_norma: int, slug: str, content_sha256: str,
                desde_ts: int, ord_: int) -> str:
    """Stable, Meilisearch-legal id for one (article, span) pair.

    The key must mirror `articulo_span`'s primary key, `(articulo_id, desde,
    ord)`, because `articulo_documents` emits one document per (article, span):

      - `desde_ts`: an article changed then reverted has ONE articulo row with
        TWO disjoint spans. Without it they collide and the later span
        overwrites the earlier, dropping the law out of search for one window.
      - `ord_`: the schema deliberately admits two spans of one article sharing
        a `desde` — the same body at two positions within one version. Without
        it those two collide too.
    """
    doc_id = f"{id_norma}_{slug}_{content_sha256[:8]}_{desde_ts}_{ord_}"
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
       n.fecha_publicacion, n.nombres_uso_comun, n.materias,
       a.slug, a.label, a.body, a.content_sha256,
       s.desde, s.hasta, s.ord
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
            "id": document_id(id_norma, slug, sha, to_ts(desde), ord_),
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
            "nombres_uso_comun": nombres or [],
            "materias": materias or [],
        }
        for (id_norma, tipo, numero, titulo, organismo, derogado, fecha_pub,
             nombres, materias,
             slug, label, body, sha, desde, hasta, ord_) in rows
    ]


def norma_documents(
    conn: psycopg.Connection, id_normas: list[int] | None = None
) -> list[dict]:
    """Every norma, regardless of tier: no norma is ever unfindable by name or number."""
    sql = ("SELECT id_norma, tipo, numero, titulo, organismo, fecha_publicacion, derogado, "
           "nombres_uso_comun, materias "
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
            "nombres_uso_comun": nombres or [], "materias": materias or [],
        }
        for (id_norma, tipo, numero, titulo, organismo, fp, derogado,
             nombres, materias) in conn.execute(sql, params)
    ]


# A full-tier reindex is ~218k article documents. A single add_documents of the
# whole set is one oversized HTTP request Meilisearch stalls on; likewise a
# delete filter naming tens of thousands of id_normas. Chunk both.
ADD_BATCH = 10_000
DELETE_ID_BATCH = 1_000


def _chunks(seq: list, n: int):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def sync_articulos(index, docs: list[dict], delete_id_normas: list[int]) -> list:
    """Delete demoted/stale normas' documents first, then add, both in batches.

    Order matters: a promoted norma whose articles changed must not keep its old
    documents. Returns the enqueued tasks — Meilisearch writes are ASYNCHRONOUS,
    so a rejected batch (bad document id, schema error) fails the *task*, not
    this call. Pass the result to `wait_for_tasks` or the failure is invisible.
    """
    tasks = []
    for chunk in _chunks(sorted(delete_id_normas), DELETE_ID_BATCH):
        # The client exposes delete_documents(filter=...). There is no
        # delete_documents_by_filter — calling it raises AttributeError.
        tasks.append(index.delete_documents(filter=f"id_norma IN {chunk}"))
    if docs:
        # add_documents_in_batches splits the full tier into many tasks that
        # index incrementally, instead of one request Meilisearch chokes on.
        tasks += index.add_documents_in_batches(docs, batch_size=ADD_BATCH, primary_key="id")
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


# The client's wait_for_task default is 5_000 ms. A bulk add_documents over the
# full-tier article bodies routinely takes longer, and a timeout there would
# fail a healthy run. Wait generously; a genuinely stuck task still surfaces.
TASK_TIMEOUT_MS = 10 * 60 * 1000


def wait_for_tasks(client, tasks: list, *, timeout_ms: int = TASK_TIMEOUT_MS) -> None:
    """Block until every enqueued task settles; raise unless it succeeded.

    Without this, an index that rejected every document (Meilisearch ids admit
    only [a-zA-Z0-9_-]) looks exactly like a successful index: the client call
    returned, the loader advanced its watermark, and search is empty.

    Raises on `failed` AND `canceled` — anything that is not `succeeded`.
    """
    for task in tasks:
        uid = _task_uid(task)
        if uid is None:
            # A task we cannot identify is a task we cannot confirm succeeded.
            # Skipping it silently is the exact fail-open shape this guard exists
            # to prevent, so treat an unextractable uid as a failure.
            raise RuntimeError(f"Meilisearch task has no extractable uid: {task!r}")
        done = client.wait_for_task(uid, timeout_in_ms=timeout_ms)
        status = _task_status(done)
        if status != "succeeded":
            error = getattr(done, "error", None) or (
                done.get("error") if isinstance(done, dict) else None)
            raise RuntimeError(f"Meilisearch task {uid} {status}: {error}")
