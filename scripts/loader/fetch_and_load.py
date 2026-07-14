"""Railway loader entrypoint: download the latest snapshot Release, then load.

The loader image has no artifacts baked in. This fetches the newest
`snapshot-*` GitHub Release's assets into ARTIFACTS_DIR and hands off to
loader.main, which is idempotent (should_load skips if already current).
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import requests

REPO = os.environ.get("SNAPSHOT_REPO", "pisanvs/ley-chile")
OUT = Path(os.environ.get("ARTIFACTS_DIR", "/tmp/artifacts"))
TIMEOUT = 600


def _headers() -> dict[str, str]:
    h = {"Accept": "application/vnd.github+json"}
    tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    return h


def latest_snapshot() -> dict:
    r = requests.get(
        f"https://api.github.com/repos/{REPO}/releases?per_page=50",
        headers=_headers(), timeout=60,
    )
    r.raise_for_status()
    snaps = [rel for rel in r.json() if str(rel.get("tag_name", "")).startswith("snapshot-")]
    if not snaps:
        raise SystemExit("no snapshot-* releases found; run the Export Snapshot workflow first")
    snaps.sort(key=lambda x: x["created_at"], reverse=True)
    return snaps[0]


def download_assets(rel: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"snapshot: {rel['tag_name']} ({len(rel['assets'])} assets)", flush=True)
    for asset in rel["assets"]:
        dest = OUT / asset["name"]
        print(f"  ↓ {asset['name']} ({asset['size'] / 1e6:.1f} MB)", flush=True)
        with requests.get(
            asset["url"],
            headers={**_headers(), "Accept": "application/octet-stream"},
            stream=True, timeout=TIMEOUT,
        ) as resp:
            resp.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in resp.iter_content(1 << 20):
                    f.write(chunk)


def main() -> int:
    rel = latest_snapshot()
    download_assets(rel)
    print("→ loader.main", flush=True)
    return subprocess.call([sys.executable, "-m", "loader.main", "--artifacts", str(OUT)])


if __name__ == "__main__":
    raise SystemExit(main())
