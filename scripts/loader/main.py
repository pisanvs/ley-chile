"""Railway cron entrypoint: load → verify → index → retier → revalidate.

Verify precedes index on purpose: never publish to search what did not
reconstruct. A failed verify aborts before Meilisearch or the web tier learn
anything about the bad data.
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
from pathlib import Path

import requests

from schemas.snapshot import EventRow, Manifest, ModRow, NormaRow, VersionRow, from_ndjson
from spans import ArticleRow, SpanRow

from . import index_meili, load, retier, verify
from .db import connect

_KINDS = {
    "normas": (NormaRow, load.load_normas),
    "versions": (VersionRow, load.load_versions),
    "articulos": (ArticleRow, load.load_articles),
    "spans": (SpanRow, load.load_spans),
    "mods": (ModRow, load.load_mods),
    "events": (EventRow, load.load_events),
}


def should_load(published: Manifest, current: tuple[str, str, int] | None) -> bool:
    if current is None:
        return True
    _watermark, snapshot_version, last_delta_seq = current
    if published.snapshot_version != snapshot_version:
        return True   # schema change republished a full snapshot
    return published.last_delta_seq > last_delta_seq


def revalidate(url: str, token: str, id_normas: list[int], *, post=requests.post) -> bool:
    if not id_normas:
        return True
    resp = post(url, json={"idNormas": id_normas},
                headers={"Authorization": f"Bearer {token}"}, timeout=30)
    return 200 <= resp.status_code < 300


def _read_shard(path: Path, cls):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return [from_ndjson(line, cls) for line in fh if line.strip()]


def run(conn, client, artifacts_dir: Path, *, budget_bytes: int,
        revalidate_url: str | None, revalidate_token: str = "") -> int:
    manifest = Manifest(**json.loads((artifacts_dir / "manifest.json").read_text()))
    if not should_load(manifest, load.get_load_state(conn)):
        print("up to date; nothing to do")
        return 0

    normas = _read_shard(next(artifacts_dir.glob("normas-*.ndjson.gz")), NormaRow)
    touched = [n.id_norma for n in normas]

    # Clear derived rows first: a re-exported norma may close a previously
    # open-ended version range, which the EXCLUDE constraint would reject.
    load.load_normas(conn, normas)
    for id_norma in touched:
        load.replace_norma(conn, id_norma)

    for kind in ("versions", "articulos", "spans", "mods", "events"):
        cls, fn = _KINDS[kind]
        for shard in sorted(artifacts_dir.glob(f"{kind}-*.ndjson.gz")):
            fn(conn, _read_shard(shard, cls))

    # Scope verification to the normas this delta touched. verify_norma is
    # O(versions x (articles + spans)) per norma — verifying the whole corpus on
    # every incremental run would re-walk all ~408k versions to check three.
    # verify.gate(conn) over everything remains the cutover check.
    mismatches = verify.verify_normas(conn, touched)
    if mismatches:
        for m in mismatches[:20]:
            print(f"MISMATCH id_norma={m.id_norma} desde={m.desde}")
        print(f"ABORT: {len(mismatches)} versions failed to reconstruct; nothing indexed.")
        return 1
    if not touched:
        print("ABORT: delta touched 0 normas; nothing verified, nothing indexed.")
        return 1

    retier.apply_seed(conn)
    retier.refresh_signal(conn)
    promoted = retier.compute_promotions(conn, budget_bytes=budget_bytes)
    if not promoted and retier.estimate_tier_bytes(conn) >= budget_bytes:
        print(f"INDEX_BUDGET_BYTES={budget_bytes} reached; promotion refused this run")
    retier.apply_promotions(conn, promoted)
    retier.prune_events(conn)

    art_index = client.index("articulos")
    art_index.update_settings(index_meili.SETTINGS)
    tasks = index_meili.sync_articulos(
        art_index, index_meili.articulo_documents(conn, touched), touched
    )
    tasks.append(client.index("normas").add_documents(
        index_meili.norma_documents(conn, touched), primary_key="id"
    ))
    # Meilisearch writes are async. Without this, a batch rejected for bad
    # document ids leaves search empty while the loader reports success.
    index_meili.wait_for_tasks(client, tasks)

    load.set_load_state(conn, watermark=manifest.watermark,
                        snapshot_version=manifest.snapshot_version,
                        last_delta_seq=manifest.last_delta_seq)

    if revalidate_url:
        ok = revalidate(revalidate_url, revalidate_token, touched)
        print(f"revalidate: {'ok' if ok else 'FAILED (pages will serve stale)'}")

    print(f"loaded {len(normas)} normas, promoted {len(promoted)}")
    return 0


def main() -> int:
    import meilisearch

    ap = argparse.ArgumentParser()
    ap.add_argument("--artifacts", type=Path, required=True)
    ap.add_argument("--budget-bytes", type=int,
                    default=int(os.environ.get("INDEX_BUDGET_BYTES", 4 * 1024**3)))
    args = ap.parse_args()

    client = meilisearch.Client(
        os.environ["MEILI_URL"], os.environ.get("MEILI_MASTER_KEY")
    )
    return run(
        connect(), client, args.artifacts,
        budget_bytes=args.budget_bytes,
        revalidate_url=os.environ.get("REVALIDATE_URL"),
        revalidate_token=os.environ.get("REVALIDATE_TOKEN", ""),
    )


if __name__ == "__main__":
    raise SystemExit(main())
