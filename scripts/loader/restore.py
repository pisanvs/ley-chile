"""Out-of-band restore of the Postgres read model, resilient to a dropped link.

Why this exists: the normal path is `loader.main` running inside Railway on the
internal network. When it cannot be triggered (a cron service only fires on
schedule) the read model can only be repaired from outside, over Railway's
public TCP proxy — and that proxy resets a long-lived bulk connection
mid-statement ("could not receive data from client: Connection reset by peer"
in the Postgres log, `OperationalError: server closed the connection` in the
client). Batching alone does not fix it; the connection dies regardless.

So: reconnect and retry. Every load here is an idempotent upsert keyed by a
primary key, so replaying a batch — or a whole shard — is a no-op for rows that
already landed. That makes "retry from the start of the current shard" both
correct and cheap enough.

This is a repair tool, not part of the normal pipeline. It deliberately does no
verification, retiering or indexing: `loader.main` owns those, and running them
from a laptop over a flaky link is how you get a half-indexed search tier.
Run `python -m loader.reindex` afterwards to rebuild Meilisearch.

    DATABASE_URL=... ARTIFACTS_DIR=... PYTHONPATH=scripts python -m loader.restore
"""
from __future__ import annotations

import gzip
import os
import sys
import time
from pathlib import Path

import psycopg

from schemas.snapshot import EventRow, ModRow, NormaRow, VersionRow, from_ndjson
from spans import ArticleRow, SpanRow

from . import load

# Order matters: articulo before spans (spans resolve articulo_id by dedup key),
# and both after norma. `relaciones` is absent from snapshots exported before it
# existed, and the glob simply finds nothing.
_PHASES = [
    ("normas", NormaRow, load.load_normas),
    ("versions", VersionRow, load.load_versions),
    ("articulos", ArticleRow, load.load_articles),
    ("spans", SpanRow, load.load_spans),
    ("mods", ModRow, load.load_mods),
    ("events", EventRow, load.load_events),
]

MAX_ATTEMPTS = 8

# Phases to run, comma-separated, via RESTORE_PHASES. Defaults to the derived
# tables only.
#
# `normas` is excluded by default on purpose. Re-upserting all 333k norma rows
# is a random UPDATE across an already-populated table, so after each checkpoint
# the first touch of every page writes a full 8 KB page image to WAL — roughly
# 800 MB of WAL for 100k rows. That pins the checkpointer in a back-to-back
# "checkpoint starting: wal" loop and is what kept killing the connection
# mid-restore. When repairing the derived tables the norma rows are already
# correct, so reloading them is pure cost and pure risk.
DEFAULT_PHASES = "versions,articulos,spans,mods,events"


def _connect() -> psycopg.Connection:
    return psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=30, autocommit=True)


def _read_shard(path: Path, cls) -> list:
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return [from_ndjson(line, cls) for line in fh if line.strip()]


def _load_shard_resilient(conn, shard: Path, cls, fn):
    """Load one shard, reconnecting and replaying it if the link drops.

    Replaying the whole shard rather than resuming mid-way is deliberate: the
    upserts make it idempotent, and tracking a precise resume point across a
    connection that died mid-statement would be guesswork about which rows
    actually committed.
    """
    rows = _read_shard(shard, cls)
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            fn(conn, rows)
            return conn, len(rows)
        except (psycopg.OperationalError, psycopg.InterfaceError) as err:
            if attempt == MAX_ATTEMPTS:
                raise
            wait = min(2 ** attempt, 30)
            print(f"    link dropped ({str(err).splitlines()[0][:60]}); "
                  f"reconnect {attempt}/{MAX_ATTEMPTS} in {wait}s", flush=True)
            time.sleep(wait)
            try:
                conn.close()
            except Exception:
                pass
            conn = _connect()
    raise RuntimeError("unreachable")


def main() -> int:
    artifacts = Path(os.environ.get("ARTIFACTS_DIR", "./artifacts"))
    conn = _connect()
    print(f"restoring from {artifacts}", flush=True)

    wanted = {p.strip() for p in os.environ.get("RESTORE_PHASES", DEFAULT_PHASES).split(",") if p.strip()}
    print(f"phases: {','.join(k for k, _, _ in _PHASES if k in wanted)}", flush=True)

    for kind, cls, fn in _PHASES:
        if kind not in wanted:
            print(f"  {kind}: skipped (already correct; not in RESTORE_PHASES)", flush=True)
            continue
        shards = sorted(artifacts.glob(f"{kind}-*.ndjson.gz"))
        if not shards:
            print(f"  {kind}: no shards, skipping", flush=True)
            continue
        # Resume support: RESTORE_SKIP="articulos=8" drops the first 8 shards of
        # that kind. Re-upserting rows that already landed is not just wasted
        # time — it is a random UPDATE over a populated table, which is the
        # full-page-write WAL storm that broke the earlier attempts. Shards load
        # in sorted order, so "rows already present / 50k" gives the count.
        skip = int(dict(
            kv.split("=", 1) for kv in os.environ.get("RESTORE_SKIP", "").split(",") if "=" in kv
        ).get(kind, 0))
        if skip:
            print(f"  {kind}: skipping first {skip} shard(s), already loaded", flush=True)
            shards = shards[skip:]
        total = 0
        for i, shard in enumerate(shards, 1):
            conn, n = _load_shard_resilient(conn, shard, cls, fn)
            total += n
            print(f"  {kind}: shard {i}/{len(shards)} ok ({total:,} rows)", flush=True)
        print(f"  {kind}: DONE {total:,} rows", flush=True)

    with conn.cursor() as cur:
        for t in ("norma", "version", "articulo", "articulo_span"):
            cur.execute(f"SELECT count(*) FROM {t}")
            print(f"  final {t}: {cur.fetchone()[0]:,}", flush=True)
    conn.close()
    print("restore complete — run `python -m loader.reindex` to rebuild search", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
