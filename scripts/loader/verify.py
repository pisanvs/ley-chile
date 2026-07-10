"""The validation gate (spec §8.1).

Reconstruct every version from articulo + articulo_span, hash its canonical
form, compare against version.canonical_sha256. 100% match or no cutover.

Not a byte-comparison against texto.md: segmentation strips bodies and rewrites
headings, so byte-identity is unachievable by construction. canonical_text is
order-, heading- and body-sensitive while ignoring the whitespace segmentation
was always going to discard — which is exactly the property we need.
"""
from __future__ import annotations

from dataclasses import dataclass

import psycopg

from segment import canonical_text, sha256_text
from spans import ArticleRow, SpanRow, reconstruct


@dataclass(frozen=True)
class Mismatch:
    id_norma: int
    desde: str
    expected: str
    actual: str


def _rows_for(conn: psycopg.Connection, id_norma: int) -> tuple[list[ArticleRow], list[SpanRow]]:
    articles = [
        ArticleRow(id_norma=id_norma, slug=slug, label=label,
                   raw_heading=raw_heading, body=body, content_sha256=sha)
        for slug, label, raw_heading, body, sha in conn.execute(
            "SELECT slug, label, raw_heading, body, content_sha256 FROM articulo WHERE id_norma = %s",
            (id_norma,),
        )
    ]
    spans = [
        SpanRow(id_norma=id_norma, slug=slug, content_sha256=sha,
                desde=desde.isoformat(), hasta=hasta.isoformat() if hasta else None, ord=ord_)
        for slug, sha, desde, hasta, ord_ in conn.execute(
            """
            SELECT a.slug, a.content_sha256, s.desde, s.hasta, s.ord
              FROM articulo_span s JOIN articulo a ON a.id = s.articulo_id
             WHERE a.id_norma = %s
            """,
            (id_norma,),
        )
    ]
    return articles, spans


def verify_norma(conn: psycopg.Connection, id_norma: int) -> list[Mismatch]:
    articles, spans = _rows_for(conn, id_norma)
    out: list[Mismatch] = []
    for desde, expected in conn.execute(
        "SELECT desde, canonical_sha256 FROM version WHERE id_norma = %s ORDER BY desde",
        (id_norma,),
    ).fetchall():
        actual = sha256_text(canonical_text(reconstruct(articles, spans, desde.isoformat())))
        if actual != expected:
            out.append(Mismatch(id_norma, desde.isoformat(), expected, actual))
    return out


def verify_normas(conn: psycopg.Connection, id_normas: list[int]) -> list[Mismatch]:
    """Verify only the normas a delta touched.

    The incremental loader must not re-verify the whole corpus on every run:
    verify_norma is O(versions x (articles + spans)) for one norma, so a delta
    touching three laws would otherwise walk all ~408k versions. verify_all()
    remains the cutover gate.
    """
    mismatches: list[Mismatch] = []
    for id_norma in id_normas:
        mismatches += verify_norma(conn, id_norma)
    return mismatches


def verify_all(conn: psycopg.Connection, *, limit: int | None = None) -> list[Mismatch]:
    sql = "SELECT id_norma FROM norma ORDER BY id_norma"
    if limit:
        sql += f" LIMIT {int(limit)}"
    ids = [r[0] for r in conn.execute(sql).fetchall()]
    mismatches: list[Mismatch] = []
    for id_norma in ids:
        mismatches += verify_norma(conn, id_norma)
    return mismatches


def count_versions(conn: psycopg.Connection) -> int:
    return conn.execute("SELECT count(*) FROM version").fetchone()[0]


def gate(conn: psycopg.Connection) -> int:
    """Exit code for the cutover gate. Fails closed on no evidence.

    verify_all() returns [] for a database with zero versions — indistinguishable
    from "all 408,182 reconstructed". A gate that passes when it checked nothing
    manufactures the confidence it exists to establish, so count first.
    """
    total = count_versions(conn)
    if total == 0:
        print("NO EVIDENCE: the database holds 0 versions. The gate checked "
              "nothing; refusing to pass.")
        return 1

    mismatches = verify_all(conn)
    if mismatches:
        for m in mismatches[:20]:
            print(f"MISMATCH id_norma={m.id_norma} desde={m.desde}")
        print(f"\nGATE FAILED: {len(mismatches)} of {total:,} versions did not reconstruct.")
        return 1

    print(f"GATE PASSED: all {total:,} versions reconstruct.")
    return 0


def main() -> int:
    from loader.db import connect
    return gate(connect())


if __name__ == "__main__":
    raise SystemExit(main())
