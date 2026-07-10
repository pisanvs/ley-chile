import os

import pytest

pytest.importorskip("psycopg")
pytestmark = pytest.mark.integration

from schemas.snapshot import ModRow, NormaRow, VersionRow          # noqa: E402
from spans import ArticleRow, SpanRow                              # noqa: E402

DSN = os.environ.get("DATABASE_URL")
requires_db = pytest.mark.skipif(not DSN, reason="DATABASE_URL not set")


# The `conn` fixture is shared, from tests/conftest.py (added in Task 8).
# It drops and reapplies the schema per test. Do not redefine it here.


NORMA = NormaRow(id_norma=42, tipo="ley", numero="42", titulo="LEY CUARENTA Y DOS",
                 organismo="MIN", clasificacion="sustantiva", derogado=False,
                 fecha_publicacion="1943-05-10", law_dir="leyes/42")
VERSION = VersionRow(id_norma=42, desde="1943-05-10", hasta=None, commit_sha="aaa",
                     causa_id=42, subject="s", magnitude=1,
                     texto_sha256="t1", canonical_sha256="c1")
ARTICLE = ArticleRow(id_norma=42, slug="art-1", label="articulo 1",
                     raw_heading="Artículo 1º", body="Uno.", content_sha256="sha1")
SPAN = SpanRow(id_norma=42, slug="art-1", content_sha256="sha1",
               desde="1943-05-10", hasta=None, ord=0)
MOD = ModRow(causa_id=99, target_id=42, fecha="2011-02-21", commit_sha="bbb")


def _load_all(conn):
    from loader import load
    load.load_normas(conn, [NORMA])
    load.load_versions(conn, [VERSION])
    load.load_articles(conn, [ARTICLE])
    load.load_spans(conn, [SPAN])
    load.load_mods(conn, [MOD])


@requires_db
def test_load_is_idempotent(conn):
    _load_all(conn)
    _load_all(conn)   # same delta applied twice
    counts = {
        t: conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
        for t in ("norma", "version", "articulo", "articulo_span", "modificacion")
    }
    assert counts == {"norma": 1, "version": 1, "articulo": 1,
                      "articulo_span": 1, "modificacion": 1}


@requires_db
def test_spans_resolve_their_articulo_id(conn):
    _load_all(conn)
    row = conn.execute(
        "SELECT a.slug, s.ord FROM articulo_span s JOIN articulo a ON a.id = s.articulo_id"
    ).fetchone()
    assert row == ("art-1", 0)


@requires_db
def test_load_normas_updates_changed_metadata(conn):
    from loader import load
    load.load_normas(conn, [NORMA])
    load.load_normas(conn, [NormaRow(**{**NORMA.__dict__, "titulo": "NUEVO TÍTULO"})])
    assert conn.execute("SELECT titulo FROM norma").fetchone()[0] == "NUEVO TÍTULO"


@requires_db
def test_load_normas_preserves_index_tier_across_reloads(conn):
    """Retier state is loader-owned, not artifact-owned. A reload must not reset it."""
    from loader import load
    load.load_normas(conn, [NORMA])
    conn.execute("UPDATE norma SET index_tier = 'full', seeded = true WHERE id_norma = 42")
    load.load_normas(conn, [NORMA])
    assert conn.execute("SELECT index_tier, seeded FROM norma").fetchone() == ("full", True)


@requires_db
def test_replace_norma_clears_derived_rows_only(conn):
    from loader import load
    _load_all(conn)
    load.replace_norma(conn, 42)
    assert conn.execute("SELECT count(*) FROM version").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM articulo").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM norma").fetchone()[0] == 1


@requires_db
def test_replace_then_reload_lets_a_version_range_change(conn):
    """The EXCLUDE constraint would reject an overlapping rewrite without replace."""
    from loader import load
    _load_all(conn)
    load.replace_norma(conn, 42)
    load.load_versions(conn, [
        VersionRow(**{**VERSION.__dict__, "hasta": "2010-12-31"}),
        VersionRow(id_norma=42, desde="2011-01-01", hasta=None, commit_sha="bbb",
                   causa_id=99, subject="s2", magnitude=2,
                   texto_sha256="t2", canonical_sha256="c2"),
    ])
    assert conn.execute("SELECT count(*) FROM version").fetchone()[0] == 2


@requires_db
def test_load_state_round_trip(conn):
    from loader import load
    assert load.get_load_state(conn) is None
    load.set_load_state(conn, watermark="2026-05-29", snapshot_version="v1", last_delta_seq=3)
    load.set_load_state(conn, watermark="2026-06-01", snapshot_version="v1", last_delta_seq=4)
    assert load.get_load_state(conn) == ("2026-06-01", "v1", 4)
