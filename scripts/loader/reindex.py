"""Rebuild the Meilisearch hot tier from an already-loaded, already-verified
Postgres — no reload, no re-verify.

For when the data is present and the validation gate has passed, but indexing
needs to run (or re-run) on its own: e.g. a full-corpus index that must batch to
avoid the single oversized add_documents request that stalls Meilisearch. Reads
the existing index_tier='full' set (the seed the loader already applied) and
indexes it via the batched sync_articulos.
"""
from __future__ import annotations

import os

import meilisearch

from . import index_meili
from .db import connect


def main() -> int:
    conn = connect()
    client = meilisearch.Client(os.environ["MEILI_URL"], os.environ.get("MEILI_MASTER_KEY"))

    to_index = [
        r[0] for r in conn.execute(
            "SELECT id_norma FROM norma WHERE index_tier = 'full' ORDER BY id_norma"
        )
    ]
    print(f"full-tier normas: {len(to_index)}", flush=True)

    art_index = client.index("articulos")
    tasks = [art_index.update_settings(index_meili.SETTINGS)]

    docs = index_meili.articulo_documents(conn, to_index)
    print(f"article documents: {len(docs)} → indexing in batches", flush=True)
    tasks += index_meili.sync_articulos(art_index, docs, [])   # fresh: no deletes

    ndocs = index_meili.norma_documents(conn, to_index)
    print(f"norma documents: {len(ndocs)}", flush=True)
    tasks += client.index("normas").add_documents_in_batches(ndocs, batch_size=10_000, primary_key="id")

    print(f"{len(tasks)} tasks enqueued; waiting for Meilisearch…", flush=True)
    index_meili.wait_for_tasks(client, tasks)
    print("index complete", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
