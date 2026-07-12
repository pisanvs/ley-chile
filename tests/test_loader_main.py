from schemas.snapshot import Manifest


def _m(version="v2", seq=5):
    return Manifest(snapshot_version=version, watermark="2026-06-01",
                    last_delta_seq=seq, shards=[])


def test_first_run_always_loads():
    from loader.main import should_load
    assert should_load(_m(), None) is True


def test_loads_when_delta_seq_advanced():
    from loader.main import should_load
    assert should_load(_m(seq=5), ("2026-06-01", "v2", 4)) is True


def test_skips_when_already_current():
    from loader.main import should_load
    assert should_load(_m(seq=5), ("2026-06-01", "v2", 5)) is False


def test_reloads_when_snapshot_version_changed():
    """A schema change republishes a full snapshot under a new version."""
    from loader.main import should_load
    assert should_load(_m(version="v3", seq=0), ("2026-06-01", "v2", 9)) is True


def test_revalidate_posts_changed_normas():
    from loader.main import revalidate
    seen = {}

    def fake_post(url, json, headers, timeout):
        seen.update(url=url, json=json, headers=headers)
        class R:
            status_code = 200
        return R()

    assert revalidate("https://x/api/revalidate", "tok", [1, 2], post=fake_post) is True
    assert seen["json"] == {"idNormas": [1, 2]}
    assert seen["headers"]["Authorization"] == "Bearer tok"


def test_revalidate_reports_failure_without_raising():
    from loader.main import revalidate

    def fake_post(url, json, headers, timeout):
        class R:
            status_code = 503
        return R()

    assert revalidate("https://x", "tok", [1], post=fake_post) is False


def test_revalidate_with_no_normas_is_a_noop():
    from loader.main import revalidate

    def explode(*a, **k):
        raise AssertionError("must not POST for an empty list")

    assert revalidate("https://x", "tok", [], post=explode) is True
