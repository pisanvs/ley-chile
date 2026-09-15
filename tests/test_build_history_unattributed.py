"""A version with no modificadaPor edge gets its own commit, not the publication's.

The defect this pins: `causa_fecha` was the norma's `fechaPublicacion` for BOTH
the first version AND every version whose cause BCN never published. Since the
commit key is `(causa_fecha, causa_id_str)`, all of those collapsed into one
commit dated at publication, and `.files.update(...)` overwrote `texto.md` once
per collapsed version in diffs order — so the NEWEST edge-less text won and was
written into a commit dated decades earlier.

Downstream everything is faithful: export_snapshot derives versions from git
log, close_ranges closes each range the day before the next commit, spans.py
builds `articulo_span` from those, and `getArticlesAsOf` selects on
`vigencia @> fecha`. Each step is correct; they just propagate a corrupted
commit set. loader/verify.py cannot catch it either — it hashes the same git
blob it is checking, so it verifies span algebra rather than date truth.

Observed on production: `get_article(207436, "articulo 22 bis", "2005-01-01")`
returned 40-hour-law text for an article ley 21.561 created in 2023.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_history as bh


def _write_diffs(cache_dir: Path, id_norma: int, entries: list[dict]) -> None:
    diffs_dir = cache_dir / "diffs"
    diffs_dir.mkdir(parents=True, exist_ok=True)
    (diffs_dir / f"{id_norma}.json").write_text(json.dumps(entries), encoding="utf-8")


def _node(numero: str, pub: str, vigencias: list[str]) -> dict:
    return {
        "numero": numero,
        "fechaPublicacion": pub,
        "titulo": f"Ley {numero}",
        "tipo": "Ley",
        "clasificacion": "sustantiva",
        "organismos": [],
        "vigencias": [{"desde": d} for d in vigencias],
        "derogado": False,
        "modificadaPor_edges": [],
    }


def _entry(fecha: str, causa: dict | None = None) -> dict:
    return {"fecha": fecha, "modificadaPor": causa, "diff": None}


CAUSA = {"idNorma": 999, "numero": "21561", "titulo": "MODIFICA EL CÓDIGO DEL TRABAJO"}


def _events(tmp_path, entries):
    """Collect events for one norma whose diffs are `entries`."""
    graph = {"100": _node("100", "2003-01-16", [e["fecha"] for e in entries])}
    cache_dir = tmp_path / "cache"
    _write_diffs(cache_dir, 100, entries)
    return bh._collect_events(graph, tmp_path, cache_dir=cache_dir)


class TestUnattributedVersionsDoNotCollapse:
    def test_each_edge_less_version_becomes_its_own_commit(self, tmp_path):
        # The shape of DFL 1 in miniature: a publication, then three versions
        # BCN never attributed. All four used to become ONE commit dated
        # 2003-01-16 carrying the 2028 text.
        events = _events(tmp_path, [
            _entry("2003-01-16"),
            _entry("2008-03-29"),
            _entry("2023-04-26"),
            _entry("2028-04-26"),
        ])
        assert len(events) == 4
        assert sorted(e.date for e in events) == [
            "2003-01-16", "2008-03-29", "2023-04-26", "2028-04-26",
        ]

    def test_the_publication_event_keeps_the_publication_date(self, tmp_path):
        # i == 0 is deliberately left alone: that IS the publication event, and
        # a norma given retroactive effect legitimately has a first vigencia
        # earlier than its publication.
        events = _events(tmp_path, [_entry("2003-06-01"), _entry("2008-03-29")])
        first = min(events, key=lambda e: e.date)
        assert first.date == "2003-01-16"  # fechaPublicacion, not 2003-06-01

    def test_attributed_versions_still_key_on_their_causa(self, tmp_path):
        events = _events(tmp_path, [_entry("2003-01-16"), _entry("2023-04-26", CAUSA)])
        attributed = [e for e in events if e.date == "2023-04-26"]
        assert len(attributed) == 1
        assert attributed[0].id_norma == 999

    def test_several_edge_less_versions_do_not_share_one_texto(self, tmp_path):
        # The mechanism that produced wrong text: files.update() overwriting
        # the same CommitContext. Distinct commits mean distinct file sets.
        events = _events(tmp_path, [
            _entry("2003-01-16"), _entry("2010-01-01"), _entry("2020-01-01"),
        ])
        by_date = {e.date: e for e in events}
        assert len(by_date) == 3
        for e in by_date.values():
            assert e.files, f"commit {e.date} carries no files"

    def test_a_version_dated_at_publication_still_merges(self, tmp_path):
        # Not every collapse is wrong: a version whose own fecha IS the
        # publication date belongs in the publication commit.
        events = _events(tmp_path, [_entry("2003-01-16"), _entry("2003-01-16")])
        assert len(events) == 1


class TestUnattributedCommitsAreHonest:
    def test_the_subject_does_not_claim_a_publication(self, tmp_path):
        events = _events(tmp_path, [_entry("2003-01-16"), _entry("2020-01-01")])
        later = next(e for e in events if e.date == "2020-01-01")
        assert "sin causa atribuida" in later.subject
        # Borrowing the publication subject would assert both a cause and a
        # date that are not this version's.
        assert "publicada (2020-01-01)" not in later.subject

    def test_the_publication_commit_keeps_its_own_subject(self, tmp_path):
        events = _events(tmp_path, [_entry("2003-01-16"), _entry("2020-01-01")])
        first = next(e for e in events if e.date == "2003-01-16")
        assert "publicada" in first.subject
        assert "sin causa atribuida" not in first.subject

    def test_no_self_referential_causa_id(self, tmp_path):
        # export_snapshot.causa_from_message reads `BCN idNorma=` into
        # publication_event.causa_id. Emitting it here would say the norma
        # modified itself — a wrong answer dressed as a known one.
        events = _events(tmp_path, [_entry("2003-01-16"), _entry("2020-01-01")])
        later = next(e for e in events if e.date == "2020-01-01")
        assert "BCN idNorma=" not in later.body

    def test_the_publication_commit_still_records_its_idnorma(self, tmp_path):
        events = _events(tmp_path, [_entry("2003-01-16"), _entry("2020-01-01")])
        first = next(e for e in events if e.date == "2003-01-16")
        assert "BCN idNorma=100" in first.body

    def test_unattributed_versions_sort_after_a_publication_on_the_same_day(self, tmp_path):
        events = _events(tmp_path, [_entry("2003-01-16"), _entry("2020-01-01")])
        later = next(e for e in events if e.date == "2020-01-01")
        assert later._rank == 1  # update, not feat


class TestIncrementalWindow:
    def test_an_edge_less_version_is_filtered_on_its_own_date(self, tmp_path):
        # A latent second bug the same line cured. The --from filter compares
        # causa_fecha, so an edge-less 2020 version of a 2003 law was compared
        # as 2003 and silently dropped from every incremental run.
        graph = {"100": _node("100", "2003-01-16", ["2003-01-16", "2020-01-01"])}
        cache_dir = tmp_path / "cache"
        _write_diffs(cache_dir, 100, [_entry("2003-01-16"), _entry("2020-01-01")])
        events = bh._collect_events(
            graph, tmp_path, cache_dir=cache_dir, from_date="2010-01-01",
        )
        assert [e.date for e in events] == ["2020-01-01"]
