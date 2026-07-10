import json
from pathlib import Path

from measure_phase0 import Coverage, _iter_textos, classify, doc_rate, main


def test_classify_markdown():
    assert classify("#### Artículo 1º\nCuerpo.") == "md"


def test_classify_inline():
    assert classify("Artículo 1°.- Cuerpo.") == "inline"


def test_classify_doc_fallback():
    assert classify("Sin artículos aquí.") == "doc"


def test_doc_rate():
    c = Coverage(tipo="ley", total=10, md=7, inline=2, doc=1)
    assert doc_rate(c) == 0.1


def test_doc_rate_of_empty_is_zero():
    assert doc_rate(Coverage(tipo="res", total=0, md=0, inline=0, doc=0)) == 0.0


MD_TEXT = "#### Artículo 1º\nCuerpo."
DOC_TEXT = "Sin artículos aquí."


def _make_norma(root: Path, idx: int, tipo: str, text: str, *, meta: str | None = None) -> None:
    d = root / f"norma-{idx}"
    d.mkdir()
    (d / "texto.md").write_text(text, encoding="utf-8")
    if meta is None:
        meta = json.dumps({"tipo": tipo})
    (d / "metadata.json").write_text(meta, encoding="utf-8")


def test_main_no_leyes_fails_closed(tmp_path, monkeypatch, capsys):
    """No `ley` row at all (e.g. wrong --historial path, or a corpus of only
    administrative normas) must fail closed with a distinct NO EVIDENCE message,
    not silently GATE PASSED."""
    for i in range(3):
        _make_norma(tmp_path, i, "res", MD_TEXT)

    monkeypatch.setattr("sys.argv", ["measure_phase0.py", "--historial", str(tmp_path)])
    assert main() == 1

    out = capsys.readouterr().out
    assert "NO EVIDENCE" in out
    assert "no normas with tipo='ley'" in out
    assert "GATE PASSED" not in out


def test_main_all_metadata_unparseable_fails_closed(tmp_path, monkeypatch, capsys):
    """Every metadata.json is unparseable -> every norma classifies as
    tipo='unknown' -> no 'ley' row exists -> gate must fail closed."""
    for i in range(3):
        _make_norma(tmp_path, i, "ley", MD_TEXT, meta="{not valid json")

    monkeypatch.setattr("sys.argv", ["measure_phase0.py", "--historial", str(tmp_path)])
    assert main() == 1

    out = capsys.readouterr().out
    assert "NO EVIDENCE" in out


def test_iter_textos_unknown_tipo_is_defensive(tmp_path):
    """Missing, invalid, non-dict, or non-UTF-8 metadata.json must never crash
    the run -- they should all yield tipo == 'unknown'."""
    missing = tmp_path / "missing-metadata"
    missing.mkdir()
    (missing / "texto.md").write_text(MD_TEXT, encoding="utf-8")

    invalid_json = tmp_path / "invalid-json"
    invalid_json.mkdir()
    (invalid_json / "texto.md").write_text(MD_TEXT, encoding="utf-8")
    (invalid_json / "metadata.json").write_text("{not json", encoding="utf-8")

    top_level_array = tmp_path / "top-level-array"
    top_level_array.mkdir()
    (top_level_array / "texto.md").write_text(MD_TEXT, encoding="utf-8")
    (top_level_array / "metadata.json").write_text("[1, 2, 3]", encoding="utf-8")

    bad_utf8 = tmp_path / "bad-utf8"
    bad_utf8.mkdir()
    (bad_utf8 / "texto.md").write_text(MD_TEXT, encoding="utf-8")
    (bad_utf8 / "metadata.json").write_bytes(b"\xff\xfe\x00\x01garbage")

    results = list(_iter_textos(tmp_path, sample=0))
    assert len(results) == 4
    assert {tipo for tipo, _ in results} == {"unknown"}


def test_main_healthy_corpus_under_threshold_passes(tmp_path, monkeypatch, capsys):
    for i in range(19):
        _make_norma(tmp_path, i, "ley", MD_TEXT)
    _make_norma(tmp_path, 19, "ley", DOC_TEXT)  # 1/20 = 5% <= 10% threshold

    monkeypatch.setattr("sys.argv", ["measure_phase0.py", "--historial", str(tmp_path)])
    assert main() == 0

    out = capsys.readouterr().out
    assert "GATE PASSED" in out


def test_main_corpus_over_threshold_stops(tmp_path, monkeypatch, capsys):
    for i in range(8):
        _make_norma(tmp_path, i, "ley", MD_TEXT)
    for i in range(8, 10):
        _make_norma(tmp_path, i, "ley", DOC_TEXT)  # 2/10 = 20% > 10% threshold

    monkeypatch.setattr("sys.argv", ["measure_phase0.py", "--historial", str(tmp_path)])
    assert main() == 1

    out = capsys.readouterr().out
    assert "STOP" in out
