"""Přijaté texty z EP Open Data (B1, scripts/adopted_texts.py): párování, úryvek, doplnění odkazu."""

import io
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import adopted_texts as at  # noqa: E402


def test_ids():
    assert at.doc_id("A10-0241/2026") == "A-10-2026-0241"
    assert at.doc_id("RC-B10-0452/2026") == "RC-10-2026-0452"
    assert at.doc_id(None) is None
    assert at.proc_id("2026/2868(RSP)") == "2026-2868" and at.proc_id("x") is None
    assert at.ta_reference("TA-10-2026-0342") == "P10_TA(2026)0342"


def test_match_by_date_and_document():
    tas = {
        "TA-10-2026-0001": {"date": "2026-10-08", "adopts": ["B-10-2026-0424"]},
        "TA-10-2026-0002": {"date": "2026-10-08", "adopts": ["B-10-2026-0430"]},
        "TA-10-2025-0168": {"date": "2025-06-01", "adopts": ["A-10-2025-0100"]},
    }
    assert at.match({"date": "2026-10-08", "reference": "B10-0430/2026"}, tas) == "TA-10-2026-0002"
    assert at.match({"date": "2026-10-08", "reference": "A10-9999/2026"}, tas) is None  # dva texty toho dne, žádný nesedí
    one = {"TA-10-2025-0168": tas["TA-10-2025-0168"]}
    assert at.match({"date": "2025-06-01", "reference": None}, one) == "TA-10-2025-0168"  # jediný text toho dne
    assert at.match({"date": "2026-06-18", "reference": "A10-0100/2025"}, one) is None  # 1. čtení jiný den: ne


class FakeClient:
    def __init__(self):
        self.calls = []

    def get(self, path, params=None):
        self.calls.append(path)
        if path == "procedures/2026-2868":
            return {"data": [{"id": "x", "created_a_realization_of": ["eli/dl/doc/B-10-2026-0424", "eli/dl/doc/TA-10-2026-0342"]}]}
        if path == "adopted-texts/TA-10-2026-0342":
            return {"data": [{"id": "y", "document_date": "2026-10-08", "adopts": ["eli/dl/doc/B-10-2026-0424"]}]}
        raise AssertionError(path)


def vote(i, result="ADOPTED", date="2026-10-08"):
    return {
        "id": i,
        "date": date,
        "reference": "B10-0424/2026",
        "vote_kind": "final",
        "result": result,
        "procedure": {"reference": "2026/2868(RSP)"},
    }


def test_update_matches_and_skips_known_and_rejected():
    c = FakeClient()
    out = at.update([vote(1), vote(2, "REJECTED")], {}, c, "2026-10-17", log=lambda m: None)
    assert out["votes"] == {"1": {"ta": "TA-10-2026-0342", "date": "2026-10-08"}} and out["unmatched"] == {}
    n = len(c.calls)
    at.update([vote(1)], out, c, "2026-10-18", log=lambda m: None)
    assert len(c.calls) == n  # spárované se znovu nedotazuje


def test_apply_overrides_htv_reference(tmp_path):
    (tmp_path / "adopted_texts.json").write_text(
        json.dumps({"votes": {"1": {"ta": "TA-10-2026-0227", "date": "2026-06-18"}}}), encoding="utf-8"
    )
    votes = [{"id": 1, "texts_adopted_reference": "P10_TA(2025)0168"}, {"id": 2, "texts_adopted_reference": None}]
    at.apply(votes, tmp_path)
    assert votes[0]["texts_adopted_reference"] == "P10_TA(2026)0227" and votes[1]["texts_adopted_reference"] is None


def docx(paragraphs):
    w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    body = "".join(f"<w:p><w:r><w:t>{p}</w:t></w:r></w:p>" for p in paragraphs)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", f'<w:document xmlns:w="{w}"><w:body>{body}</w:body></w:document>')
    return buf.getvalue()


def test_docx_text_and_excerpt_is_deterministic_and_capped():
    paras = at.docx_text(docx(["MOCK Usnesení", "– s ohledem na článek 2 Smlouvy", "A. vzhledem k tomu, že MOCK", "1. vyzývá Komisi"]))
    assert paras == ["MOCK Usnesení", "– s ohledem na článek 2 Smlouvy", "A. vzhledem k tomu, že MOCK", "1. vyzývá Komisi"]
    ex = at.excerpt(paras)
    assert "s ohledem na" not in ex and "vzhledem k tomu" in ex and "vyzývá Komisi" in ex
    long = ["x" * 1000] * 100
    cut = at.excerpt(long, limit=5000)
    assert len(cut) <= 5000 and cut == at.excerpt(long, limit=5000)
