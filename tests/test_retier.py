import os

import pytest

pytest.importorskip("psycopg")
pytestmark = pytest.mark.integration

DSN = os.environ.get("DATABASE_URL")
requires_db = pytest.mark.skipif(not DSN, reason="DATABASE_URL not set")


# Pytest fixture override: this `conn` requests the shared `conn` from
# tests/conftest.py (Task 8) and layers a small corpus on top. Test bodies
# below take `conn` and get the seeded connection.
@pytest.fixture()
def conn(conn):  # noqa: F811 — intentional pytest fixture override
    for i, tipo in [(1, "ley"), (2, "res"), (3, "dto"), (4, "dto"), (5, "cod")]:
        conn.execute("INSERT INTO norma (id_norma, tipo, numero, titulo, law_dir) "
                     "VALUES (%s, %s, %s, 'T', %s)", (i, tipo, str(i), f"{tipo}/{i}"))
    conn.execute("INSERT INTO modificacion (causa_id, target_id, fecha) VALUES (3, 1, '2001-01-01')")
    return conn


@requires_db
def test_seed_promotes_leyes_and_codigos_but_not_resoluciones(conn):
    from loader.retier import apply_seed
    apply_seed(conn)
    tiers = dict(conn.execute("SELECT id_norma, index_tier FROM norma").fetchall())
    assert tiers[1] == "full" and tiers[5] == "full"   # ley, cod
    assert tiers[2] == "meta"                          # res
    assert tiers[4] == "meta"                          # inert dto


@requires_db
def test_seed_promotes_a_dto_that_appears_as_a_modifier(conn):
    from loader.retier import apply_seed
    apply_seed(conn)
    assert conn.execute("SELECT index_tier, seeded FROM norma WHERE id_norma = 3").fetchone() \
        == ("full", True)


@requires_db
def test_promotion_requires_the_threshold(conn):
    from loader.retier import compute_promotions, refresh_signal
    # one click on norma 2 = score 1; one cold_surface on norma 4 = score 3
    conn.execute("INSERT INTO analytics.event (kind, id_norma) VALUES ('result_click', 2)")
    conn.execute("INSERT INTO analytics.event (kind, id_norma) VALUES ('cold_surface', 4)")
    refresh_signal(conn)
    assert compute_promotions(conn, budget_bytes=10**12) == [4]


@requires_db
def test_events_outside_the_90_day_window_do_not_promote(conn):
    from loader.retier import compute_promotions, refresh_signal
    conn.execute("INSERT INTO analytics.event (ts, kind, id_norma) "
                 "VALUES (now() - interval '91 days', 'cold_surface', 2)")
    refresh_signal(conn)
    assert compute_promotions(conn, budget_bytes=10**12) == []


@requires_db
def test_budget_refuses_promotion_rather_than_evicting(conn):
    from loader.retier import apply_seed, compute_promotions, refresh_signal
    apply_seed(conn)
    conn.execute("INSERT INTO analytics.event (kind, id_norma) VALUES ('cold_surface', 2)")
    refresh_signal(conn)
    assert compute_promotions(conn, budget_bytes=0) == []
    # v1 never demotes: the seeded normas keep their tier
    assert conn.execute("SELECT count(*) FROM norma WHERE index_tier = 'full'").fetchone()[0] == 3


@requires_db
def test_budget_gate_bites_on_real_full_tier_usage(conn):
    """The gate must react to actual bytes, not pass trivially on an empty tier.

    Give a seeded ('full') norma a 2000-byte article body so estimate_tier_bytes
    is genuinely nonzero, then a 'meta' norma a promotion-worthy signal. A budget
    below current usage refuses; a budget above it promotes the candidate. If the
    byte-sum query summed the wrong column or ignored index_tier, one of these
    two assertions would fail.
    """
    from loader.retier import (apply_seed, compute_promotions,
                               estimate_tier_bytes, refresh_signal)
    apply_seed(conn)  # norma 1 (ley) and 5 (cod) -> 'full'
    conn.execute(
        "INSERT INTO articulo (id_norma, slug, label, raw_heading, body, content_sha256) "
        "VALUES (1, 'art-1', 'Artículo 1', '', %s, %s)",
        ("x" * 2000, "a" * 64),
    )
    # A body on a 'meta' norma must NOT count toward the full-tier budget.
    conn.execute(
        "INSERT INTO articulo (id_norma, slug, label, raw_heading, body, content_sha256) "
        "VALUES (2, 'art-1', 'Artículo 1', '', %s, %s)",
        ("y" * 5000, "b" * 64),
    )
    conn.execute("INSERT INTO analytics.event (kind, id_norma) VALUES ('cold_surface', 2)")
    refresh_signal(conn)
    assert estimate_tier_bytes(conn) == 2000            # only the 'full' body counts
    assert compute_promotions(conn, budget_bytes=1000) == []      # over budget -> refuse
    assert compute_promotions(conn, budget_bytes=10**9) == [2]    # headroom -> promote


@requires_db
def test_apply_promotions_never_touches_seeded_rows(conn):
    from loader.retier import apply_promotions, apply_seed
    apply_seed(conn)
    apply_promotions(conn, [2])
    assert conn.execute("SELECT index_tier, seeded FROM norma WHERE id_norma = 2").fetchone() \
        == ("full", False)
    assert conn.execute("SELECT seeded FROM norma WHERE id_norma = 1").fetchone()[0] is True


@requires_db
def test_prune_events_drops_only_old_rows(conn):
    from loader.retier import prune_events
    conn.execute("INSERT INTO analytics.event (ts, kind, id_norma) "
                 "VALUES (now() - interval '91 days', 'search', NULL)")
    conn.execute("INSERT INTO analytics.event (kind, id_norma) VALUES ('search', NULL)")
    assert prune_events(conn) == 1
    assert conn.execute("SELECT count(*) FROM analytics.event").fetchone()[0] == 1
