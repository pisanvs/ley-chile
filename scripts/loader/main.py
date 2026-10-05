"""Railway cron entrypoint: load → verify → refresh search → revalidate.

Verify precedes everything after it on purpose: never publish what did not
reconstruct. A failed verify aborts before search or the web tier learn
anything about the bad data. Search is Postgres only; its derived tables
(norma_search, articulo_lexeme_freq, search_config) are rebuilt here.
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
from pathlib import Path

import requests

from schemas.snapshot import (
    EventRow, Manifest, ModRow, NormaRow, RelacionRow, VersionRow, from_ndjson,
)
from spans import ArticleRow, SpanRow

from . import load, verify
from .db import apply_schema, connect

# kind -> (row class, loader). A kind whose shards are absent from the snapshot
# is simply skipped by the glob below, which is what lets this loader ingest a
# snapshot exported before that kind existed — the case for `relaciones` until
# the next full export runs.
_KINDS = {
    "normas": (NormaRow, load.load_normas),
    "versions": (VersionRow, load.load_versions),
    "articulos": (ArticleRow, load.load_articles),
    "spans": (SpanRow, load.load_spans),
    "mods": (ModRow, load.load_mods),
    "events": (EventRow, load.load_events),
    "relaciones": (RelacionRow, load.load_relaciones),
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


def run(conn, artifacts_dir: Path, *,
        revalidate_url: str | None, revalidate_token: str = "") -> int:
    # Apply the schema before anything reads or writes it.
    #
    # This was never called: apply_schema() existed, but the schema had only
    # ever been applied by hand (`psql -f sql/001_schema.sql`), so the loader
    # silently assumed whatever shape the database already had. The first
    # migration to add a column therefore crashed the load with
    # `column "nombres_uso_comun" of relation "norma" does not exist` — the
    # loader had no way to bring the database up to the shape its own INSERTs
    # required.
    #
    # Every sql/*.sql is idempotent (CREATE ... IF NOT EXISTS, ALTER TABLE ...
    # ADD COLUMN IF NOT EXISTS), so running the full set on each start is cheap
    # and safe, and it makes a schema change deploy with the code that needs it
    # instead of requiring a manual step someone has to remember.
    apply_schema(conn)

    manifest = Manifest(**json.loads((artifacts_dir / "manifest.json").read_text()))
    # LOADER_FORCE_RELOAD re-runs a load the watermark already considers done.
    # Needed when the read model is damaged rather than stale: load_state
    # records the snapshot as loaded, so should_load() short-circuits and the
    # loader refuses to repair itself. The load is idempotent (upserts keyed by
    # primary key, replace_norma clearing derived rows first), so forcing is
    # safe; it is only wasteful.
    force = os.environ.get("LOADER_FORCE_RELOAD", "").strip().lower() in ("1", "true", "yes")
    if force:
        print("LOADER_FORCE_RELOAD set — reloading regardless of load_state")
    if not force and not should_load(manifest, load.get_load_state(conn)):
        print("up to date; nothing to do")
        return 0

    # Read EVERY normas shard, not just the first. A delta fits in one 50k
    # shard, but a full-corpus snapshot spans several (357k normas → 8 shards);
    # `next(glob())` silently loaded only the first, leaving versions that
    # reference the rest to fail against the norma FK.
    # replace_norma clears a norma's derived rows so a re-export can close a
    # previously open-ended version range without tripping the EXCLUDE
    # constraint. Gate it on `articulo` being non-empty, not `norma`: those are
    # exactly the rows it deletes, so with none present there is nothing to
    # clear and the sweep is pure cost.
    #
    # This matters more than it looks. The sweep DELETEs the derived rows for
    # every touched norma before the reload puts them back, so a run that dies
    # in between leaves the read model empty — which is precisely what happened:
    # the container was killed mid-run, after the sweep and before articulos and
    # spans reloaded, and every norma served 0 articles until the next load.
    with conn.cursor() as cur:
        cur.execute("SELECT EXISTS (SELECT 1 FROM articulo)")
        had_derived = cur.fetchone()[0]

    # Stream the normas shards instead of materialising all ~333k rows at once.
    # The full list was held for the entire run purely to compute `touched`, and
    # each NormaRow just grew five fields (three of them lists) — enough to push
    # an already-large resident set over the container's memory limit. Only the
    # ids need to outlive the loop.
    # LOADER_SKIP_NORMAS repairs the derived tables without rewriting norma.
    #
    # Re-upserting all ~333k norma rows is a random UPDATE across a populated
    # table, so after each checkpoint the first touch of every page writes a
    # full 8 KB page image to WAL — roughly 800 MB of WAL per 100k rows. That
    # pins the checkpointer in a back-to-back "checkpoint starting: wal" loop,
    # and on a volume with little headroom it is the difference between a load
    # that completes and one that dies partway, leaving the site with rows in
    # `articulo` but none in `articulo_span` and therefore no text at all.
    #
    # When norma is already correct and only the derived tables need rebuilding,
    # that write is pure cost. Ids still come from the shards, so `touched`,
    # verification and indexing are unaffected.
    skip_normas = os.environ.get("LOADER_SKIP_NORMAS", "").strip().lower() in ("1", "true", "yes")
    if skip_normas:
        print("LOADER_SKIP_NORMAS set — reading norma ids without rewriting the table")

    # LOADER_MAX_NORMAS bounds the read model to the first N normas encountered
    # (shard order, so deterministic across runs) when the volume can't hold
    # the full corpus. This is a stopgap, not a feature: it stops early rather
    # than loading everything and deleting the excess, so a disk-full volume
    # never has to hold the full corpus even transiently. Every other kind is
    # then filtered to rows referencing only the normas actually loaded, or
    # their INSERTs would violate the FK into `norma`.
    #
    # Once loaded, set SITE_ALERT (site/lib SiteAlert, read at request time —
    # no rebuild needed) on the web service so visitors know the corpus is
    # partial, e.g.:
    #   SITE_ALERT="Sirviendo un subconjunto del corpus mientras resolvemos
    #   un problema de almacenamiento." SITE_ALERT_LEVEL=warn
    max_normas_raw = os.environ.get("LOADER_MAX_NORMAS", "").strip()
    max_normas = int(max_normas_raw) if max_normas_raw else None
    if max_normas is not None:
        print(f"LOADER_MAX_NORMAS={max_normas} — partial load (disk-constrained); "
              f"remaining normas are skipped, not deleted")

    # LOADER_SEED_NORMAS names specific normas that must load regardless of
    # shard order — a bare count cap keeps whatever comes first, which
    # (shards are id_norma-ordered) skews toward old, low-id normas and would
    # silently drop e.g. a 2000s-era ley a demo specifically wants to show.
    # Two token forms, comma-separated: "tipo:numero" (e.g. "ley:20000") for a
    # law by citation, or a bare integer for a raw id_norma — the latter is
    # how a law's *modifiers* get seeded, since a modifier is only known by
    # id_norma (from the mods shard) until its own norma row is read. Seeds
    # don't count against max_normas' budget; they're additive, since there
    # are only ever a handful.
    seed_raw = os.environ.get("LOADER_SEED_NORMAS", "").strip()
    seed_keys: set[tuple[str, str]] = set()
    seed_ids: set[int] = set()
    for tok in seed_raw.split(","):
        tok = tok.strip()
        if not tok:
            continue
        if tok.isdigit():
            seed_ids.add(int(tok))
        elif ":" in tok:
            tipo, numero = tok.split(":", 1)
            seed_keys.add((tipo.strip().lower(), "".join(ch for ch in numero if ch.isdigit())))
    if seed_keys or seed_ids:
        print(f"LOADER_SEED_NORMAS set — force-including {sorted(seed_keys)} "
              f"and id_norma {sorted(seed_ids)}")

    touched: list[int] = []
    seed_found: set[tuple[str, str]] = set()
    ids_found: set[int] = set()
    for shard in sorted(artifacts_dir.glob("normas-*.ndjson.gz")):
        rows = _read_shard(shard, NormaRow)
        if max_normas is not None:
            keep = []
            for r in rows:
                key = (r.tipo, r.numero)
                if key in seed_keys and key not in seed_found:
                    seed_found.add(key)
                    keep.append(r)
                elif r.id_norma in seed_ids and r.id_norma not in ids_found:
                    ids_found.add(r.id_norma)
                    keep.append(r)
                elif len(touched) + len(keep) < max_normas:
                    keep.append(r)
            rows = keep
        if not skip_normas:
            load.load_normas(conn, rows)
        touched.extend(r.id_norma for r in rows)
        if had_derived and not skip_normas:
            for r in rows:
                load.replace_norma(conn, r.id_norma)
        del rows
        # Once the budget is full, only keep scanning if there are still
        # unmatched seeds to look for in later shards.
        if (max_normas is not None and len(touched) >= max_normas
                and seed_found == seed_keys and ids_found == seed_ids):
            break
    if seed_keys and seed_found != seed_keys:
        print(f"WARNING: seed laws not found in any shard: {sorted(seed_keys - seed_found)}")
    if seed_ids and ids_found != seed_ids:
        print(f"WARNING: seed id_normas not found in any shard: {sorted(seed_ids - ids_found)}")

    touched_set = set(touched) if max_normas is not None else None

    for kind in ("versions", "articulos", "spans", "mods", "events"):
        cls, fn = _KINDS[kind]
        for shard in sorted(artifacts_dir.glob(f"{kind}-*.ndjson.gz")):
            rows = _read_shard(shard, cls)
            if touched_set is not None:
                rows = (
                    [r for r in rows if r.causa_id in touched_set and r.target_id in touched_set]
                    if kind == "mods" else
                    [r for r in rows if r.id_norma in touched_set]
                )
            fn(conn, rows)

    # Scope verification to the normas this delta touched. verify_norma is
    # O(versions x (articles + spans)) per norma — verifying the whole corpus on
    # every incremental run would re-walk all ~408k versions to check three.
    # verify.gate(conn) over everything remains the cutover check.
    mismatches = verify.verify_normas(conn, touched)
    if mismatches:
        for m in mismatches[:20]:
            print(f"MISMATCH id_norma={m.id_norma} desde={m.desde}")
        print(f"ABORT: {len(mismatches)} versions failed to reconstruct; nothing published.")
        return 1
    if not touched:
        print("ABORT: delta touched 0 normas; nothing verified, nothing published.")
        return 1

    load.set_load_state(conn, watermark=manifest.watermark,
                        snapshot_version=manifest.snapshot_version,
                        last_delta_seq=manifest.last_delta_seq)

    load.refresh_search(conn)

    if revalidate_url:
        try:
            ok = revalidate(revalidate_url, revalidate_token, touched)
            print(f"revalidate: {'ok' if ok else 'FAILED (pages will serve stale)'}")
        except Exception as err:
            print(f"revalidate: FAILED ({err}); pages will serve stale until next touch")

    print(f"loaded {len(touched)} normas")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifacts", type=Path, required=True)
    args = ap.parse_args()
    return run(
        connect(), args.artifacts,
        revalidate_url=os.environ.get("REVALIDATE_URL"),
        revalidate_token=os.environ.get("REVALIDATE_TOKEN", ""),
    )


if __name__ == "__main__":
    raise SystemExit(main())
