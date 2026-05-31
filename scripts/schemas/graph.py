"""Graph: per-norma metadata + the modificadaPor edge list.

Legacy shape (each value in graph_shards/NN.json, keyed by str(idNorma))::

    {
      "idNorma": 32,
      "titulo": "...",
      "clasificacion": "sustantiva" | "modificatoria",
      "organismos": ["...", ...],
      "derogado": false,
      "fechaPublicacion": "YYYY-MM-DD",
      "fechaPromulgacion": "YYYY-MM-DD",
      "vigencias": [{"desde": "...", "hasta": "...", "tipo_version": "...", "tipo_version_s": "..."}],
      "modificadaPor_edges": [<idNorma>, ...],
      "tipo": "ley" | "dl" | "dfl" | "dto" | "cod" | "acd" | "aa" | ...
    }

The graph as a whole is ``NormaGraph`` — a thin wrapper around a dict
keyed by ``id_norma`` (int, not str) so callers can do typed lookups.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .enums import Clasificacion, NormaTipo
from .errors import SchemaError


@dataclass(frozen=True, slots=True)
class ModificadaPorEdge:
    """One incoming "modified-by" edge: the modifying norma's id and date.

    Legacy shape: ``{"idNorma": <int>, "fecha": "YYYY-MM-DD"}``.
    """

    id_norma: int
    fecha: str

    @classmethod
    def from_legacy(cls, raw: dict | int) -> "ModificadaPorEdge":
        # Tolerate a bare int form in case any cache predates the edge-object shape.
        if isinstance(raw, int):
            return cls(id_norma=raw, fecha="")
        return cls(
            id_norma=int(raw["idNorma"]),
            fecha=str(raw.get("fecha", "")),
        )


@dataclass(frozen=True, slots=True)
class Vigencia:
    """One row of the ``vigencias`` array: a date range + a version label."""

    desde: str
    hasta: str
    tipo_version: str
    tipo_version_s: str

    @classmethod
    def from_legacy(cls, raw: dict) -> "Vigencia":
        return cls(
            desde=str(raw.get("desde", "")),
            hasta=str(raw.get("hasta", "")),
            tipo_version=str(raw.get("tipo_version", "")),
            tipo_version_s=str(raw.get("tipo_version_s", "")),
        )


@dataclass(slots=True)
class NormaNode:
    """A single norma's metadata as stored in the graph."""

    id_norma: int
    titulo: str
    clasificacion: Clasificacion
    organismos: list[str] = field(default_factory=list)
    derogado: bool = False
    fecha_publicacion: str = ""
    fecha_promulgacion: str = ""
    vigencias: list[Vigencia] = field(default_factory=list)
    modificada_por_edges: list[ModificadaPorEdge] = field(default_factory=list)
    tipo: NormaTipo = NormaTipo.LEY

    @classmethod
    def from_legacy(cls, raw: dict, *, source: str | None = None) -> "NormaNode":
        try:
            clas_raw = (raw.get("clasificacion") or "sustantiva").strip().lower()
            clas = (
                Clasificacion.MODIFICATORIA
                if clas_raw == "modificatoria"
                else Clasificacion.SUSTANTIVA
            )
            return cls(
                id_norma=int(raw["idNorma"]),
                titulo=str(raw.get("titulo", "")),
                clasificacion=clas,
                organismos=[str(x) for x in raw.get("organismos") or []],
                derogado=bool(raw.get("derogado", False)),
                fecha_publicacion=str(raw.get("fechaPublicacion", "")),
                fecha_promulgacion=str(raw.get("fechaPromulgacion", "")),
                vigencias=[Vigencia.from_legacy(v) for v in raw.get("vigencias") or []],
                modificada_por_edges=[
                    ModificadaPorEdge.from_legacy(x) for x in raw.get("modificadaPor_edges") or []
                ],
                tipo=NormaTipo.parse(raw.get("tipo")),
            )
        except (KeyError, TypeError, ValueError) as e:
            raise SchemaError(
                f"malformed norma node: {e}",
                source=source,
                field=f"node[{raw.get('idNorma', '?')}]",
            ) from e


@dataclass(slots=True)
class NormaGraph:
    """The full graph, keyed by integer ``id_norma``."""

    nodes: dict[int, NormaNode] = field(default_factory=dict)

    def __len__(self) -> int:
        return len(self.nodes)

    def __contains__(self, id_norma: int) -> bool:
        return id_norma in self.nodes

    def __getitem__(self, id_norma: int) -> NormaNode:
        return self.nodes[id_norma]

    def get(self, id_norma: int) -> NormaNode | None:
        return self.nodes.get(id_norma)

    def add(self, node: NormaNode) -> None:
        self.nodes[node.id_norma] = node

    @classmethod
    def from_legacy(cls, raw: dict, *, source: str | None = None) -> "NormaGraph":
        """Load from a legacy ``utils.load_graph`` dict (string-keyed)."""
        if not isinstance(raw, dict):
            raise SchemaError(
                f"graph must be an object, got {type(raw).__name__}", source=source
            )
        g = cls()
        for key, value in raw.items():
            if not isinstance(value, dict):
                raise SchemaError(
                    f"graph value for key {key!r} must be an object",
                    source=source,
                    field=f"[{key}]",
                )
            node = NormaNode.from_legacy(value, source=source)
            g.add(node)
        return g
