"""Later versions with no modifier edge must keep their own date.

Regression tests for diff entries whose ``modificadaPor`` is null — typically
deferred-vigencia versions (the modifier is published on a different day than
the vigencia starts) or modifier edges missing from the graph. They used to be
attributed to the norma's ``fechaPublicacion``, which collided with the
creating commit: incremental builds dropped them, and full rebuilds overwrote
the creating commit's texto.md with the later text.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_history as bh  # noqa: E402
import build_web_indexes as bwi  # noqa: E402

ID = 1014974
MODIFIER = 1221284

ENTRIES = [
    {"fecha": "2010-07-02", "modificadaPor": None, "diff": None},
    {"fecha": "2026-02-11", "modificadaPor": {"idNorma": MODIFIER, "fecha": "2026-02-11"}, "diff": None},
    # Deferred vigencia: published 2026-04-01, in force from 2026-07-01 -> no edge on this date
    {"fecha": "2026-07-01", "modificadaPor": None, "diff": None},
]


def _node() -> dict:
    return {
        "numero": "2",
        "fechaPublicacion": "2010-07-02",
        "titulo": "FIJA TEXTO REFUNDIDO DE LA LEY N° 20.370",
        "tipo": "dfl",
        "clasificacion": "sustantiva",
        "organismos": ["MINISTERIO DE EDUCACIÓN"],
        "vigencias": [{"desde": e["fecha"]} for e in ENTRIES],
        "derogado": False,
        "modificadaPor_edges": [{"idNorma": MODIFIER, "fecha": "2026-02-11"}],
    }


@pytest.fixture(autouse=True)
def texto_marca_version(monkeypatch):
    """Replace rendering with a marker so each commit reveals which version it holds."""
    def fake(data_root, cache_dir, id_norma, fecha, node, rel_dir, include_metadata=True):
        return {str(rel_dir / "texto.md"): fecha.encode()}

    monkeypatch.setattr(bh, "_version_files", fake)


def _events(tmp_path: Path, **kw) -> list:
    cache_dir = tmp_path / "cache"
    diffs = cache_dir / "diffs"
    diffs.mkdir(parents=True)
    (diffs / f"{ID}.json").write_text(json.dumps(ENTRIES), encoding="utf-8")
    kw.setdefault("today", "2026-09-13")
    events = bh._collect_events({str(ID): _node()}, tmp_path, cache_dir=cache_dir, **kw)
    return sorted(events, key=lambda e: e.date)


def _texto(event) -> str:
    [value] = [v for k, v in event.files.items() if k.endswith("texto.md")]
    return value.decode()


def test_version_without_modifier_gets_its_own_commit(tmp_path):
    events = _events(tmp_path)
    assert [e.date for e in events] == ["2010-07-02", "2026-02-11", "2026-07-01"]
    assert _texto(events[-1]) == "2026-07-01"
    assert "modificada (2026-07-01)" in events[-1].subject


def test_creating_commit_is_not_overwritten(tmp_path):
    creating = _events(tmp_path)[0]
    assert _texto(creating) == "2010-07-02"
    assert "publicada (2010-07-02)" in creating.subject


def test_incremental_build_keeps_version_without_modifier(tmp_path):
    events = _events(tmp_path, from_date="2026-02-11")
    assert [e.date for e in events] == ["2026-07-01"]
    assert _texto(events[0]) == "2026-07-01"


def test_versions_with_modifier_are_unchanged(tmp_path):
    modified = _events(tmp_path)[1]
    assert modified.id_norma == MODIFIER
    assert "publicada (2026-02-11)" in modified.subject
    assert _texto(modified) == "2026-02-11"


def test_subject_date_is_recoverable_by_web_indexes(tmp_path):
    last = _events(tmp_path)[-1]
    assert bwi.real_date(subject=last.subject, committer_date="1970-01-01") == "2026-07-01"


def test_future_deferred_version_is_not_emitted_yet(tmp_path):
    """Cached before it enters into force (the LGE 2026-07-01 version was fetched
    on 2026-06-02): it must not date the historial tip in the future."""
    events = _events(tmp_path, today="2026-06-02")
    assert [e.date for e in events] == ["2010-07-02", "2026-02-11"]
    assert _texto(events[0]) == "2010-07-02"


def test_deferred_version_is_emitted_once_in_force(tmp_path):
    events = _events(tmp_path, from_date="2026-02-11", today="2026-07-01")
    assert [e.date for e in events] == ["2026-07-01"]
