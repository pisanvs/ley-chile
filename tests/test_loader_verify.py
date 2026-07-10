import os

import pytest

pytest.importorskip("psycopg")
pytestmark = pytest.mark.integration

from schemas.snapshot import NormaRow, VersionRow    # noqa: E402
from segment import canonical_text, segment, sha256_text  # noqa: E402
from spans import VersionInput, build_articles_and_spans  # noqa: E402

DSN = os.environ.get("DATABASE_URL")
requires_db = pytest.mark.skipif(not DSN, reason="DATABASE_URL not set")

V1 = "#### Artículo 1º\nUno.\n\n#### Artículo 2°\nDos."
V2 = "#### Artículo 1º\nUno.\n\n#### Artículo 2°\nDos MODIFICADO."


# The `conn` fixture is shared, from tests/conftest.py (added in Task 8).
# It drops and reapplies the schema per test. Do not redefine it here.


def _seed(conn, textos: dict[str, str]):
    """textos maps desde -> texto. Loads a fully consistent norma 42."""
    from loader import load
    load.load_normas(conn, [NormaRow(
        id_norma=42, tipo="ley", numero="42", titulo="T", organismo="M",
        clasificacion="sustantiva", derogado=False,
        fecha_publicacion="2000-01-01", law_dir="leyes/42")])

    desdes = sorted(textos)
    inputs, versions = [], []
    for i, d in enumerate(desdes):
        hasta = None if i + 1 == len(desdes) else "2009-12-31"
        inputs.append(VersionInput(desde=d, hasta=hasta, texto=textos[d]))
        versions.append(VersionRow(
            id_norma=42, desde=d, hasta=hasta, commit_sha=f"sha{i}", causa_id=None,
            subject="s", magnitude=0,
            texto_sha256=sha256_text(textos[d]),
            canonical_sha256=sha256_text(canonical_text(segment(textos[d]))),
        ))
    arts, spans = build_articles_and_spans(42, inputs)
    load.load_versions(conn, versions)
    load.load_articles(conn, arts)
    load.load_spans(conn, spans)


@requires_db
def test_consistent_load_verifies_clean(conn):
    from loader.verify import verify_all
    _seed(conn, {"2000-01-01": V1, "2010-01-01": V2})
    assert verify_all(conn) == []


@requires_db
def test_single_version_norma_verifies(conn):
    from loader.verify import verify_norma
    _seed(conn, {"2000-01-01": V1})
    assert verify_norma(conn, 42) == []


@requires_db
def test_a_dropped_article_is_caught(conn):
    from loader.verify import verify_all
    _seed(conn, {"2000-01-01": V1})
    conn.execute("DELETE FROM articulo WHERE slug = 'art-2'")
    mismatches = verify_all(conn)
    assert len(mismatches) == 1
    assert mismatches[0].id_norma == 42


@requires_db
def test_a_corrupted_body_is_caught(conn):
    from loader.verify import verify_all
    _seed(conn, {"2000-01-01": V1})
    conn.execute("UPDATE articulo SET body = 'CORRUPTO' WHERE slug = 'art-1'")
    assert len(verify_all(conn)) == 1


@requires_db
def test_a_reordered_article_is_caught(conn):
    from loader.verify import verify_all
    _seed(conn, {"2000-01-01": V1})
    conn.execute("UPDATE articulo_span SET ord = 10 - ord")
    assert len(verify_all(conn)) == 1


@requires_db
def test_whitespace_in_the_source_does_not_trip_the_gate(conn):
    """canonical_text is whitespace-insensitive by design; that is the point."""
    from loader.verify import verify_all
    _seed(conn, {"2000-01-01": "#### Artículo 1º\n\n\n   Uno.   \n\n"})
    assert verify_all(conn) == []
