"""Python and TypeScript segmentation must produce identical output.

Both sides assert against tests/fixtures/segment_expected.json. Regenerate it
from TypeScript with:  cd web && UPDATE_GOLDEN=1 pnpm vitest run src/lib/segment.golden.test.ts
"""
import json
from pathlib import Path

from segment import segment, canonical_text

_FIXTURES = Path(__file__).parent / "fixtures"


def _to_ts_shape(segs) -> list[dict]:
    """Python uses snake_case; the golden file uses the TypeScript camelCase keys."""
    return [
        {"label": s.label, "slug": s.slug, "rawHeading": s.raw_heading, "body": s.body}
        for s in segs
    ]


def test_python_matches_typescript_golden():
    corpus = json.loads((_FIXTURES / "segment_corpus.json").read_text(encoding="utf-8"))
    expected = json.loads((_FIXTURES / "segment_expected.json").read_text(encoding="utf-8"))

    assert {f["name"] for f in corpus} == set(expected), "corpus and golden disagree on fixtures"

    for fixture in corpus:
        segs = segment(fixture["text"])
        want = expected[fixture["name"]]
        assert _to_ts_shape(segs) == want["segments"], f"segments differ for {fixture['name']}"
        assert canonical_text(segs) == want["canonical"], f"canonical differs for {fixture['name']}"
