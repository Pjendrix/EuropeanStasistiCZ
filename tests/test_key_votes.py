import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import key_votes as kv  # noqa: E402
from compute_stats import FormatError  # noqa: E402

MEPS = {1: {"id": 1, "mandates": [{"start": "2024-07-16", "end": None}]}, 2: {"id": 2, "mandates": [{"start": "2024-07-16", "end": None}]}}


def vote(i, date, kind="final", n_for=300, n_against=200, result="ADOPTED", proc="COD", cz=("FOR", "FOR")):
    return {"id": i, "date": date, "vote_kind": kind, "is_main": True, "title": f"MOCK {i}", "result": result,
            "counts": {"for": n_for, "against": n_against, "abstention": 0, "did_not_vote": 0},
            "procedure": {"type": proc, "reference": f"MOCK/{i}"},
            "cz_positions": [{"member_id": m, "position": p, "group_code": "EPP"} for m, p in zip((1, 2), cz)]}


VOTES = [
    vote(1, "2025-01-10"),                                              # starší než 12 měsíců od posledního
    vote(2, "2025-12-01", proc="INI", cz=("FOR", "AGAINST")),           # nelegislativní, Češi rozdělení 1 : 1
    vote(3, "2026-02-03", kind="provisional_agreement", n_for=201, n_against=200),  # zákon, těsné
    vote(4, "2026-02-04", kind="amendment"),                            # není závěrečné: do žádného seznamu
    vote(5, "2026-02-10", proc="RSP", result="REJECTED", n_for=100, n_against=400, cz=("AGAINST", "AGAINST")),
]


def build(items=()):
    return kv.build_key_votes(VOTES, {"items": list(items)}, MEPS)


def test_periods_relative_to_last_vote():
    s = kv.period_starts(VOTES)
    assert s["all"] is None and s["session"] == "2026-02-10" and s["m3"] == "2025-11-10" and s["m12"] == "2025-02-10"


def test_lists_follow_one_rule_each():
    r = build()
    ids = lambda p, name: [x["id"] for x in r["lists"][p][name]["items"]]
    assert r["lists"]["all"]["laws"]["total"] == 2 and ids("all", "laws") == [3, 1]  # COD + provisional_agreement, nejnovější první
    assert ids("m12", "laws") == [3]                                            # vote 1 je starší než 12 měsíců
    assert ids("all", "splits")[0] == 2 and r["lists"]["all"]["splits"]["total"] == 1
    assert ids("all", "close")[0] == 3                                          # rozdíl 1 hlas
    assert r["lists"]["session"]["laws"]["total"] == 0 and "4" not in r["votes"]  # dílčí hlasování nikde
    # jedno hlasování může být ve více seznamech, každý má vlastní větu proč
    reasons = {x["id"]: x["reason"] for x in r["lists"]["all"]["close"]["items"]}
    assert reasons[3] == "Výsledek 201 : 200, rozdíl 1 hlas"
    assert r["lists"]["all"]["splits"]["items"][0]["reason"] == "Češi se rozdělili 1 : 1 (pro : proti)"


def test_ep_highlights_need_source_and_media_only_from_two_outlets():
    item = {"vote_id": 5, "source_url": "https://www.europarl.europa.eu/news/cs/press-room/MOCK", "press_date": "2026-02-12",
            "media": [{"url": "https://example.test/a", "outlet": "A"}]}
    r = build([item])
    assert r["lists"]["all"]["ep_highlights"]["total"] == 1
    assert "tisková zpráva 2026-02-12" in r["lists"]["all"]["ep_highlights"]["items"][0]["reason"]
    assert r["votes"]["5"]["press"]["media"] == []
    item["media"].append({"url": "https://example.test/b", "outlet": "B"})
    assert len(build([item])["votes"]["5"]["press"]["media"]) == 2


@pytest.mark.parametrize("item,needle", [
    ({"vote_id": 99, "source_url": "https://www.europarl.europa.eu/x"}, "neexistuje"),
    ({"vote_id": 1, "source_url": "https://example.test/x"}, "source_url"),
    ({"vote_id": 1, "source_url": "http://www.europarl.europa.eu/x"}, "source_url"),
    ({"vote_id": 1}, "source_url"),
    ({"vote_id": "1", "source_url": "https://www.europarl.europa.eu/x"}, "vote_id"),
    ({"vote_id": 1, "source_url": "https://www.europarl.europa.eu/x", "press_date": "9.7.2026"}, "press_date"),
])
def test_invalid_items_raise_readable_error(item, needle):
    with pytest.raises(FormatError, match=needle):
        build([item])


def test_duplicate_item_is_error():
    it = {"vote_id": 1, "source_url": "https://www.europarl.europa.eu/x"}
    assert any("dvakrát" in p for p in kv.validate_items({"items": [it, dict(it)]}, {1}))
