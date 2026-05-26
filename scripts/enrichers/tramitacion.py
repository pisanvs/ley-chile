"""
tramitacion.py — Enricher that appends legislative session data to commit body.

Reads from cache/tramitacion/{boletin}.json and adds boletín number,
cámara origen, and other tramitación metadata to feat commits.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from enrichers import CommitContext, Enricher

logger = logging.getLogger(__name__)


class TramitacionEnricher(Enricher):
    """Reads cache/tramitacion/{boletin}.json and appends session data to commit body.

    Only enriches feat commits (first publication of a law).
    """

    def __init__(self, data_root: Path) -> None:
        self._cache_dir = data_root / "cache" / "tramitacion"

    def enrich(self, ctx: CommitContext) -> None:
        # Only enrich first-publication commits
        if ctx.tipo != "feat":
            return

        boletin = ctx.extra.get("boletin")
        if not boletin:
            return

        cache_file = self._cache_dir / f"{boletin}.json"
        if not cache_file.exists():
            return

        try:
            data = json.loads(cache_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.debug("tramitacion cache read error for boletin %s: %s", boletin, exc)
            return

        lines: list[str] = []

        lines.append(f"Boletín: {boletin}")

        camara = data.get("camara_origen") or data.get("camaraOrigen")
        if camara:
            lines.append(f"Cámara origen: {camara}")

        fecha_inicio = data.get("fecha_inicio") or data.get("fechaInicio")
        if fecha_inicio:
            lines.append(f"Inicio tramitación: {fecha_inicio}")

        urgencia = data.get("urgencia")
        if urgencia:
            lines.append(f"Urgencia: {urgencia}")

        if not lines:
            return

        block = "\n".join(lines)
        ctx.body = (ctx.body + "\n\n" + block).strip() if ctx.body else block
