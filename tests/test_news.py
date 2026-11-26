import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import news  # noqa: E402
from compute_stats import FormatError  # noqa: E402


def feat(i, date="2026-10-20", trace=False, split=False, decisive=False, close=False, turnout=10):
    return {"id": i, "date": date, "trace": trace, "split": split, "decisive": decisive, "close": close, "turnout": turnout}


def test_group_sessions_by_gap():
    days = ["2026-10-22", "2026-10-19", "2026-10-20", "2026-10-08", "2026-10-05", "2026-11-12", "2026-11-11"]
    assert news.group_sessions(days) == [
        ["2026-10-05", "2026-10-08"],
        ["2026-10-19", "2026-10-20", "2026-10-22"],
        ["2026-11-11", "2026-11-12"],
    ]


def test_pick_order_one_per_category_then_priority():
    feats = [
        feat(1, trace=True),
        feat(2, trace=True),
        feat(3, trace=True),
        feat(4, trace=True),
        feat(5, trace=True),
        feat(6, trace=True),
        feat(7, split=True),
        feat(8, decisive=True),
        feat(9, close=True),
        feat(10, turnout=21),
    ]
    ids = [f["id"] for f in news.pick_votes(feats)]
    assert len(ids) == 5
    # pojistka: po jednom ze stopy, rozdělení, rozhodujících a těsných; páté místo podle pořadí (další se stopou)
    assert set(ids) == {6, 5, 7, 8, 9}
    # zobrazené pořadí podle priorit: stopa → rozděleni → rozhodly → těsné; při shodě vyšší id (stejný den)
    assert ids == [6, 5, 7, 8, 9]


def test_pick_priority_and_deterministic_tiebreak():
    feats = [feat(1, turnout=5), feat(2, turnout=20), feat(3, date="2026-10-21", turnout=20), feat(4, split=True, trace=True)]
    ids = [f["id"] for f in news.pick_votes(feats, n=3)]
    assert ids == [4, 3, 2]  # stopa+rozdělení, pak vyšší účast; při shodě účasti novější den
    assert [f["id"] for f in news.pick_votes(list(reversed(feats)), n=3)] == ids  # nezávisí na pořadí vstupu
    assert news.pick_votes([]) == []


def test_fold_reports_main_separately_shadow_by_mep():
    reports = [
        {"type": "report", "kind": "shadow_report", "date": "2026-10-12", "mep_id": 1, "name": "MOCK A"},
        {"type": "report", "kind": "shadow_report", "date": "2026-10-13", "mep_id": 1, "name": "MOCK A"},
        {"type": "report", "kind": "shadow_report", "date": "2026-10-10", "mep_id": 2, "name": "MOCK B"},
        {"type": "report", "kind": "report", "date": "2026-10-11", "mep_id": 2, "name": "MOCK B", "title": "MOCK zpráva"},
    ]
    b = news.fold_reports(reports)
    assert b["from"] == "2026-10-10" and b["to"] == "2026-10-13" and b["shadow_total"] == 3
    assert b["shadow"] == [{"mep_id": 1, "name": "MOCK A", "count": 2}, {"mep_id": 2, "name": "MOCK B", "count": 1}]
    assert [r["title"] for r in b["reports"]] == ["MOCK zpráva"]


MEPS = [
    {
        "id": 1,
        "name": "MOCK A",
        "gender": "FEMALE",
        "mandates": [{"start": "2024-07-16", "end": None}],
        "groups": [
            {"code": "NI", "short_label": "NI", "start": "2024-07-16", "end": "2026-10-20"},
            {"code": "PFE", "short_label": "PfE", "start": "2026-10-21", "end": None},
        ],
        "parties": [],
    },
    {
        "id": 2,
        "name": "MOCK B",
        "mandates": [{"start": "2024-07-16", "end": "2026-09-30"}],
        "groups": [{"code": "EPP", "start": "2024-07-16", "end": None}],
    },
    {
        "id": 3,
        "name": "MOCK C",
        "mandates": [{"start": "2026-10-01", "end": None}],
        "groups": [{"code": "EPP", "start": "2026-10-01", "end": None}],
    },
]


def test_mep_events():
    ev = news.mep_events(MEPS, "2026-08-25", "2026-10-24")
    got = sorted((e["mep_id"], e["kind"], e["date"]) for e in ev)
    # první frakce mandátu (MOCK C) není změna; začátek mandátu v 10. období po 16. 7. 2024 ano
    assert got == [(1, "group", "2026-10-21"), (2, "mandate_end", "2026-09-30"), (3, "mandate_start", "2026-10-01")]
    with pytest.raises(FormatError):
        news.mep_events([{"id": 9}], "2026-08-25", "2026-10-24")


def test_timeline_reports_between_blocks_and_full_sessions():
    vote = lambda i, d: {
        "id": i,
        "date": d,
        "vote_kind": "final",
        "is_main": True,
        "result": "ADOPTED",
        "counts": {"for": 400, "against": 200, "abstention": 10, "did_not_vote": 10},
        "cz_positions": [],
        "group_counts": {},
    }
    votes = [vote(1, "2026-09-14"), vote(2, "2026-10-06"), vote(3, "2026-10-20")]
    own = {"meps": {"1": {"items": [{"type": "shadow_report", "date": "2026-10-12"}, {"type": "question", "date": "2026-10-12"}]}}}
    tl = news.build_timeline(votes, MEPS[:1], own, {}, [], "2026-10-24")
    assert [b["type"] for b in tl] == ["event", "session", "between", "session", "session"]
    assert [b.get("full") for b in tl if b["type"] == "session"] == [True, True, False]
    assert tl[1]["anchor"] == "zasedani-2026-10-20" and tl[2]["shadow_total"] == 1
    news.validate(tl)


def test_upcoming_only_future():
    agenda = {"next": {"from": "2026-11-11", "to": "2026-11-12", "items": [{}, {}]}}
    radar = {
        "session": {
            "from": "2026-11-11",
            "items": [{"title_cs": "MOCK bod", "cz": [{"mep_id": 1, "name": "MOCK A"}]}, {"title_cs": "MOCK"}],
        }
    }
    u = news.upcoming(agenda, radar, "2026-10-24")
    assert u["items"] == 2 and [t["title"] for t in u["trace"]] == ["MOCK bod"]
    assert news.upcoming(agenda, radar, "2026-11-13") is None


def test_upcoming_html_caps_trace():
    import news_page

    u = {"from": "2026-11-11", "to": "2026-11-12", "items": 9, "trace": [{"title": f"MOCK {i}", "cz": []} for i in range(5)]}
    html = news_page.upcoming_html(u)
    assert html.count('class="nv-tr"') == news_page.TRACE_MAX and "MOCK 3" not in html
    assert "a 2 další v programu zasedání" in html and "česká stopa u 5" in html
    u["trace"] = u["trace"][:2]
    assert "další v programu" not in news_page.upcoming_html(u)
