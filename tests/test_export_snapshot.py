import json

from export_snapshot import (
    CommitMeta, build_law_dir_index, build_manifest, causa_from_message,
    coalesce_same_date, mod_rows_for, shard_name, versions_for_norma,
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
    versions, _, _, _ = versions_for_norma(42, "leyes/42", _commits(), {"aaa": V1, "bbb": V2})
    assert [v.desde for v in versions] == ["1943-05-10", "2011-02-21"]


def test_same_date_events_coalesce_to_the_last_commit():
    # 87 real normas have 2+ events on one date; idNorma 1984 has three on
    # 2023-04-10. version has UNIQUE (id_norma, desde), so they must collapse.
    commits = [
        CommitMeta("c1", "2020-01-01", "Otra [id 1] publicada (2023-04-10)", 1, 0),
        CommitMeta("c2", "2020-01-01", "Otra [id 2] publicada (2023-04-10)", 2, 0),
        CommitMeta("c3", "2020-01-01", "Otra [id 3] publicada (2023-04-10)", 3, 0),
    ]
    textos = {"c1": V1, "c2": V1, "c3": V2}
    versions, _, _, events = versions_for_norma(1984, "leyes/1984", commits, textos)

    assert len(versions) == 1, "one answer for 'the law on 2023-04-10'"
    assert versions[0].desde == "2023-04-10" and versions[0].hasta is None
    assert versions[0].commit_sha == "c3", "text is the state after ALL that day's commits"
    # ...but every event survives, with its own causa
    assert [e.commit_sha for e in events] == ["c1", "c2", "c3"]
    assert [e.causa_id for e in events] == [1, 2, 3]


def test_events_are_never_coalesced():
    _, _, _, events = versions_for_norma(42, "leyes/42", _commits(), {"aaa": V1, "bbb": V2})
    assert [e.fecha for e in events] == ["1943-05-10", "2011-02-21"]
    assert [e.causa_id for e in events] == [42, 99]


def test_mod_rows_for_reads_dict_edges_with_their_own_fecha():
    # Real shape from fetch_normas.py:_extract_edges_from_html. All 12,010 edges
    # in the real graph are dicts; int(edge) would raise TypeError.
    node = {"fechaPublicacion": "1980-01-01", "modificadaPor_edges": [
        {"idNorma": 30232, "fecha": "1989-12-06"},
        {"idNorma": 244803, "fecha": "2005-12-07"},
    ]}
    rows = mod_rows_for(1984, node)
    assert [(r.causa_id, r.fecha) for r in rows] == [
        (30232, "1989-12-06"), (244803, "2005-12-07"),
    ], "each edge carries its own modification date, not the target's fechaPublicacion"
    assert all(r.target_id == 1984 for r in rows)


def test_mod_rows_for_drops_sentinel_dates_and_dedupes():
    node = {"fechaPublicacion": "1980-01-01", "modificadaPor_edges": [
        {"idNorma": 1, "fecha": "2222-02-02"},          # sentinel: open-ended
        {"idNorma": 2, "fecha": "2001-01-01"},
        {"idNorma": 2, "fecha": "2001-01-01"},          # PK (causa, target, fecha)
    ]}
    assert [(r.causa_id, r.fecha) for r in mod_rows_for(7, node)] == [(2, "2001-01-01")]


def test_mod_rows_for_tolerates_legacy_bare_int_edges():
    node = {"fechaPublicacion": "1980-01-01", "modificadaPor_edges": [30232]}
    assert [(r.causa_id, r.fecha) for r in mod_rows_for(1984, node)] == [(30232, "1980-01-01")]


def test_ranges_are_closed_and_last_is_open_ended():
    versions, _, _, _ = versions_for_norma(42, "leyes/42", _commits(), {"aaa": V1, "bbb": V2})
    assert versions[0].hasta == "2011-02-20"
    assert versions[1].hasta is None


def test_canonical_sha_matches_the_gate_definition():
    versions, _, _, _ = versions_for_norma(42, "leyes/42", _commits(), {"aaa": V1, "bbb": V2})
    assert versions[0].canonical_sha256 == sha256_text(canonical_text(segment(V1)))
    assert versions[0].texto_sha256 == sha256_text(V1)
    assert versions[0].canonical_sha256 != versions[0].texto_sha256


def test_commit_sha_and_causa_are_carried_through():
    versions, _, _, _ = versions_for_norma(42, "leyes/42", _commits(), {"aaa": V1, "bbb": V2})
    assert (versions[1].commit_sha, versions[1].causa_id) == ("bbb", 99)


def test_articles_are_deduped_across_versions():
    unchanged = "#### Artículo 1º\nUno.\n\n#### Artículo 2°\nDos."
    changed = "#### Artículo 1º\nUno.\n\n#### Artículo 2°\nDos MODIFICADO."
    _, arts, spans, _ = versions_for_norma(42, "leyes/42", _commits(),
                                           {"aaa": unchanged, "bbb": changed})
    assert len([a for a in arts if a.slug == "art-1"]) == 1
    assert len([s for s in spans if s.slug == "art-1"]) == 1


def test_commits_out_of_order_are_sorted_by_real_date():
    versions, _, _, _ = versions_for_norma(42, "leyes/42", list(reversed(_commits())),
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
