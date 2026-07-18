"""The LeyChile metadata the ingest used to discard.

Every cached norma JSON carries ~30 metadata fields; the graph node lifted about
ten and dropped the rest at the first hop, so nothing downstream could ever
recover them. Three of the dropped fields bear directly on real failures:

  - `nombres_uso_comun` is how people actually refer to a norma ("ley de
    partidos", "Código de Comercio"). Searching the common name matched nothing.
  - `observaciones` / `doble_articulado` are LeyChile's own warnings about
    article-numbering anomalies — exactly the hazard in citing article numbers
    from a norma whose numbering repeats or was renumbered by a refundido.
  - `refundido_por` names the consolidated text that supersedes a base law.

These tests cover the pure lift. The BCN-sourced refundido edges live in
bulk_fetch and are covered separately.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.fetch_normas import _lift_extra_metadata  # noqa: E402


def test_lifts_the_fields_that_were_being_dropped():
    meta = {
        "nombres_uso_comun": ["CODIGO DE COMERCIO"],
        "materias": ["Combustible Gas Natural Licuado", "Ley no. 20.339"],
        "terminos_libres": ["PERSONAL", "PLANTA"],
        "categorias_norma": ["Equilibrio en el precio del gas"],
        "observaciones": ["LA NUMERACION DE LOS ARTICULOS DEL TEXTO PUBLICADO REPITE EL Nº 2"],
        "doble_articulado": True,
        "refundido_por": "DFL-2; DFL-2-95",
        "derogacion_tacita": "algo",
    }
    out = _lift_extra_metadata(meta)
    assert out["nombresUsoComun"] == ["CODIGO DE COMERCIO"]
    assert out["materias"] == ["Combustible Gas Natural Licuado", "Ley no. 20.339"]
    assert out["terminosLibres"] == ["PERSONAL", "PLANTA"]
    assert out["categoriasNorma"] == ["Equilibrio en el precio del gas"]
    assert out["observaciones"] == [
        "LA NUMERACION DE LOS ARTICULOS DEL TEXTO PUBLICADO REPITE EL Nº 2"
    ]
    assert out["dobleArticulado"] is True
    assert out["refundidoPor"] == "DFL-2; DFL-2-95"
    assert out["derogacionTacita"] == "algo"


def test_absent_and_empty_fields_do_not_grow_the_node():
    """The graph is ~357k nodes and already sharded to dodge GitHub's 100 MB
    limit; an empty key per field per node is pure cost."""
    assert _lift_extra_metadata({}) == {}
    assert _lift_extra_metadata({
        "nombres_uso_comun": [],
        "observaciones": None,
        "refundido_por": "",
        "doble_articulado": False,
        "materias": {},
    }) == {}


def test_resumenes_is_deliberately_not_lifted():
    """It is HTML, it is large, and the corpus builds its own text."""
    out = _lift_extra_metadata({"resumenes": ["<p>…</p>"], "materias": ["X"]})
    assert "resumenes" in {"resumenes"}          # the source field exists
    assert out == {"materias": ["X"]}            # and is not carried through


def test_only_known_fields_are_carried():
    """A new upstream field should not silently start inflating every node."""
    out = _lift_extra_metadata({"materias": ["X"], "campo_nuevo_de_bcn": "y" * 5000})
    assert out == {"materias": ["X"]}
