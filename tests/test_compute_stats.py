import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import compute_stats as cs  # noqa: E402


def mep(i, start="2024-07-16", end=None, groups=(), parties=()):
    return {"id": i, "mandates": [{"start": start, "end": end}], "groups": list(groups), "parties": list(parties)}


def pos(i, position, group="EPP"):
    return {"member_id": i, "position": position, "group_code": group}


def vote(vid, date, positions, group_counts=None, is_main=False):
    return {"id": vid, "date": date, "is_main": is_main, "group_counts": group_counts or {},
            "cz_positions": positions}


@pytest.mark.parametrize("counts,expected", [
    ({"FOR": 3, "AGAINST": 1}, "FOR"),
    ({"FOR": 1, "AGAINST": 1}, None),           # remíza
    ({"ABSTENTION": 2, "FOR": 1}, "ABSTENTION"),
    ({"DID_NOT_VOTE": 9}, None),                 # nehlasující se nepočítají
    ({}, None),
])
def test_majority(counts, expected):
    assert cs.majority(counts) == expected


def test_group_majority_ignores_absent_and_ni():
    gc = {"EPP": [10, 2, 0, 50], "NI": [5, 0, 0, 0]}
    assert cs.group_majority(gc, "EPP") == "FOR"
    assert cs.group_majority(gc, "NI") is None
    assert cs.group_majority(gc, None) is None
    assert cs.group_majority(gc, "SD") is None


def test_attendance_only_within_mandate():
    meps = [mep(1, end="2024-09-30"), mep(2)]
    votes = [
        vote(1, "2024-09-16", [pos(1, "FOR"), pos(2, "DID_NOT_VOTE")], is_main=True),
        vote(2, "2024-10-07", [pos(1, "DID_NOT_VOTE"), pos(2, "FOR")]),  # 1 už není v mandátu
    ]
    s = cs.compute(meps, votes)
    assert s["1"]["total"]["attendance"] == [1, 1]
    assert s["1"]["total"]["attendance_main"] == [1, 1]
    assert s["2"]["total"]["attendance"] == [1, 2]
    assert s["2"]["total"]["attendance_main"] == [0, 1]
    assert s["2"]["total"]["positions"] == {"FOR": 1, "AGAINST": 0, "ABSTENTION": 0, "DID_NOT_VOTE": 1}
    assert list(s["2"]["monthly"]) == ["2024-09", "2024-10"]
    assert s["2"]["monthly"]["2024-10"]["attendance"] == [1, 1]


def test_group_loyalty_uses_group_at_vote_date():
    meps = [mep(1)]
    gc = {"EPP": [100, 5, 0, 0], "PFE": [3, 50, 1, 0]}
    votes = [
        vote(1, "2024-09-16", [pos(1, "FOR", "EPP")], gc),      # loajální k EPP
        vote(2, "2024-10-16", [pos(1, "FOR", "PFE")], gc),      # po přestupu proti většině PfE
        vote(3, "2024-11-16", [pos(1, "AGAINST", "NI")], gc),   # nezařazený: nepočítá se
        vote(4, "2024-11-17", [pos(1, "DID_NOT_VOTE", "EPP")], gc),  # nehlasoval: nepočítá se
    ]
    assert cs.compute(meps, votes)["1"]["total"]["group_loyalty"] == [1, 2]


def test_cz_agreement_excludes_self_and_ties():
    meps = [mep(1), mep(2), mep(3), mep(4)]
    votes = [
        # ostatní pro 1: FOR, FOR, AGAINST -> většina FOR, 1 souhlasí
        vote(1, "2024-09-16", [pos(1, "FOR"), pos(2, "FOR"), pos(3, "FOR"), pos(4, "AGAINST")]),
        # ostatní pro 1: FOR, AGAINST, nehlasoval -> remíza, nepočítá se
        vote(2, "2024-09-17", [pos(1, "FOR"), pos(2, "FOR"), pos(3, "AGAINST"), pos(4, "DID_NOT_VOTE")]),
    ]
    s = cs.compute(meps, votes)
    assert s["1"]["total"]["cz_agreement"] == [1, 1]
    assert s["4"]["total"]["cz_agreement"] == [0, 1]
    assert s["4"]["total"]["attendance"] == [1, 2]


def test_pairwise_only_when_both_voted():
    meps = [mep(1), mep(2)]
    votes = [
        vote(1, "2024-09-16", [pos(1, "FOR"), pos(2, "FOR")]),
        vote(2, "2024-09-17", [pos(1, "FOR"), pos(2, "AGAINST")]),
        vote(3, "2024-09-18", [pos(1, "FOR"), pos(2, "DID_NOT_VOTE")]),
    ]
    s = cs.compute(meps, votes)
    assert s["1"]["pairwise"] == {"2": [1, 2]}
    assert s["2"]["pairwise"] == {"1": [1, 2]}


def test_unknown_mep_raises():
    with pytest.raises(cs.FormatError, match="nejsou v meps.json"):
        cs.compute([mep(1)], [vote(1, "2024-09-16", [pos(99, "FOR")])])


def test_missing_vote_field_raises():
    v = vote(1, "2024-09-16", [pos(1, "FOR")])
    del v["group_counts"]
    with pytest.raises(cs.FormatError, match="group_counts"):
        cs.compute([mep(1)], [v])


def test_derive_group_codes_from_both_sources():
    g = lambda code, s, e=None: {"code": code, "start": s, "end": e, "name_cs": f"MOCK {code}"}
    meps = [mep(1, groups=[g("PPE", "2024-07-16")]),
            mep(2, groups=[g("PFE", "2024-07-16", "2024-12-31"), g("NI", "2025-01-01")])]
    votes = [vote(1, "2024-09-16", [pos(1, "FOR", "EPP"), pos(2, "FOR", "PFE")]),
             vote(2, "2025-02-01", [pos(2, "FOR", "NI")])]
    assert cs.derive_group_codes(meps, votes) == {"EPP": "PPE", "PFE": "PFE", "NI": "NI"}


def test_run_writes_files(tmp_path):
    data = tmp_path / "data"
    (data / "votes").mkdir(parents=True)
    party = {"org_id": "20", "short_label": "MOCK_P", "name": "MOCK strana", "start": "2024-07-16", "end": None}
    meps = {"source": {"name": "MOCK"}, "meps": [
        {**mep(1, groups=[{"code": "PPE", "start": "2024-07-16", "end": None, "name_cs": "MOCK lidovci"}],
               parties=[party])}]}
    (data / "meps.json").write_text(json.dumps(meps), encoding="utf-8")
    index = {"source": {"release": "MOCK"}, "months": [{"month": "2024-09", "votes": 1}],
             "groups": [{"code": "EPP", "label": "MOCK EPP", "short_label": "EPP"}]}
    (data / "votes" / "index.json").write_text(json.dumps(index), encoding="utf-8")
    month = {"votes": [vote(1, "2024-09-16", [pos(1, "FOR")], {"EPP": [5, 1, 0, 0]}, True)]}
    (data / "votes" / "2024-09.json").write_text(json.dumps(month), encoding="utf-8")
    assets = tmp_path / "assets"
    (assets / "logos" / "cz").mkdir(parents=True)
    (assets / "logos" / "cz" / "20.svg").write_text("<svg/>")

    stats = cs.run(data, assets)
    assert stats["meps"]["1"]["total"]["group_loyalty"] == [1, 1]
    assert stats["period"] == {"from": "2024-09-16", "to": "2024-09-16"}
    groups = json.loads((data / "groups.json").read_text(encoding="utf-8"))
    assert groups == [{"code": "EPP", "ep_code": "PPE", "short_label": "EPP", "label": "MOCK EPP",
                       "name_cs": "MOCK lidovci", "color": None, "logo": None}]
    parties = json.loads((data / "parties.json").read_text(encoding="utf-8"))
    assert parties == [{"id": 20, "short_label": "MOCK_P", "name": "MOCK strana", "color": None,
                        "logo": "assets/logos/cz/20.svg"}]
