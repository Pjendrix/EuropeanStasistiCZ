"""Česká stopa na kartě hlasování na úvodu (B4, scripts/hub.py)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import hub  # noqa: E402

GROUPS = [{"code": "EPP", "ep_code": "PPE", "short_label": "EPP"}, {"code": "ECR", "ep_code": "ECR", "short_label": "ECR"}]


def mep(i, gender="MALE", group="PPE", photo=True):
    return {
        "id": i,
        "name": f"MOCK {i}",
        "gender": gender,
        "photo_url": "x" if photo else None,
        "groups": [{"code": group, "start": "2024-07-16", "end": None}],
    }


def test_trace_row_roles_order_and_more():
    meps = {1: mep(1), 2: mep(2, "FEMALE", "ECR"), 3: mep(3, photo=False)}
    vote = {
        "id": 9,
        "date": "2026-10-08",
        "trace": [
            {"mep_id": 3, "name": "C Třetí", "role": "shadow"},
            {"mep_id": 2, "name": "B Druhá", "role": "shadow"},
            {"mep_id": 1, "name": "A První", "role": "rapporteur"},
        ],
    }
    html = hub.trace_html(vote, meps, GROUPS)
    # zpravodaj první, pak stínoví abecedně; nejvýš dva, zbytek „a další 1“ s odkazem na detail
    assert html.index("A První") < html.index("B Druhá") and "C Třetí" not in html
    nt = '<span translate="no" class="notranslate">'  # jméno a frakce se strojově nepřekládají
    assert f"<b>Zpravodaj:</b> {nt}A První (EPP)</span>" in html and f"<b>Stínová zpravodajka:</b> {nt}B Druhá (ECR)</span>" in html
    assert 'href="p/1"' in html and "thumbs/1.webp" in html and 'href="v/9#ceska-stopa">a další 1<' in html


def test_no_trace_no_row():
    assert hub.trace_html({"id": 1, "date": "2026-10-08", "trace": []}, {}, GROUPS) == ""
    assert hub.trace_html({"id": 1, "date": "2026-10-08"}, {}, GROUPS) == ""
