"""Tests for sharded-diff write/read round-trip in utils.py."""
import gzip
import json
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import utils


def _entry(fecha: str, payload_size: int = 0, seed: int = 0) -> dict:
    """One diff entry. payload_size sets a high-entropy `diff.text` payload
    so gzip cannot squash it to nothing (which would defeat shard-size
    threshold tests)."""
    rnd = random.Random(f"{fecha}:{seed}")
    text = "".join(rnd.choices("abcdefghijklmnopqrstuvwxyz0123456789 ", k=payload_size))
    return {
        "fecha": fecha,
        "tipo_version_s": "",
        "diff": {"text": text} if payload_size else None,
    }


def test_small_diff_writes_single_file(tmp_path):
    diffs_dir = tmp_path / "diffs"
    data = [_entry("2020-01-01"), _entry("2021-01-01")]
    path = utils.write_diff_file(diffs_dir, 100, data)
    assert path == diffs_dir / "100.json.gz"
    assert path.is_file()
    assert not (diffs_dir / "100").exists()


def test_small_diff_round_trips(tmp_path):
    diffs_dir = tmp_path / "diffs"
    data = [_entry("2020-01-01"), _entry("2021-01-01")]
    utils.write_diff_file(diffs_dir, 100, data)
    found = utils.find_diff_path(diffs_dir, 100)
    assert found == diffs_dir / "100.json.gz"
    assert utils.load_diff_file(found) == data


def test_large_diff_shards_into_dir(tmp_path, monkeypatch):
    """Force sharding by lowering the threshold; verify dir layout + count."""
    diffs_dir = tmp_path / "diffs"
    # 256 KB threshold → multiple shards for ~1 MB payload
    monkeypatch.setattr(utils, "DIFF_SHARD_THRESHOLD_BYTES", 256 * 1024)
    # 50 entries × ~30 KB random-ish each → ~1.5 MB raw, ~1 MB compressed
    data = [_entry(f"20{i:02d}-01-01", payload_size=30_000) for i in range(50)]
    path = utils.write_diff_file(diffs_dir, 999, data)
    assert path == diffs_dir / "999"
    assert path.is_dir()
    assert not (diffs_dir / "999.json.gz").exists()
    shards = sorted(path.glob("*.json.gz"))
    assert len(shards) >= 2, f"expected >=2 shards, got {len(shards)}"
    # Each shard under threshold
    for s in shards:
        assert s.stat().st_size <= 256 * 1024, f"{s.name} too big: {s.stat().st_size}"


def test_sharded_round_trip_preserves_order(tmp_path, monkeypatch):
    diffs_dir = tmp_path / "diffs"
    monkeypatch.setattr(utils, "DIFF_SHARD_THRESHOLD_BYTES", 64 * 1024)
    data = [_entry(f"20{i:02d}-06-15", payload_size=5_000) for i in range(40)]
    utils.write_diff_file(diffs_dir, 999, data)
    found = utils.find_diff_path(diffs_dir, 999)
    assert found.is_dir()
    loaded = utils.load_diff_file(found)
    assert loaded == data  # preserves exact order + content


def test_transition_single_to_sharded_cleans_up_file(tmp_path, monkeypatch):
    diffs_dir = tmp_path / "diffs"
    # First: small payload → single file
    monkeypatch.setattr(utils, "DIFF_SHARD_THRESHOLD_BYTES", 1024 * 1024)
    utils.write_diff_file(diffs_dir, 42, [_entry("2020-01-01")])
    assert (diffs_dir / "42.json.gz").is_file()
    # Then: force sharding with bigger data + lower threshold
    monkeypatch.setattr(utils, "DIFF_SHARD_THRESHOLD_BYTES", 16 * 1024)
    big = [_entry(f"20{i:02d}-01-01", payload_size=2_000) for i in range(30)]
    utils.write_diff_file(diffs_dir, 42, big)
    assert not (diffs_dir / "42.json.gz").exists()
    assert (diffs_dir / "42").is_dir()


def test_transition_sharded_to_single_cleans_up_dir(tmp_path, monkeypatch):
    diffs_dir = tmp_path / "diffs"
    monkeypatch.setattr(utils, "DIFF_SHARD_THRESHOLD_BYTES", 16 * 1024)
    big = [_entry(f"20{i:02d}-01-01", payload_size=2_000) for i in range(30)]
    utils.write_diff_file(diffs_dir, 7, big)
    assert (diffs_dir / "7").is_dir()
    # Switch back to single-file (small data, big threshold)
    monkeypatch.setattr(utils, "DIFF_SHARD_THRESHOLD_BYTES", 1024 * 1024)
    utils.write_diff_file(diffs_dir, 7, [_entry("2020-01-01")])
    assert (diffs_dir / "7.json.gz").is_file()
    assert not (diffs_dir / "7").exists()


def test_legacy_plain_json_still_readable(tmp_path):
    """A pre-gzip-migration `.json` file must still be findable + loadable."""
    diffs_dir = tmp_path / "diffs"
    diffs_dir.mkdir()
    data = [_entry("2020-01-01")]
    (diffs_dir / "55.json").write_text(json.dumps(data), encoding="utf-8")
    found = utils.find_diff_path(diffs_dir, 55)
    assert found == diffs_dir / "55.json"
    assert utils.load_diff_file(found) == data


def test_find_diff_path_prefers_gz_over_dir(tmp_path):
    """If both a single file and a shard dir exist, gz wins."""
    diffs_dir = tmp_path / "diffs"
    diffs_dir.mkdir()
    # Single-file diff
    with gzip.open(diffs_dir / "9.json.gz", "wt", encoding="utf-8") as f:
        json.dump([_entry("2020-01-01")], f)
    # Stray shard dir
    shard = diffs_dir / "9"
    shard.mkdir()
    with gzip.open(shard / "00000.json.gz", "wt", encoding="utf-8") as f:
        json.dump([_entry("1900-01-01")], f)
    found = utils.find_diff_path(diffs_dir, 9)
    assert found == diffs_dir / "9.json.gz"


def test_empty_shard_dir_is_not_found(tmp_path):
    diffs_dir = tmp_path / "diffs"
    (diffs_dir / "33").mkdir(parents=True)
    assert utils.find_diff_path(diffs_dir, 33) is None
