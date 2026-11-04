import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import procedure_pages as pp  # noqa: E402
from test_build_web import mep, vote  # noqa: E402

LABEL = "2023/0447(COD)"


def pvote(vid, date, is_main=True, description=None):
    v = vote(vid, date, [(1, "FOR"), (2, "AGAINST")], is_main=is_main, description=description)
    v["procedure"] = {"reference": LABEL, "title": "MOCK english title", "type": "COD"}
    return v


def write(d: Path, name: str, obj) -> None:
    (d / name).write_text(json.dumps(obj), encoding="utf-8")


def test_slug_and_url():
    assert pp.slug(LABEL) == "2023-0447-COD"
    assert pp.procedure_url(LABEL, "../") == "../z/2023-0447-COD"
    assert pp.slug("MOCK") is None and pp.slug(["2025/0803(CNS)"]) is None


def test_collect_merges_votes_proposals_and_state(tmp_path):
    write(
        tmp_path,
        "proposals.json",
        {
            "items": [
                {
                    "kind": "procedure",
                    "label": "2025/0001(COD)",
                    "title": {"cs": "MOCK bez hlasování", "en": None},
                    "participants": [{"mep_id": 1, "role": "RAPPORTEUR"}],
                    "events": [],
                    "committee": "AGRI",
                }
            ]
        },
    )
    write(
        tmp_path,
        "proposals_state.json",
        {
            "procedures": {
                "2023-0447": {
                    "label": LABEL,
                    "title_cs": "MOCK český název",
                    "committee": "ENVI",
                    "events": [{"date": "2023-12-01", "type": "REFERRAL"}],
                },
                "2025-0803": {"label": ["2025/0803(CNS)", "2025/0803(NLE)"], "title_cs": "MOCK dvě čísla"},
            }
        },
    )
    rows = pp.collect(tmp_path, [pvote(2, "2024-10-01"), pvote(1, "2024-09-16")])
    assert set(rows) == {LABEL, "2025/0001(COD)"}
    r = rows[LABEL]
    assert r["title_cs"] == "MOCK český název" and r["committee"] == "ENVI" and r["fetched"]
    assert [v["id"] for v in r["votes"]] == [1, 2]  # chronologicky
    assert rows["2025/0001(COD)"]["votes"] == [] and rows["2025/0001(COD)"]["participants"]


def test_page_with_events_trace_and_votes(tmp_path):
    write(
        tmp_path,
        "proposals_state.json",
        {
            "procedures": {
                "2023-0447": {
                    "label": LABEL,
                    "title_cs": "MOCK český název",
                    "committee": "ENVI",
                    "events": [
                        {"date": "2023-12-01", "type": "REFERRAL"},
                        {"date": "2024-09-16", "type": "PLENARY_VOTE"},
                        {"date": "2024-09-17", "type": "MOCK_UNKNOWN"},
                    ],
                }
            }
        },
    )
    meps = {m["id"]: m for m in (mep(1), mep(2))}
    votes = [pvote(1, "2024-09-16", description="Návrh Komise"), pvote(2, "2024-09-16", is_main=False, description="PN 5")]
    row = pp.collect(tmp_path, votes)[LABEL]
    path, html = pp.procedure_page(row, meps, {"1": [{"mep_id": 2, "role": "shadow"}]}, {1}, None)
    assert path == "z/2023-0447-COD.html"
    assert "<h1>MOCK český název</h1>" in html and "řádný legislativní postup" in html and "výbor ENVI" in html
    assert 'class="rd-steps"' in html and "přiděleno výboru" in html
    assert "jiný krok (MOCK_UNKNOWN)" in html  # neznámý typ se nepřekládá odhadem
    assert 'href="../p/2"' in html and "stínový/á zpravodaj/ka" in html  # česká stopa z rolí u hlasování
    assert 'href="../v/1"' in html and "vote?id=2" in html  # závěrečné na v/, dílčí na interaktivní detail
    assert "Pozměňovací návrhy a dílčí hlasování (1)" in html
    assert "oeil.secure.europarl.europa.eu" in html and "data.europarl.europa.eu/api/v2/procedures/2023-0447" in html


def test_page_without_source_data_says_so(tmp_path):
    meps = {1: mep(1), 2: mep(2)}
    row = pp.collect(tmp_path, [pvote(1, "2024-09-16")])[LABEL]
    _, html = pp.procedure_page(row, meps, {}, set(), None)
    assert "zatím nemáme načtený" in html and "Plénum o ní hlasovalo: 16. 9. 2024" in html
    assert "Role poslanců u této procedury zatím nemáme načtené" in html  # bez dat netvrdíme, že česká stopa není


def test_process_effect_covers_every_type_and_timeline_split():
    """Každý typ procedury má schválenou větu „CO TO ZNAMENÁ“; časovou osu mají jen zákony a postupy s událostmi."""
    assert set(pp.PROCESS_TYPE_CS) <= set(pp.PROCESS_EFFECT_CS)
    assert all(t.endswith(".") and len(t) < 140 for t in pp.PROCESS_EFFECT_CS.values())
    assert pp.TIMELINE_TYPES == {"COD", "CNS", "APP", "NLE", "BUD", "BUI", "DEC", "INL"}
    assert "INI" not in pp.TIMELINE_TYPES and "RSP" not in pp.TIMELINE_TYPES


def test_card_steps_marks_now_and_shortens():
    steps = [{"label": f"MOCK {i}", "date": f"2026-0{i}-01"} for i in range(1, 8)] + [{"label": "MOCK budoucí", "date": None}]
    out = pp.card_steps(steps)
    assert len(out) == pp.CARD_STEPS
    assert out[0]["label"] == "MOCK 1" and out[1]["state"] == "gap"
    assert [x["state"] for x in out[-2:]] == ["now", "next"] and out[-1]["date"] is None
    short = pp.card_steps(steps[:2])
    assert [x["state"] for x in short] == ["done", "now"]


def test_next_text_from_future_steps_only():
    steps = [
        {"label": "Přiděleno výboru", "date": "2026-01-01"},
        {"label": "Hlasování pléna", "date": None},
        {"label": "Podpis a vyhlášení", "date": None},
    ]
    assert pp.next_text(steps) == "Co bude dál: Hlasování pléna, pak podpis a vyhlášení."
    assert pp.next_text(steps[:1]) is None
