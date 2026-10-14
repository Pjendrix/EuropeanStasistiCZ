import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from benchmarks import compute_benchmarks  # noqa: E402


def test_medians_without_ranking():
    # 3 hlasování; poslanci 1–3 v EPP, 4 v NI. Hlasování 1 je závěrečné.
    gc = {1: {"EPP": [2, 1, 0, 0], "NI": [1, 0, 0, 0]},
          2: {"EPP": [0, 2, 0, 1], "NI": [0, 0, 0, 1]},
          3: {"EPP": [1, 1, 0, 1], "NI": [1, 0, 0, 0]}}  # EPP remíza -> loajalita se nepočítá
    rows = [
        (1, 1, "FOR", "EPP"), (2, 1, "AGAINST", "EPP"), (3, 1, "FOR", "EPP"),
        (1, 2, "FOR", "EPP"), (2, 2, "AGAINST", "EPP"), (3, 2, "AGAINST", "EPP"),
        (1, 3, "AGAINST", "EPP"), (2, 3, "DID_NOT_VOTE", "EPP"), (3, 3, "DID_NOT_VOTE", "EPP"),
        (1, 4, "FOR", "NI"), (2, 4, "DID_NOT_VOTE", "NI"), (3, 4, "FOR", "NI"),
    ]
    b = compute_benchmarks(rows, gc, {1}, min_votes=3)
    # docházka: 1 -> 1, 2 -> 1, 3 -> 1/3, 4 -> 2/3; medián (2/3 + 1) / 2
    assert b["ep"]["attendance"] == round((2 / 3 + 1) / 2, 4) and b["ep"]["meps"] == 4
    assert b["ep"]["attendance_main"] == 1.0
    # loajalita EPP: 1 -> 2/2, 2 -> 2/2, 3 -> 0/1; NI se nepočítá
    assert b["groups"]["EPP"]["group_loyalty"] == 1.0
    assert b["groups"]["NI"]["group_loyalty"] is None
    assert "rank" not in str(b)


def test_min_votes_filter():
    b = compute_benchmarks([(1, 1, "FOR", "EPP")], {1: {"EPP": [1, 0, 0, 0]}}, set(), min_votes=2)
    assert b["ep"] == {"meps": 0, "attendance": None, "attendance_main": None, "group_loyalty": None}
