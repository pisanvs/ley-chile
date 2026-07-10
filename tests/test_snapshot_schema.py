import pytest
from schemas.snapshot import (
    Manifest, ModRow, NormaRow, VersionRow, close_ranges, from_ndjson, to_ndjson,
)


def test_close_ranges_makes_adjacent_non_overlapping_ranges():
    # Each range ends the day BEFORE the next date in the list. The last is open.
    assert close_ranges(["2000-01-01", "2010-06-15", "2020-03-01"]) == [
        ("2000-01-01", "2010-06-14"),   # day before 2010-06-15
        ("2010-06-15", "2020-02-29"),   # day before 2020-03-01; 2020 is a leap year
        ("2020-03-01", None),           # still in force
    ]


def test_close_ranges_boundary_arithmetic():
    # The cases where naive string surgery goes wrong.
    assert close_ranges(["2010-06-01", "2010-07-01"])[0][1] == "2010-06-30"  # month
    assert close_ranges(["2019-01-01", "2020-01-01"])[0][1] == "2019-12-31"  # year
    assert close_ranges(["2020-01-01", "2020-03-01"])[0][1] == "2020-02-29"  # leap
    assert close_ranges(["2019-01-01", "2019-03-01"])[0][1] == "2019-02-28"  # non-leap


def test_close_ranges_single_version_is_open_ended():
    assert close_ranges(["1997-03-04"]) == [("1997-03-04", None)]


def test_close_ranges_empty():
    assert close_ranges([]) == []


def test_close_ranges_rejects_unsorted_input():
    with pytest.raises(ValueError, match="sorted"):
        close_ranges(["2010-01-01", "2000-01-01"])


def test_close_ranges_rejects_duplicates():
    # Two versions with the same desde would violate UNIQUE (id_norma, desde).
    with pytest.raises(ValueError, match="duplicate"):
        close_ranges(["2000-01-01", "2000-01-01"])


def test_ndjson_round_trip():
    row = NormaRow(
        id_norma=20330, tipo="ley", numero="20330", titulo="LEY",
        organismo="MIN", clasificacion="sustantiva", derogado=False,
        fecha_publicacion="2009-02-25", law_dir="leyes/20330",
    )
    line = to_ndjson([row]).strip()
    assert from_ndjson(line, NormaRow) == row


def test_ndjson_round_trip_with_nulls():
    row = VersionRow(
        id_norma=1, desde="2000-01-01", hasta=None, commit_sha="abc",
        causa_id=None, subject="s", magnitude=0,
        texto_sha256="t", canonical_sha256="c",
    )
    assert from_ndjson(to_ndjson([row]).strip(), VersionRow) == row


def test_manifest_round_trip():
    m = Manifest(snapshot_version="2026-07-09T00:00:00Z", watermark="2026-05-29",
                 last_delta_seq=7, shards=["normas-000.ndjson.gz"])
    assert from_ndjson(to_ndjson([m]).strip(), Manifest) == m


def test_mod_row_round_trip():
    m = ModRow(causa_id=1, target_id=2, fecha="2001-01-01", commit_sha="deadbeef")
    assert from_ndjson(to_ndjson([m]).strip(), ModRow) == m
