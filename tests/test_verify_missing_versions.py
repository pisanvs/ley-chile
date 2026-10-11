"""Cached versions of an already-built norma must have a commit.

The pure comparison behind the `historial.versions_missing` report. Catches the
silent case: a norma is in historial, its cache looks complete and the
watermark advances, but some of its versions never produced a commit, so it
keeps serving an older text.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import verify_pipeline as vp  # noqa: E402

HOY = "2026-09-17"
DIR = "dfl/ministerio-de-educaci-n/2"
META = {DIR: "1014974"}


def test_cached_version_without_commit_is_reported():
    total, issues = vp.missing_versions(
        cached={"1014974": {"2010-07-02", "2026-02-11", "2026-07-01"}},
        committed={DIR: {"2010-07-02", "2026-02-11"}},
        meta_by_dir=META,
        today=HOY,
    )
    assert total == 1
    assert len(issues) == 1
    assert "1014974" in issues[0] and "2026-07-01" in issues[0]


def test_future_version_is_not_reported():
    """Deferred vigencia listed and cached ahead of time: not missing yet."""
    total, issues = vp.missing_versions(
        cached={"1014974": {"2010-07-02", "2027-01-01"}},
        committed={DIR: {"2010-07-02"}},
        meta_by_dir=META,
        today=HOY,
    )
    assert (total, issues) == (0, [])


def test_norma_with_no_commits_is_skipped():
    """Not built yet — already covered by the buildable/norma_dirs counts."""
    total, issues = vp.missing_versions(
        cached={"1014974": {"2010-07-02", "2026-02-11"}},
        committed={},
        meta_by_dir=META,
        today=HOY,
    )
    assert (total, issues) == (0, [])


def test_complete_norma_reports_nothing():
    total, issues = vp.missing_versions(
        cached={"1014974": {"2010-07-02", "2026-02-11"}},
        committed={DIR: {"2010-07-02", "2026-02-11"}},
        meta_by_dir=META,
        today=HOY,
    )
    assert (total, issues) == (0, [])


def test_commits_beyond_the_cache_are_not_an_error():
    """A commit dated by its modifier can sit outside the cached version dates."""
    total, issues = vp.missing_versions(
        cached={"1014974": {"2010-07-02"}},
        committed={DIR: {"2010-07-02", "2015-05-05"}},
        meta_by_dir=META,
        today=HOY,
    )
    assert (total, issues) == (0, [])


def test_issue_list_is_capped_but_total_is_not():
    cached = {str(i): {"2020-01-01", "2021-01-01"} for i in range(30)}
    committed = {f"leyes/{i}": {"2020-01-01"} for i in range(30)}
    meta = {f"leyes/{i}": str(i) for i in range(30)}
    total, issues = vp.missing_versions(
        cached=cached, committed=committed, meta_by_dir=meta, today=HOY, limit=20
    )
    assert total == 30
    assert len(issues) == 20
