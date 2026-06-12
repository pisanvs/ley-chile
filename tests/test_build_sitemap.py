import json
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

from scripts.build_sitemap import build_sitemap, SITE_BASE


def make_catalog(tmp_path: Path, entries: list) -> Path:
    p = tmp_path / "catalog.json"
    p.write_text(json.dumps({"entries": entries}))
    return p


def test_sitemap_includes_homepage(tmp_path):
    catalog = make_catalog(tmp_path, [])
    out = tmp_path / "sitemap.xml"
    build_sitemap(str(catalog), str(out))
    tree = ET.parse(out)
    locs = [u.find('{http://www.sitemaps.org/schemas/sitemap/0.9}loc').text
            for u in tree.getroot()]
    assert SITE_BASE + "/" in locs


def test_sitemap_includes_norma(tmp_path):
    catalog = make_catalog(tmp_path, [{"idNorma": 12345, "tipo": "ley"}])
    out = tmp_path / "sitemap.xml"
    build_sitemap(str(catalog), str(out))
    tree = ET.parse(out)
    locs = [u.find('{http://www.sitemaps.org/schemas/sitemap/0.9}loc').text
            for u in tree.getroot()]
    assert SITE_BASE + "/ley/12345" in locs


def test_sitemap_empty_entries(tmp_path):
    catalog = make_catalog(tmp_path, [])
    out = tmp_path / "sitemap.xml"
    build_sitemap(str(catalog), str(out))
    tree = ET.parse(out)
    locs = [u.find('{http://www.sitemaps.org/schemas/sitemap/0.9}loc').text
            for u in tree.getroot()]
    assert locs == [SITE_BASE + "/"]


def test_sitemap_valid_xml(tmp_path):
    catalog = make_catalog(tmp_path, [{"idNorma": 1, "tipo": "ley"}])
    out = tmp_path / "sitemap.xml"
    build_sitemap(str(catalog), str(out))
    ET.parse(out)  # raises if invalid


def test_sitemap_skips_entries_without_id(tmp_path):
    catalog = make_catalog(tmp_path, [{"tipo": "ley"}, {"idNorma": 99, "tipo": "dl"}])
    out = tmp_path / "sitemap.xml"
    build_sitemap(str(catalog), str(out))
    tree = ET.parse(out)
    locs = [u.find('{http://www.sitemaps.org/schemas/sitemap/0.9}loc').text
            for u in tree.getroot()]
    assert SITE_BASE + "/ley/99" in locs
    assert len([l for l in locs if "/ley/" in l]) == 1
