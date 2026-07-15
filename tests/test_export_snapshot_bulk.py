"""The bulk (full-corpus) export path must produce output identical to the
reviewed per-norma (delta) path. This is the correctness contract behind the
~714k-subprocess → constant-subprocess optimization in export_snapshot.

Requires a real git repo, so it builds a tiny throwaway one. Exercises the
cause-centered model: one commit touching two law dirs must appear in both
normas' histories.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from export_snapshot import Accum, build_law_dir_index, export_bulk, export_delta


def _git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(repo), *args], check=True,
                   capture_output=True)


def _write_law(repo: Path, law_dir: str, texto: str, id_norma: int) -> None:
    d = repo / law_dir
    d.mkdir(parents=True, exist_ok=True)
    (d / "texto.md").write_text(texto, encoding="utf-8")
    (d / "metadata.json").write_text(json.dumps({"idNorma": id_norma}), encoding="utf-8")


def _commit(repo: Path, subject: str, date: str, causa: int) -> None:
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", subject, f"--date={date}T00:00:00",
         "-m", f"BCN idNorma={causa}")


@pytest.fixture
def historial(tmp_path: Path) -> Path:
    repo = tmp_path / "hist"
    repo.mkdir()
    _git(repo, "init", "-q")
    _git(repo, "config", "user.email", "t@t")
    _git(repo, "config", "user.name", "t")
    _git(repo, "config", "commit.gpgsign", "false")

    _write_law(repo, "leyes/100", "#### Artículo 1\nTexto original 100.\n", 100)
    _commit(repo, "Ley N°100 publicada (2010-01-01)", "2010-01-01", 100)

    _write_law(repo, "leyes/300", "#### Artículo 1\nTexto 300.\n", 300)
    _commit(repo, "Ley N°300 publicada (2012-05-05)", "2012-05-05", 300)

    # Cause-centered: one commit touches BOTH the modifier and the modified law.
    _write_law(repo, "modificaciones/200", "#### Artículo único\nModifícase la 100.\n", 200)
    _write_law(repo, "leyes/100", "#### Artículo 1\nTexto MODIFICADO 100 por 200.\n", 100)
    _commit(repo, "Otra [id 200] publicada (2015-08-08)", "2015-08-08", 200)
    return repo


GRAPH = {
    "100": {"tipo": "ley", "numero": "100", "titulo": "LEY CIEN", "organismos": ["MIN X"],
            "clasificacion": "sustantiva", "derogado": False, "fechaPublicacion": "2010-01-01",
            "modificadaPor_edges": [{"idNorma": 200, "fecha": "2015-08-08"}]},
    "200": {"tipo": "ley", "numero": "200", "titulo": "LEY DOSCIENTOS", "organismos": ["MIN X"],
            "clasificacion": "modificatoria", "derogado": False, "fechaPublicacion": "2015-08-08",
            "modificadaPor_edges": []},
    "300": {"tipo": "ley", "numero": "300", "titulo": "LEY TRESCIENTOS", "organismos": ["MIN Y"],
            "clasificacion": "sustantiva", "derogado": False, "fechaPublicacion": "2012-05-05",
            "modificadaPor_edges": []},
}


def _rows(acc: Accum) -> dict[str, list[str]]:
    from schemas.snapshot import to_ndjson
    return {
        kind: sorted(to_ndjson(rows).splitlines())
        for kind, rows in [("normas", acc.normas), ("versions", acc.versions),
                           ("articulos", acc.articles), ("spans", acc.spans),
                           ("mods", acc.mods), ("events", acc.events)]
    }


def test_bulk_matches_delta(historial: Path) -> None:
    law_dirs = build_law_dir_index(historial)

    acc_delta = Accum()
    export_delta(acc_delta, historial, GRAPH, law_dirs, {100, 200, 300})

    acc_bulk = Accum()
    export_bulk(acc_bulk, historial, GRAPH, law_dirs)

    assert _rows(acc_bulk) == _rows(acc_delta)
    # Sanity: the cause-centered commit gave ley 100 two versions.
    assert len(acc_bulk.versions) == 4
    assert len(acc_bulk.normas) == 3
    assert len(acc_bulk.mods) == 1
