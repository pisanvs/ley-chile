"""Build a local dev-data subset by sampling shards from the deployed pages branch.

Downloads 500 random per-law commit shards from
https://pisanvs.github.io/ley-chile/idx/commits/{id}.json,
plus the title index entries to power Cmd-K search locally.

Outputs to web/public/idx/. The SPA's raw texto.md fetches still go to
raw.githubusercontent.com — those URLs are public + CDN-cached, no local mirror needed.
"""
from __future__ import annotations

import json
import os
import random
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "idx"
COMMITS_OUT = OUT / "commits"
N_LAWS = 500
PAGES_BASE = "https://pisanvs.github.io/ley-chile/idx"
REPO = "pisanvs/ley-chile"
GH_TOKEN = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")


def _gh_api(path: str) -> dict:
    req = urllib.request.Request(
        f"https://api.github.com/{path}",
        headers={
            "Accept": "application/vnd.github+json",
            **({"Authorization": f"Bearer {GH_TOKEN}"} if GH_TOKEN else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _enumerate_shard_ids() -> list[int]:
    tree = _gh_api(f"repos/{REPO}/git/trees/pages?recursive=1")
    ids: list[int] = []
    for entry in tree["tree"]:
        path = entry["path"]
        if path.startswith("idx/commits/") and path.endswith(".json"):
            try:
                ids.append(int(path[len("idx/commits/") : -len(".json")]))
            except ValueError:
                pass
    return ids


def _fetch_shard(id_norma: int) -> tuple[int, dict | None]:
    url = f"{PAGES_BASE}/commits/{id_norma}.json"
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return id_norma, json.loads(r.read())
    except (urllib.error.URLError, json.JSONDecodeError) as e:
        print(f"  ! {id_norma}: {e}", file=sys.stderr)
        return id_norma, None


def main() -> None:
    random.seed(42)  # reproducible subset
    print("Enumerating available shards on pages branch...")
    all_ids = _enumerate_shard_ids()
    print(f"  {len(all_ids):,} shards available (API may truncate at ~85k)")

    sample = random.sample(all_ids, k=min(N_LAWS, len(all_ids)))
    print(f"Sampling {len(sample)} shards...")

    COMMITS_OUT.mkdir(parents=True, exist_ok=True)
    shards: dict[int, dict] = {}
    with ThreadPoolExecutor(max_workers=16) as pool:
        for fut in as_completed(pool.submit(_fetch_shard, i) for i in sample):
            i, shard = fut.result()
            if shard is not None:
                shards[i] = shard
                (COMMITS_OUT / f"{i}.json").write_text(
                    json.dumps(shard, ensure_ascii=False, separators=(",", ":"))
                )

    print(f"  fetched {len(shards)}/{len(sample)} shards")

    # Manifest (subset stats)
    all_dates = [c["date"] for s in shards.values() for c in s["commits"] if c.get("date")]
    years = sorted({int(d[:4]) for d in all_dates if len(d) >= 4 and d[:4].isdigit()})
    manifest = {
        "repo": REPO,
        "subset": True,
        "normas_count": len(shards),
        "versions_count": sum(len(s["commits"]) for s in shards.values()),
        "year_min": years[0] if years else None,
        "year_max": years[-1] if years else None,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"Wrote manifest: {manifest}")

    # Titles index (for Cmd-K)
    titles = [
        {
            "idNorma": s["norma"]["id_norma"],
            "numero": s["norma"]["numero"],
            "tipo": s["norma"]["tipo"],
            "titulo": s["norma"]["titulo"],
            "organismo": s["norma"]["organismo"],
            "fechaPublicacion": s["norma"]["fecha_publicacion"],
        }
        for s in shards.values()
    ]
    titles.sort(key=lambda t: t["idNorma"])
    (OUT / "titles.json").write_text(json.dumps(titles, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote titles.json with {len(titles)} entries")

    # numero → idNorma resolver
    by_numero: dict[str, list[int]] = {}
    for t in titles:
        by_numero.setdefault(str(t["numero"]), []).append(t["idNorma"])
    (OUT / "by-numero.json").write_text(json.dumps(by_numero, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote by-numero.json with {len(by_numero)} numero keys")

    # Landing data: year histogram + recent events
    year_counts: dict[int, int] = {}
    for d in all_dates:
        try:
            y = int(d[:4])
            year_counts[y] = year_counts.get(y, 0) + 1
        except ValueError:
            continue
    recent_events: list[dict] = []
    for s in shards.values():
        for c in s["commits"]:
            recent_events.append(
                {
                    "sha": c["sha"],
                    "date": c["date"],
                    "causaId": c.get("causa_id", 0),
                    "subject": c["subject"],
                    "idNorma": s["norma"]["id_norma"],
                    "numero": s["norma"]["numero"],
                    "tipo": s["norma"]["tipo"],
                    "titulo": s["norma"]["titulo"],
                }
            )
    recent_events.sort(key=lambda e: e["date"], reverse=True)
    landing = {
        "yearHistogram": [
            {"year": y, "count": c} for y, c in sorted(year_counts.items())
        ],
        "recentEvents": recent_events[:200],
    }
    (OUT / "landing.json").write_text(json.dumps(landing, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote landing.json: {len(landing['yearHistogram'])} years, {len(landing['recentEvents'])} recent events")

    print("\nDone. Subset lives at web/public/idx/.")


if __name__ == "__main__":
    main()
