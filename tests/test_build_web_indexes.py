"""Pure-function tests for scripts/build_web_indexes.py."""
from __future__ import annotations
import json
import pytest
from pathlib import Path

from scripts.build_web_indexes import (
    parse_metadata,
    raw_text_url,
    commits_index_path,
    Commit,
    NormaMetadata,
    aggregate_manifest,
    _causa_from_message,
    real_date,
    build_modifies,
    build_modified_by,
)


def _nm(id_norma: int, **kw) -> NormaMetadata:
    return NormaMetadata(
        id_norma=id_norma,
        numero=kw.get("numero", str(id_norma)),
        tipo=kw.get("tipo", "ley"),
        titulo=kw.get("titulo", f"Ley {id_norma}"),
        organismo=kw.get("organismo", ""),
        fecha_publicacion=kw.get("fecha_publicacion", "2020-01-01"),
    )


def _c(*, sha, date, causa_id) -> Commit:
    return Commit(sha=sha, date=date, causa_id=causa_id, subject="x", magnitude=0)


class TestBuildModifies:
    def test_empty_when_only_self_edits(self):
        by_id = {1: ("ley/1", _nm(1))}
        populated = {1: [_c(sha="s1", date="2020-01-01", causa_id=1)]}
        assert build_modifies(by_id, populated) == {}

    def test_excludes_unknown_causa(self):
        by_id = {1: ("ley/1", _nm(1))}
        populated = {1: [_c(sha="s1", date="2020-01-01", causa_id=0)]}
        assert build_modifies(by_id, populated) == {}

    def test_captures_outgoing_modifications(self):
        # Norma 10 modifies normas 1 and 2 on different dates.
        by_id = {
            1: ("ley/1", _nm(1, titulo="One", numero="1", tipo="ley")),
            2: ("ley/2", _nm(2, titulo="Two", numero="2", tipo="ley")),
            10: ("ley/10", _nm(10, titulo="Modifier", numero="10")),
        }
        populated = {
            1: [
                _c(sha="s1a", date="2020-01-01", causa_id=1),
                _c(sha="s1b", date="2021-06-15", causa_id=10),
            ],
            2: [
                _c(sha="s2a", date="2020-02-01", causa_id=2),
                _c(sha="s2b", date="2022-03-09", causa_id=10),
            ],
            10: [_c(sha="s10", date="2021-06-15", causa_id=10)],
        }
        mods = build_modifies(by_id, populated)
        assert set(mods.keys()) == {10}
        rows = mods[10]
        assert [r["idNorma"] for r in rows] == [1, 2]
        assert rows[0] == {
            "idNorma": 1, "date": "2021-06-15", "sha": "s1b",
            "titulo": "One", "tipo": "ley", "numero": "1",
        }

    def test_sorts_rows_chronologically(self):
        by_id = {
            1: ("ley/1", _nm(1)),
            2: ("ley/2", _nm(2)),
            10: ("ley/10", _nm(10)),
        }
        populated = {
            1: [_c(sha="s1", date="2023-05-01", causa_id=10)],
            2: [_c(sha="s2", date="2020-01-01", causa_id=10)],
        }
        mods = build_modifies(by_id, populated)
        assert [r["date"] for r in mods[10]] == ["2020-01-01", "2023-05-01"]


class TestBuildModifiedBy:
    def test_empty_when_only_self_edits(self):
        by_id = {1: ("ley/1", _nm(1))}
        populated = {1: [_c(sha="s1", date="2020-01-01", causa_id=1)]}
        assert build_modified_by(by_id, populated) == {}

    def test_skips_unresolvable_modifier(self):
        # causa_id=99 isn't in by_id (data lag); row gets dropped silently.
        by_id = {1: ("ley/1", _nm(1))}
        populated = {1: [_c(sha="s", date="2022-01-01", causa_id=99)]}
        assert build_modified_by(by_id, populated) == {}

    def test_dedupes_repeated_modifier_into_single_row(self):
        # Ley 10 modifies Ley 1 twice → one aggregated row with count=2 and
        # first/last dates spanning both touches.
        by_id = {
            1: ("ley/1", _nm(1, titulo="Target", numero="1")),
            10: ("ley/10", _nm(10, titulo="Mod", numero="10", tipo="decreto")),
        }
        populated = {
            1: [
                _c(sha="a", date="2020-01-01", causa_id=1),    # self-pub
                _c(sha="b", date="2021-06-15", causa_id=10),
                _c(sha="c", date="2023-03-09", causa_id=10),
            ],
        }
        out = build_modified_by(by_id, populated)
        assert set(out.keys()) == {1}
        rows = out[1]
        assert len(rows) == 1
        row = rows[0]
        assert row["modifierId"] == 10
        assert row["modifierTipo"] == "decreto"
        assert row["modifierNumero"] == "10"
        assert row["modifierTitulo"] == "Mod"
        assert row["firstDate"] == "2021-06-15"
        assert row["lastDate"] == "2023-03-09"
        assert row["count"] == 2
        assert row["touchedDates"] == ["2021-06-15", "2023-03-09"]

    def test_orders_modifiers_by_most_recent_touch_first(self):
        by_id = {
            1: ("ley/1", _nm(1)),
            10: ("ley/10", _nm(10)),
            20: ("ley/20", _nm(20)),
        }
        populated = {
            1: [
                _c(sha="a", date="2018-01-01", causa_id=10),
                _c(sha="b", date="2024-05-20", causa_id=20),
            ],
        }
        out = build_modified_by(by_id, populated)
        assert [r["modifierId"] for r in out[1]] == [20, 10]


class TestRealDate:
    def test_uses_subject_date_when_present(self):
        assert real_date(
            subject="Resolución N°766 EXENTA publicada (2015-04-02)",
            committer_date="2015-04-03",
        ) == "2015-04-02"

    def test_recovers_pre_1970_from_subject(self):
        # GitHub fsck rejects negative timestamps, so build_history clamps
        # pre-1970 events to 1970-01-01. The real date is in the subject.
        assert real_date(
            subject="Ley «Ley de Cementerios Laicos» [id 1093262] publicada (1883-08-04)",
            committer_date="1970-01-01",
        ) == "1883-08-04"

    def test_falls_back_when_no_subject_date(self):
        assert real_date(
            subject="Some commit with no date in parens",
            committer_date="2020-05-15",
        ) == "2020-05-15"

    def test_recognizes_promulgada_variant(self):
        assert real_date(
            subject="Decreto Ley N°1 promulgada (1973-09-18)",
            committer_date="1973-09-19",
        ) == "1973-09-18"

    def test_rejects_malformed_parsed_date(self):
        assert real_date(
            subject="publicada (banana)",
            committer_date="2020-01-01",
        ) == "2020-01-01"


def test_parse_metadata_extracts_norma_fields():
    meta = {
        "idNorma": 1234,
        "numero": "20.330",
        "tipo": "ley",
        "titulo": "Becas Bicentenario",
        "organismo": "Ministerio de Educación",
        "fechaPublicacion": "2009-03-15",
    }
    parsed = parse_metadata(meta)
    assert parsed.id_norma == 1234
    assert parsed.numero == "20.330"
    assert parsed.tipo == "ley"
    assert parsed.titulo == "Becas Bicentenario"
    assert parsed.organismo == "Ministerio de Educación"
    assert parsed.fecha_publicacion == "2009-03-15"


def test_raw_text_url_pins_to_sha():
    url = raw_text_url(
        repo="pisanvs/ley-chile",
        sha="abc123def",
        rel_path="leyes/20330/texto.md",
    )
    assert url == "https://raw.githubusercontent.com/pisanvs/ley-chile/abc123def/leyes/20330/texto.md"


def test_commits_index_path_shards_by_id():
    p = commits_index_path(Path("/out"), id_norma=20330)
    assert p == Path("/out/idx/commits/20330.json")


def test_aggregate_manifest_counts_and_year_range():
    commits = {
        1: [
            Commit(sha="a", date="2009-03-15", causa_id=1, subject="x", magnitude=10),
            Commit(sha="b", date="2015-06-01", causa_id=2, subject="y", magnitude=5),
        ],
        2: [
            Commit(sha="c", date="1973-09-11", causa_id=3, subject="z", magnitude=1),
        ],
    }
    m = aggregate_manifest(commits, repo="pisanvs/ley-chile")
    assert m["repo"] == "pisanvs/ley-chile"
    assert m["normas_count"] == 2
    assert m["versions_count"] == 3
    assert m["year_min"] == 1973
    assert m["year_max"] == 2015


def test_causa_from_message_reads_body_trailer():
    subject = "Ley N°20338 publicada (2015-06-01)"
    body = "Modifica la Ley de Becas\n\nBCN idNorma=20808"
    assert _causa_from_message(subject, body) == 20808


def test_causa_from_message_handles_missing():
    assert _causa_from_message("Subject only", "") == 0


def test_causa_from_message_falls_back_to_subject():
    assert _causa_from_message("[idNorma=42] something", "") == 42


def test_aggregate_manifest_handles_empty():
    m = aggregate_manifest({}, repo="pisanvs/ley-chile")
    assert m["normas_count"] == 0
    assert m["versions_count"] == 0
    assert m["year_min"] is None
    assert m["year_max"] is None
