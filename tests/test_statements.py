import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import statements as stm  # noqa: E402

OK = {"mep_id": 1, "scope": "metric:attendance", "text": "MOCK vyjádření", "date": "2026-10-25", "source": "https://example.org/x"}


def test_validate_ok_and_errors():
    assert stm.validate([OK, {**OK, "scope": 198947}], {1}) == []
    errs = stm.validate(
        [{**OK, "mep_id": 9}, {**OK, "scope": "metric:xyz"}, {**OK, "text": "x" * 301}, {**OK, "date": "25. 10."}, {"mep_id": 1}],
        {1},
    )
    assert len(errs) == 5


def test_html_has_label_and_escapes():
    html = stm.html([{**OK, "text": "<b>MOCK</b>"}])
    assert stm.LABEL in html and "&lt;b&gt;" in html and 'href="https://example.org/x"' in html
    assert stm.html([]) == ""


def test_for_scope():
    items = [OK, {**OK, "mep_id": 2}, {**OK, "scope": 5}]
    assert stm.for_scope(items, 1, "metric:attendance") == [OK]
    assert len(stm.for_scope(items, None, 5)) == 1


def test_repo_file_valid():
    root = Path(__file__).resolve().parent.parent / "data"
    import json

    meps = {m["id"] for m in json.loads((root / "meps.json").read_text(encoding="utf-8"))["meps"]}
    assert stm.validate(stm.load(root), meps) == []
