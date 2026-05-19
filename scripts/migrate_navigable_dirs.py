"""One-time migration: rekey dl/, dl-modificaciones/ from idNorma to period+numero.

Also handles dfl/ and dto/ when they exist (currently no-op on fresh historial).

Run from the repo root:
    python scripts/migrate_navigable_dirs.py [--data-root PATH] [--dry-run]
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Helpers (inline — no dependency on trace_graph to stay self-contained)
# ---------------------------------------------------------------------------

def _dl_period_folder(fecha_pub: str, fecha_promulgacion: str = "") -> str:
    for fecha in (fecha_pub, fecha_promulgacion):
        if fecha and len(fecha) >= 4 and fecha[:4].isdigit():
            year = int(fecha[:4])
            if year < 1930:
                return "dl-1924"
            if year < 1950:
                return "dl-1932"
            return "dl"
    return "dl"


def _organismo_slug(organismo: str) -> str:
    if not organismo:
        return "sin-organismo"
    return re.sub(r"[^a-z0-9]+", "-", organismo.lower()).strip("-") or "sin-organismo"


def _collision_free_key(base: Path, numero: str, id_norma: int) -> str:
    candidate = base / numero
    mf = candidate / "metadata.json"
    if mf.exists():
        try:
            existing = json.loads(mf.read_text(encoding="utf-8")).get("idNorma")
            if existing is not None and existing != id_norma:
                return f"{numero}-{id_norma}"
        except Exception:
            pass
    return numero


def git_mv(data_root: Path, src: str, dst: str, dry_run: bool) -> None:
    """Run git mv src dst inside data_root."""
    if dry_run:
        print(f"  [dry] git mv {src} → {dst}")
        return
    dst_path = data_root / dst
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["git", "-C", str(data_root), "mv", src, dst],
        check=True,
    )
    print(f"  git mv {src} → {dst}")


# ---------------------------------------------------------------------------
# Migration logic per norma family
# ---------------------------------------------------------------------------

def migrate_dl(data_root: Path, dry_run: bool) -> list[tuple[str, str]]:
    """Migrate dl/ and dl-modificaciones/ from idNorma-keyed to period+numero."""
    moves: list[tuple[str, str]] = []
    for src_base_name in ("dl", "dl-modificaciones"):
        src_base = data_root / src_base_name
        if not src_base.is_dir():
            continue
        is_modif = src_base_name.endswith("-modificaciones")
        for entry in sorted(src_base.iterdir()):
            if entry.is_symlink() or not entry.is_dir():
                continue
            mf = entry / "metadata.json"
            if not mf.exists():
                print(f"  WARN: no metadata.json in {entry}; skipping")
                continue
            meta = json.loads(mf.read_text(encoding="utf-8"))
            numero = meta.get("numero", "")
            id_norma = meta.get("idNorma", 0)
            fecha_pub = meta.get("fechaPublicacion", "")
            fecha_prom = meta.get("fechaPromulgacion", "")
            if not numero or not id_norma:
                print(f"  WARN: missing numero/idNorma in {entry}; skipping")
                continue
            period = _dl_period_folder(fecha_pub, fecha_prom)
            suffix = "-modificaciones" if is_modif else ""
            dst_base = data_root / f"{period}{suffix}"
            key = _collision_free_key(dst_base, numero, id_norma)
            src_rel = f"{src_base_name}/{entry.name}"
            dst_rel = f"{period}{suffix}/{key}"
            if src_rel == dst_rel:
                continue
            moves.append((src_rel, dst_rel))
    return moves


def migrate_dfl_dto(data_root: Path, dry_run: bool) -> list[tuple[str, str]]:
    """Migrate dfl/ and dto/ (and their -modificaciones) from idNorma-keyed to organismo+numero."""
    moves: list[tuple[str, str]] = []
    for src_base_name in ("dfl", "dfl-modificaciones", "dto", "dto-modificaciones"):
        src_base = data_root / src_base_name
        if not src_base.is_dir():
            continue
        is_modif = src_base_name.endswith("-modificaciones")
        slug = "dfl" if "dfl" in src_base_name else "dto"
        for entry in sorted(src_base.iterdir()):
            if entry.is_symlink() or not entry.is_dir():
                continue
            # Skip if already organismo-slug-keyed (has subdirs, not law files)
            if not (entry / "metadata.json").exists():
                continue
            meta = json.loads((entry / "metadata.json").read_text(encoding="utf-8"))
            numero = meta.get("numero", "")
            id_norma = meta.get("idNorma", 0)
            organismos = meta.get("organismos") or []
            if not numero or not id_norma:
                print(f"  WARN: missing numero/idNorma in {entry}; skipping")
                continue
            org_slug = _organismo_slug(organismos[0] if organismos else "")
            suffix = "-modificaciones" if is_modif else ""
            dst_base = data_root / f"{slug}{suffix}" / org_slug
            key = _collision_free_key(dst_base, numero, id_norma)
            src_rel = f"{src_base_name}/{entry.name}"
            dst_rel = f"{slug}{suffix}/{org_slug}/{key}"
            if src_rel == dst_rel:
                continue
            moves.append((src_rel, dst_rel))
    return moves


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, help="Path to historial worktree root")
    parser.add_argument("--dry-run", action="store_true", help="Show moves without executing")
    args = parser.parse_args()

    if args.data_root:
        data_root = args.data_root.resolve()
    else:
        # Auto-detect: prefer ./historial worktree
        repo_root = Path(__file__).parent.parent
        historial = repo_root / "historial"
        if historial.is_dir() and (historial / ".git").exists():
            data_root = historial
        else:
            print("Could not detect data root. Use --data-root.", file=sys.stderr)
            sys.exit(1)

    print(f"Data root: {data_root}")
    if args.dry_run:
        print("[DRY RUN — no changes will be made]")

    all_moves: list[tuple[str, str]] = []
    all_moves.extend(migrate_dl(data_root, args.dry_run))
    all_moves.extend(migrate_dfl_dto(data_root, args.dry_run))

    if not all_moves:
        print("Nothing to migrate.")
        return

    print(f"\n{len(all_moves)} move(s) to perform:")
    for src, dst in all_moves:
        git_mv(data_root, src, dst, args.dry_run)

    if not args.dry_run:
        subprocess.run(
            ["git", "-C", str(data_root), "commit", "-m",
             "refactor(data): rekey dl/dfl/dto dirs to human-navigable period+numero scheme"],
            check=True,
        )
        print(f"\nCommitted {len(all_moves)} rename(s).")


if __name__ == "__main__":
    main()
