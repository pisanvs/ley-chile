"""Tests for update_readme_status.py."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import update_readme_status as urs

START = "<!-- PIPELINE_STATUS_START -->"
END = "<!-- PIPELINE_STATUS_END -->"

SAMPLE_STATS = {
    "W": "1997-03-15",
    "D": "2001-06-20",
    "total": 100,
    "cached": 74,
    "historial_count": 58,
}


def _readme(tmp_path: Path, body: str = "old content") -> Path:
    p = tmp_path / "README.md"
    p.write_text(f"# Title\n\n{START}\n{body}\n{END}\n\n## More\n", encoding="utf-8")
    return p


def test_render_bar_empty():
    assert urs.render_bar(0.0) == "░" * 20


def test_render_bar_full():
    assert urs.render_bar(1.0) == "█" * 20


def test_render_bar_half():
    assert urs.render_bar(0.5) == "█" * 10 + "░" * 10


def test_update_replaces_content_between_markers(tmp_path):
    readme = _readme(tmp_path)
    urs.update_readme_status(readme, SAMPLE_STATS)
    content = readme.read_text(encoding="utf-8")
    assert "old content" not in content
    assert START in content
    assert END in content


def test_update_contains_watermark_date(tmp_path):
    readme = _readme(tmp_path)
    urs.update_readme_status(readme, SAMPLE_STATS)
    assert "1997-03-15" in readme.read_text(encoding="utf-8")


def test_update_contains_percentages(tmp_path):
    readme = _readme(tmp_path)
    urs.update_readme_status(readme, SAMPLE_STATS)
    content = readme.read_text(encoding="utf-8")
    assert "58%" in content   # historial 58/100
    assert "74%" in content   # cache 74/100


def test_update_preserves_content_outside_markers(tmp_path):
    readme = _readme(tmp_path)
    urs.update_readme_status(readme, SAMPLE_STATS)
    content = readme.read_text(encoding="utf-8")
    assert "# Title" in content
    assert "## More" in content


def test_update_raises_if_markers_missing(tmp_path):
    readme = tmp_path / "README.md"
    readme.write_text("# No markers here\n", encoding="utf-8")
    with pytest.raises(ValueError, match="markers not found"):
        urs.update_readme_status(readme, SAMPLE_STATS)


def test_update_zero_total_does_not_divide_by_zero(tmp_path):
    readme = _readme(tmp_path)
    stats = {**SAMPLE_STATS, "total": 0, "cached": 0, "historial_count": 0}
    urs.update_readme_status(readme, stats)  # should not raise
