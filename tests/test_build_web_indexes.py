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
)


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


def test_aggregate_manifest_handles_empty():
    m = aggregate_manifest({}, repo="pisanvs/ley-chile")
    assert m["normas_count"] == 0
    assert m["versions_count"] == 0
    assert m["year_min"] is None
    assert m["year_max"] is None
