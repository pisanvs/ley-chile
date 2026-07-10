import json

from export_snapshot import (
    CommitMeta, build_law_dir_index, build_manifest, causa_from_message, shard_name,
    versions_for_norma,
)
from segment import canonical_text, segment, sha256_text

V1 = "#### Artículo 1º\nUno."
V2 = "#### Artículo 1º\nUno modificado."


def _commits():
    return [
        # committer dates are deliberately wrong; real_date() must win
        CommitMeta(sha="aaa", committer_date="1970-01-01",
                   subject="feat(ley): Ley 42 promulgada (1943-05-10)",
                   causa_id=42, magnitude=10),
        CommitMeta(sha="bbb", committer_date="2011-02-22",
                   subject="update(ley): Ley 42 modificada (2011-02-21)",
                   causa_id=99, magnitude=3),
    ]


def test_real_date_overrides_bogus_committer_date():
    versions, _, _ = versions_for_norma(42, "leyes/42", _commits(), {"aaa": V1, "bbb": V2})
    assert [v.desde for v in versions] == ["1943-05-10", "2011-02-21"]


def test_ranges_are_closed_and_last_is_open_ended():
    versions, _, _ = versions_for_norma(42, "leyes/42", _commits(), {"aaa": V1, "bbb": V2})
    assert versions[0].hasta == "2011-02-20"
    assert versions[1].hasta is None


def test_canonical_sha_matches_the_gate_definition():
    versions, _, _ = versions_for_norma(42, "leyes/42", _commits(), {"aaa": V1, "bbb": V2})
    assert versions[0].canonical_sha256 == sha256_text(canonical_text(segment(V1)))
    assert versions[0].texto_sha256 == sha256_text(V1)
    assert versions[0].canonical_sha256 != versions[0].texto_sha256


def test_commit_sha_and_causa_are_carried_through():
    versions, _, _ = versions_for_norma(42, "leyes/42", _commits(), {"aaa": V1, "bbb": V2})
    assert (versions[1].commit_sha, versions[1].causa_id) == ("bbb", 99)


def test_articles_are_deduped_across_versions():
    unchanged = "#### Artículo 1º\nUno.\n\n#### Artículo 2°\nDos."
    changed = "#### Artículo 1º\nUno.\n\n#### Artículo 2°\nDos MODIFICADO."
    _, arts, spans = versions_for_norma(42, "leyes/42", _commits(),
                                        {"aaa": unchanged, "bbb": changed})
    assert len([a for a in arts if a.slug == "art-1"]) == 1
    assert len([s for s in spans if s.slug == "art-1"]) == 1


def test_commits_out_of_order_are_sorted_by_real_date():
    versions, _, _ = versions_for_norma(42, "leyes/42", list(reversed(_commits())),
                                        {"aaa": V1, "bbb": V2})
    assert [v.desde for v in versions] == ["1943-05-10", "2011-02-21"]


def test_causa_comes_from_the_body_not_the_subject():
    # Real commit shape at historial@51c7f611c:
    #   subject: "Otra [id 1224599] publicada (2026-05-29)"
    #   body:    "BCN idNorma=1224599"
    # The subject's `[id N]` is a different shape and must not be relied on;
    # named laws ("Ley N°21819 publicada (...)") carry no id in the subject.
    assert causa_from_message("Otra [id 1224599] publicada (2026-05-29)",
                              "BCN idNorma=1224599") == 1224599
    assert causa_from_message("Ley N°21819 publicada (2026-05-25)", "") is None
    assert causa_from_message("Otra [id 999] publicada (2020-01-01)", "") is None


def test_causa_falls_back_to_the_subject():
    assert causa_from_message("update: BCN idNorma=42", "") == 42


def test_build_law_dir_index_reads_the_tree_not_the_graph(tmp_path):
    # graph.json has no law_dir; the layout comes from metadata.json on disk.
    for rel, id_norma in [("leyes/42", 42), ("dfl/hacienda/1", 7), ("cod/1", 9)]:
        d = tmp_path / rel
        d.mkdir(parents=True)
        (d / "metadata.json").write_text(json.dumps({"idNorma": id_norma}), encoding="utf-8")
    assert build_law_dir_index(tmp_path) == {
        42: "leyes/42", 7: "dfl/hacienda/1", 9: "cod/1",
    }


def test_build_law_dir_index_skips_malformed_metadata(tmp_path):
    # One bad norma must not abort a corpus-wide export.
    good = tmp_path / "leyes/1"; good.mkdir(parents=True)
    (good / "metadata.json").write_text('{"idNorma": 1}', encoding="utf-8")
    for rel, blob in [("leyes/2", "not json {"), ("leyes/3", "[1,2]"), ("leyes/4", "{}")]:
        d = tmp_path / rel; d.mkdir(parents=True)
        (d / "metadata.json").write_text(blob, encoding="utf-8")
    assert build_law_dir_index(tmp_path) == {1: "leyes/1"}


def test_build_law_dir_index_empty_tree_is_empty(tmp_path):
    # main() turns this into a hard abort rather than an empty manifest.
    assert build_law_dir_index(tmp_path) == {}


def test_shard_name():
    assert shard_name("normas", 0) == "normas-000.ndjson.gz"
    assert shard_name("articulos", 42) == "articulos-042.ndjson.gz"


def test_build_manifest():
    m = build_manifest("v1", "2026-05-29", 3, ["normas-000.ndjson.gz"])
    assert (m.watermark, m.last_delta_seq) == ("2026-05-29", 3)
