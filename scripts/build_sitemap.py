"""Generate sitemap.xml from catalog.json for ley·chile."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from xml.etree import ElementTree as ET

SITE_BASE = "https://pisanvs.github.io/ley-chile"
NS = "http://www.sitemaps.org/schemas/sitemap/0.9"


def build_sitemap(catalog_path: str, out_path: str) -> None:
    data = json.loads(Path(catalog_path).read_text())
    entries = data.get("entries", data) if isinstance(data, dict) else data

    ET.register_namespace("", NS)
    root = ET.Element(f"{{{NS}}}urlset")

    def add_url(loc: str, changefreq: str, priority: str) -> None:
        el = ET.SubElement(root, f"{{{NS}}}url")
        ET.SubElement(el, f"{{{NS}}}loc").text = loc
        ET.SubElement(el, f"{{{NS}}}changefreq").text = changefreq
        ET.SubElement(el, f"{{{NS}}}priority").text = priority

    add_url(SITE_BASE + "/", "weekly", "1.0")
    for entry in entries:
        id_norma = entry.get("idNorma") or entry.get("id_norma")
        if id_norma is None:
            continue
        add_url(f"{SITE_BASE}/ley/{id_norma}", "monthly", "0.8")

    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    tree.write(out_path, encoding="unicode", xml_declaration=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="catalog.json")
    parser.add_argument("--out", default="web/public/sitemap.xml")
    args = parser.parse_args()
    build_sitemap(args.catalog, args.out)
    print(f"Wrote {args.out}")
