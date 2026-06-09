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
    aggregate_manifest,
    _causa_from_message,
    real_date,
)


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
