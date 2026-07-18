"""NDJSON wire format shared by export_snapshot.py and the Railway loader.

Rows are plain frozen dataclasses. Keep them dumb: any logic here has to be
duplicated on both sides of an artifact boundary that spans two machines and
possibly two deploys.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field, fields
from datetime import date, timedelta
from typing import Any, Iterable, TypeVar

__all__ = [
    "NormaRow", "VersionRow", "ModRow", "EventRow", "RelacionRow", "Manifest",
    "close_ranges", "to_ndjson", "from_ndjson",
]

T = TypeVar("T")


@dataclass(frozen=True)
class NormaRow:
    id_norma: int
    tipo: str
    numero: str
    titulo: str
    organismo: str
    clasificacion: str
    derogado: bool
    fecha_publicacion: str | None
    law_dir: str
    # Metadata LeyChile publishes that the ingest used to discard.
    #
    # Every one carries a DEFAULT, which is what makes this artifact boundary
    # safe to cross in both directions: from_ndjson() drops unknown keys, so an
    # old loader ignores these, and a new loader reading a snapshot exported
    # before they existed falls back to the default instead of raising on a
    # missing argument. Without defaults, deploying the loader ahead of a fresh
    # export would break every load.
    #
    # Lists, not tuples: JSON has no tuple, so a tuple field would come back
    # from from_ndjson() as a list and break round-trip equality — which
    # test_ndjson_round_trip asserts, and which anything comparing a re-read row
    # to its source depends on. `frozen` still prevents rebinding the attribute.
    nombres_uso_comun: list[str] = field(default_factory=list)
    materias: list[str] = field(default_factory=list)
    observaciones: list[str] = field(default_factory=list)
    doble_articulado: bool = False
    refundido_por: str = ""


@dataclass(frozen=True)
class VersionRow:
    id_norma: int
    desde: str
    hasta: str | None
    commit_sha: str
    causa_id: int | None
    subject: str
    magnitude: int
    texto_sha256: str      # sha256 of the committed texto.md (provenance)
    canonical_sha256: str  # sha256 of canonical_text(segment(texto)) — the gate


@dataclass(frozen=True)
class ModRow:
    causa_id: int
    target_id: int
    fecha: str
    commit_sha: str


@dataclass(frozen=True)
class RelacionRow:
    """A typed relation between two normas.

    Deliberately separate from ModRow: a modificación is dated and carries the
    commit that produced it, whereas a refundido is a standing structural fact
    with no date of its own. Folding both into one table would mean a nullable
    fecha and a type column that changes what the other columns mean.

    tipo is 'refunde' (origen consolidates destino) or 'refundida_en' (origen is
    superseded by destino). Both directions are stored so either side can be
    answered without a reverse index.
    """
    origen_id: int
    destino_id: int
    tipo: str


@dataclass(frozen=True)
class EventRow:
    id_norma: int
    commit_sha: str
    fecha: str
    causa_id: int | None
    subject: str
    magnitude: int


@dataclass(frozen=True)
class Manifest:
    snapshot_version: str
    watermark: str
    last_delta_seq: int
    shards: list[str]


def close_ranges(desde_dates: list[str]) -> list[tuple[str, str | None]]:
    """Turn publication dates into non-overlapping closed ranges.

    The last range is open-ended (hasta=None). Every other range ends the day
    before the next one begins — which is exactly what the version table's
    EXCLUDE constraint enforces, so getting this wrong fails loudly at load.
    """
    if not desde_dates:
        return []
    if desde_dates != sorted(desde_dates):
        raise ValueError("close_ranges requires sorted dates")
    if len(set(desde_dates)) != len(desde_dates):
        raise ValueError("duplicate desde dates would violate UNIQUE (id_norma, desde)")

    out: list[tuple[str, str | None]] = []
    for i, d in enumerate(desde_dates):
        if i + 1 == len(desde_dates):
            out.append((d, None))
        else:
            nxt = date.fromisoformat(desde_dates[i + 1]) - timedelta(days=1)
            out.append((d, nxt.isoformat()))
    return out


def to_ndjson(rows: Iterable[Any]) -> str:
    return "".join(
        json.dumps(asdict(r), ensure_ascii=False, sort_keys=True) + "\n" for r in rows
    )


def from_ndjson(line: str, cls: type[T]) -> T:
    data = json.loads(line)
    known = {f.name for f in fields(cls)}
    return cls(**{k: v for k, v in data.items() if k in known})
