import os
from pathlib import Path

import pytest

psycopg = pytest.importorskip("psycopg")
pytestmark = pytest.mark.integration

DSN = os.environ.get("DATABASE_URL")
requires_db = pytest.mark.skipif(not DSN, reason="DATABASE_URL not set")


# The `conn` fixture is shared, from tests/conftest.py (added in Task 8).
# It drops and reapplies the schema per test. Do not redefine it here.


@requires_db
def test_btree_gist_extension_is_present(conn):
    row = conn.execute("SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'").fetchone()
    assert row is not None, "EXCLUDE mixes '=' (btree) with '&&' (gist); btree_gist is required"


@requires_db
def test_overlapping_versions_are_rejected(conn):
    conn.execute("INSERT INTO norma (id_norma, tipo, numero, titulo, law_dir) "
                 "VALUES (1, 'ley', '1', 'T', 'leyes/1')")
    conn.execute("INSERT INTO version (id_norma, desde, hasta, commit_sha, texto_sha256, canonical_sha256) "
                 "VALUES (1, '2000-01-01', '2009-12-31', 'a', 't', 'c')")
    with pytest.raises(psycopg.errors.ExclusionViolation):
        conn.execute("INSERT INTO version (id_norma, desde, hasta, commit_sha, texto_sha256, canonical_sha256) "
                     "VALUES (1, '2005-01-01', '2012-01-01', 'b', 't', 'c')")


@requires_db
def test_adjacent_versions_are_accepted(conn):
    conn.execute("INSERT INTO norma (id_norma, tipo, numero, titulo, law_dir) "
                 "VALUES (1, 'ley', '1', 'T', 'leyes/1')")
    conn.execute("INSERT INTO version (id_norma, desde, hasta, commit_sha, texto_sha256, canonical_sha256) "
                 "VALUES (1, '2000-01-01', '2009-12-31', 'a', 't', 'c')")
    conn.execute("INSERT INTO version (id_norma, desde, hasta, commit_sha, texto_sha256, canonical_sha256) "
                 "VALUES (1, '2010-01-01', NULL, 'b', 't', 'c')")
    assert conn.execute("SELECT count(*) FROM version").fetchone()[0] == 2


@requires_db
def test_duplicate_desde_is_rejected(conn):
    conn.execute("INSERT INTO norma (id_norma, tipo, numero, titulo, law_dir) "
                 "VALUES (1, 'ley', '1', 'T', 'leyes/1')")
    conn.execute("INSERT INTO version (id_norma, desde, hasta, commit_sha, texto_sha256, canonical_sha256) "
                 "VALUES (1, '2000-01-01', NULL, 'a', 't', 'c')")
    with pytest.raises((psycopg.errors.UniqueViolation, psycopg.errors.ExclusionViolation)):
        conn.execute("INSERT INTO version (id_norma, desde, hasta, commit_sha, texto_sha256, canonical_sha256) "
                     "VALUES (1, '2000-01-01', NULL, 'b', 't', 'c')")


@requires_db
def test_articulo_dedup_key_rejects_exact_duplicates(conn):
    conn.execute("INSERT INTO norma (id_norma, tipo, numero, titulo, law_dir) "
                 "VALUES (1, 'ley', '1', 'T', 'leyes/1')")
    ins = ("INSERT INTO articulo (id_norma, slug, label, raw_heading, body, content_sha256) "
           "VALUES (1, 'art-1', 'articulo 1', 'Artículo 1', 'B', 'sha')")
    conn.execute(ins)
    with pytest.raises(psycopg.errors.UniqueViolation):
        conn.execute(ins)


@requires_db
def test_tsvector_is_generated_and_indexed(conn):
    conn.execute("INSERT INTO norma (id_norma, tipo, numero, titulo, law_dir) "
                 "VALUES (1, 'ley', '1', 'T', 'leyes/1')")
    conn.execute("INSERT INTO articulo (id_norma, slug, label, raw_heading, body, content_sha256) "
                 "VALUES (1, 'art-1', 'articulo 1', 'Artículo 1', 'Los contratos de arrendamiento', 'sha')")
    hit = conn.execute(
        "SELECT 1 FROM articulo WHERE tsv @@ websearch_to_tsquery('spanish', 'arrendamiento')"
    ).fetchone()
    assert hit is not None


@requires_db
def test_analytics_matview_exists_and_refreshes(conn):
    conn.execute("REFRESH MATERIALIZED VIEW analytics.norma_signal")
    assert conn.execute("SELECT count(*) FROM analytics.norma_signal").fetchone()[0] == 0
