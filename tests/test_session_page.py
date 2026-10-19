"""Stránka Zasedání (scripts/session_page.py): co se rozhoduje, výběr pravidlem, „minule“ a výsledky z dat."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import session_page as sp  # noqa: E402


def ev(*pairs):
    return [{"date": d, "type": t} for d, t in pairs]


def item(iid, label=None, ptype=None, cz=(), docs=(), date="2026-10-20", title="MOCK"):
    return {
        "id": iid,
        "date": date,
        "title_cs": title,
        "docs": list(docs),
        "cz": [{"mep_id": 1, "name": "MOCK", "role": r, "role_cs": r} for r in cz],
        "procedure": {"label": label, "type": ptype} if label else None,
        "committee": None,
    }


def test_decision_from_procedure_type_and_events():
    cod = item("a", "2025/0001(COD)", "COD")
    assert sp.decision(cod, None) == sp.COD_UNKNOWN  # průběh neznáme: nic nedomýšlíme
    assert sp.decision(cod, ev(("2026-01-01", "REFERRAL"))) == sp.COD_FIRST
    agreement = ev(("2026-04-29", "PLENARY_AMEND"), ("2026-07-14", "COMMITTEE_APPROVE_PROVISIONAL_AGREEMENT"))
    assert sp.decision(cod, agreement) == sp.COD_AGREEMENT
    assert sp.decision(cod, ev(("2024-03-13", "PLENARY_ADOPT_POSITION"))) == sp.COD_AGAIN
    assert sp.decision(item("b", "2026/2027(INI)", "INI"), None)[0] == "Zpráva z vlastního podnětu"
    assert sp.decision(item("c", title="Námitka podle čl. 114 odst. 3 jednacího řádu: MOCK"), None) == sp.OBJECTION
    assert sp.decision(item("d", title="MOCK usnesení"), None) is None


def test_doc_reference_matches_howtheyvote():
    assert sp.doc_reference("A-10-2026-0265") == "A10-0265/2026"
    assert sp.doc_reference("B-10-2026-0471") == "B10-0471/2026"
    assert sp.doc_reference("C-10-2025-0324") is None


def cz_vote(vid, date, ref, kind="final", result="ADOPTED", reference=None, positions=("FOR", "AGAINST")):
    return {
        "id": vid,
        "date": date,
        "vote_kind": kind,
        "result": result,
        "is_main": True,
        "reference": reference,
        "procedure": {"reference": ref},
        "cz_positions": [{"member_id": i + 1, "position": p} for i, p in enumerate(positions)],
    }


MEPS = {i: {"id": i, "mandates": [{"start": "2024-07-16", "end": None}]} for i in (1, 2)}


def test_session_view_picks_previous_and_results():
    radar = {
        "session": {
            "from": "2026-10-19",
            "to": "2026-10-22",
            "items": [
                item("x", "2026/2027(INI)", "INI"),  # bez české role a nelegislativní: mimo výběr
                item("cod", "2025/0531(COD)", "COD"),
                item("cz", "2025/2121(INI)", "INI", cz=("rapporteur",)),
                item("res", None, None, docs=("A-10-2026-0265",), date="2026-10-21"),
            ],
        }
    }
    proposals = {
        "items": [{"kind": "procedure", "label": "2025/0531(COD)", "events": ev(("2026-07-14", "COMMITTEE_APPROVE_PROVISIONAL_AGREEMENT"))}]
    }
    votes = [
        cz_vote(1, "2026-04-29", "2025/0531(COD)"),
        cz_vote(2, "2026-04-29", "2025/0531(COD)", kind="amendment"),  # pozměňovací návrh do „minule“ nepatří
        cz_vote(3, "2026-10-21", None, reference="A10-0265/2026", result="REJECTED"),
    ]
    view = sp.session_view(radar, proposals, votes, MEPS, {"items": {"2025/0531(COD)": {"shrnuti": "MOCK shrnutí"}}})
    by = {i["id"]: i for i in view["items"]}
    assert view["picks"] == ["cod", "cz"]  # zákon 2 + dohoda 1 = zpravodaj 3; při shodě rozhoduje datum a pořadí v programu
    assert by["cod"]["decision"] == sp.COD_AGREEMENT and by["cod"]["summary"] == "MOCK shrnutí"
    assert [v["id"] for v in by["cod"]["previous"]] == [1] and by["cod"]["previous"][0]["cz"] == [1, 1, 0, 0]
    assert [v["id"] for v in by["res"]["results"]] == [3] and view["has_results"]
    assert sp.session_view({}, None, [], MEPS, None) is None


def test_session_body_links_and_ai_label():
    radar = {"session": {"from": "2026-10-19", "to": "2026-10-22", "items": [item("cz", "2025/2121(INI)", "INI", cz=("rapporteur",))]}}
    view = sp.session_view(radar, None, [], MEPS, {"items": {"2025/2121(INI)": {"shrnuti": "MOCK shrnutí"}}})
    html = sp.session_body(view, ["fin"], {"fin": "Rozpočet a finance"})
    assert 'href="z/2025-2121-INI"' in html and "Tento týden se rozhoduje o" in html
    assert 'class="ai-tag"' in html and "o-projektu#zasedani" in html and 'id="rd-cat"' in html


def test_topics_counts_by_committee_category():
    items = [{**item(str(i)), "committee": {"code": "ENVI", "category": c}} for i, c in enumerate(["env", "env", "fin", None])]
    html = sp.topics_html(items, {"env": "Klima, příroda a energie", "fin": "Rozpočet a finance"})
    assert html.index('data-cat="env"') < html.index('data-cat="fin"')  # víc bodů dřív
    assert "Klima, příroda a energie <b>2</b>" in html and 'href="zasedani?c=fin#program"' in html
    assert "1 bodů bez tématu" in html and sp.topics_html([item("x")], {}) == ""
