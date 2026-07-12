import os

import pytest

from schemas.snapshot import Manifest

DSN = os.environ.get("DATABASE_URL")
requires_db = pytest.mark.skipif(not DSN, reason="DATABASE_URL not set")


def _m(version="v2", seq=5):
    return Manifest(snapshot_version=version, watermark="2026-06-01",
                    last_delta_seq=seq, shards=[])


def test_first_run_always_loads():
    from loader.main import should_load
    assert should_load(_m(), None) is True


def test_loads_when_delta_seq_advanced():
    from loader.main import should_load
    assert should_load(_m(seq=5), ("2026-06-01", "v2", 4)) is True


def test_skips_when_already_current():
    from loader.main import should_load
    assert should_load(_m(seq=5), ("2026-06-01", "v2", 5)) is False


def test_reloads_when_snapshot_version_changed():
    """A schema change republishes a full snapshot under a new version."""
    from loader.main import should_load
    assert should_load(_m(version="v3", seq=0), ("2026-06-01", "v2", 9)) is True


def test_revalidate_posts_changed_normas():
    from loader.main import revalidate
    seen = {}

    def fake_post(url, json, headers, timeout):
        seen.update(url=url, json=json, headers=headers)
        class R:
            status_code = 200
        return R()

    assert revalidate("https://x/api/revalidate", "tok", [1, 2], post=fake_post) is True
    assert seen["json"] == {"idNormas": [1, 2]}
    assert seen["headers"]["Authorization"] == "Bearer tok"


def test_revalidate_reports_failure_without_raising():
    from loader.main import revalidate

    def fake_post(url, json, headers, timeout):
        class R:
            status_code = 503
        return R()

    assert revalidate("https://x", "tok", [1], post=fake_post) is False


def test_revalidate_with_no_normas_is_a_noop():
    from loader.main import revalidate

    def explode(*a, **k):
        raise AssertionError("must not POST for an empty list")

    assert revalidate("https://x", "tok", [], post=explode) is True


def test_index_targets_unions_and_dedups():
    from loader.main import index_targets
    assert index_targets([1, 2], [2, 3]) == [1, 2, 3]
    assert index_targets([], [5]) == [5]
    assert index_targets([4], []) == [4]


@pytest.mark.integration
@requires_db
def test_index_targets_reaches_a_norma_promoted_but_not_touched(conn):
    """Reproduces the Critical bug: compute_promotions selects from the whole
    corpus, almost never a subset of the delta's `touched` normas. Indexing
    only `touched` after apply_promotions flips a norma to index_tier='full'
    silently strands it — promoted in Postgres, never pushed to Meilisearch.
    """
    from loader.index_meili import articulo_documents
    from loader.main import index_targets
    from loader.retier import apply_promotions, apply_seed, compute_promotions, refresh_signal

    # A 'res' norma: apply_seed does not promote it, so it starts (and stays,
    # absent usage signal) in the 'meta' tier — and it is NOT in this run's delta.
    conn.execute(
        "INSERT INTO norma (id_norma, tipo, numero, titulo, law_dir) "
        "VALUES (100, 'res', '100', 'T', 'res/100')"
    )
    conn.execute(
        "INSERT INTO articulo (id, id_norma, slug, label, raw_heading, body, content_sha256) "
        "VALUES (1, 100, 'art-1', 'Artículo 1', '', 'cuerpo', %s)",
        ("a" * 64,),
    )
    conn.execute(
        "INSERT INTO articulo_span (articulo_id, desde, ord) VALUES (1, '2020-01-01', 0)"
    )
    conn.execute("INSERT INTO analytics.event (kind, id_norma) VALUES ('cold_surface', 100)")

    apply_seed(conn)
    refresh_signal(conn)
    promoted = compute_promotions(conn, budget_bytes=10**12)
    assert promoted == [100]
    apply_promotions(conn, promoted)

    touched = [999]  # this run's delta never mentions norma 100
    to_index = index_targets(touched, promoted)

    touched_ids = {doc["id_norma"] for doc in articulo_documents(conn, touched)}
    union_ids = {doc["id_norma"] for doc in articulo_documents(conn, to_index)}

    assert 100 not in touched_ids
    assert 100 in union_ids
