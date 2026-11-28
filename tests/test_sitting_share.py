"""Karusel zasedání ke sdílení (scripts/sitting_share.py): snímky podle dat, čísla z kódu, strany k datu hlasování."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import news  # noqa: E402
import sitting_share as ss  # noqa: E402


def mep(i, party):
    return {
        "id": 900000 + i,
        "name": f"MOCK {i}",
        "given_name": "MOCK",
        "family_name": f"Poslanec{i}",
        "sort_label": f"Poslanec{i}",
        "mandates": [{"start": "2024-07-16", "end": None}],
        "photo_url": "x" if i == 1 else None,
        "_party": party,
    }


MEPS = [mep(i, "A" if i <= 3 else "B") for i in range(1, 7)]
BY_ID = {m["id"]: m for m in MEPS}
PARTIES = [
    {"id": 1, "short_label": "MOCK-A", "chart_color": "#123456", "logo": None},
    {"id": 2, "short_label": "MOCK-B", "chart_color": "#654321", "logo": None},
]
GROUPS = [{"code": "EPP", "short_label": "EPP"}]


def vote(i, positions, result="ADOPTED", date="2026-11-12"):
    return {
        "id": i,
        "date": date,
        "title_cs": f"MOCK hlasování {i}",
        "vote_kind": "final",
        "is_main": True,
        "result": result,
        "counts": {"for": 400, "against": 200, "abstention": 10, "did_not_vote": 30},
        "group_counts": {},
        "cz_positions": [
            {
                "member_id": m["id"],
                "position": pos,
                "national_party_id": 1 if m["_party"] == "A" else 2,
                "national_party": f"MOCK-{m['_party']}",
                "group_code": "EPP",
            }
            for m, pos in zip(MEPS, positions, strict=True)
        ],
    }


SPLIT = vote(1, ["FOR"] * 3 + ["AGAINST"] * 3)
UNITED = vote(2, ["FOR"] * 5 + ["DID_NOT_VOTE"])
REJECTED = vote(3, ["AGAINST"] * 6, result="REJECTED", date="2026-11-11")
ROLES = {
    "2": [{"mep_id": 900002, "role": "shadow"}, {"mep_id": 900001, "role": "rapporteur"}],
    "1": [{"mep_id": 999999, "role": "rapporteur"}],  # poslanec mimo meps.json se nepočítá
}


def block(votes, roles=ROLES):
    days = sorted({v["date"] for v in votes})
    return news.session_block(days, votes, BY_ID, roles)


def test_all_slides_and_numbers_from_code():
    d = ss.sitting_data(block([SPLIT, UNITED, REJECTED]), BY_ID, PARTIES, GROUPS, ROLES)
    assert d["slides"] == ["overview", "main", "split", "trace"]
    assert (d["finals"], d["adopted"], d["rejected"]) == (3, 2, 1)
    assert d["when"] == "11.–12.\u00a011.\u00a02026" and d["splits"] == 1
    # Češi rozdělení: strany k datu hlasování a jejich hlasy (pro, proti, zdržel, nehlasoval)
    [sp] = d["split"]
    assert sp["id"] == 1 and sp["cz"] == [3, 3, 0, 0]
    assert {p["label"]: p["counts"] for p in sp["parties"]} == {"MOCK-A": [3, 0, 0, 0], "MOCK-B": [0, 3, 0, 0]}
    # česká stopa: jen poslanci z meps.json, zpravodaj před stínovým, portrét jen když ho EP má
    [tr] = d["traceItems"]
    assert tr["id"] == 2 and [p["id"] for p in tr["people"]] == [900001, 900002]
    assert tr["people"][0]["name"] == "MOCK Poslanec1" and tr["people"][0]["photoUrl"] == "assets/photos/thumbs/900001.webp"
    assert tr["people"][1]["photoUrl"] is None
    assert all(len(v["ep"]) == 4 and len(v["cz"]) == 4 for v in d["main"])


def test_slides_without_data_are_left_out():
    d = ss.sitting_data(block([UNITED, REJECTED], roles={}), BY_ID, PARTIES, GROUPS, {})
    assert d["slides"] == ["overview", "main"] and d["split"] == [] and d["traceItems"] == []


def test_context_for_share_panel():
    d = ss.sitting_data(block([SPLIT, UNITED]), BY_ID, PARTIES, GROUPS, ROLES)
    ctx = ss.sitting_context(d, "aktualne#zasedani-2026-11-12", "2026-11-21")
    assert ctx["kind"] == "sitting" and ctx["path"] == "aktualne#zasedani-2026-11-12"
    assert ctx["data"]["dataDay"] == "2026-11-21" and ctx["filename"] == "ep-watch-zasedani-2026-11-12"
    assert "Zdroj" in ctx["text"] and "ne redakcí" in ctx["trust"]
