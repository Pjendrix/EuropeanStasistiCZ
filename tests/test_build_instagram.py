"""Balíček pro Instagram (blok F, zadání I4): výběr hlasování, rotace poslanců, texty a kontrola slidů.
Kreslení v Chromiu se tu netestuje (kryje ho kontrola webu); testují se čisté funkce a texty z MOCK dat."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_instagram as bi  # noqa: E402
from compute_stats import FormatError  # noqa: E402

MAND = [{"start": "2024-07-16", "end": None}]


def mep(i, sort, mandates=MAND):
    return {"id": i, "name": f"MOCK {sort}", "sort_label": sort, "mandates": mandates}


MEPS = [mep(1, "ALFA"), mep(2, "BETA"), mep(3, "CHARLIE"), mep(4, "DELTA", [{"start": "2024-07-16", "end": "2025-01-01"}])]
BY_ID = {m["id"]: m for m in MEPS}


def vote(i, date, positions, kind="final", ts=None):
    return {
        "id": i,
        "date": date,
        "timestamp": ts or f"{date} 12:00:00",
        "vote_kind": kind,
        "is_main": kind == "final",
        "cz_positions": [{"member_id": m, "position": p} for m, p in positions],
    }


def test_last_session_days():
    votes = [vote(1, "2026-09-15", []), vote(2, "2026-10-05", []), vote(3, "2026-10-06", []), vote(4, "2026-10-08", [])]
    assert bi.last_session_days(votes) == ["2026-10-05", "2026-10-06", "2026-10-08"]
    assert bi.last_session_days([]) == []


def test_pick_vote_biggest_split_then_newest_and_deterministic():
    votes = [
        vote(1, "2026-10-06", [(1, "FOR"), (2, "AGAINST"), (3, "FOR")]),  # menšina 1/3
        vote(2, "2026-10-07", [(1, "FOR"), (2, "FOR"), (3, "FOR")]),  # jednotně
        vote(3, "2026-10-07", [(1, "FOR"), (2, "AGAINST"), (3, "ABSTENTION")]),  # 1/2
        vote(4, "2026-10-08", [(1, "AGAINST"), (2, "FOR"), (3, "DID_NOT_VOTE")]),  # 1/2, novější
        vote(5, "2026-10-08", [(1, "FOR"), (2, "AGAINST")], kind="amendment"),  # není závěrečné
        vote(6, "2026-09-01", [(1, "FOR"), (2, "AGAINST")]),
    ]  # jiné zasedání
    assert bi.pick_vote(votes, BY_ID)["id"] == 4
    assert bi.pick_vote(list(reversed(votes)), BY_ID)["id"] == 4  # nezávisí na pořadí vstupu
    assert bi.pick_vote([vote(7, "2026-10-08", [(1, "FOR")], kind="amendment")], BY_ID) is None


def test_split_counts_only_meps_in_mandate():
    v = vote(1, "2026-10-06", [(1, "FOR"), (4, "AGAINST")])  # poslanec 4 už mandát nemá
    assert bi.split_key(v, BY_ID) == (0.0, 0)


def test_rotation_does_not_skip_or_repeat():
    day, state, seen = "2026-10-16", {}, []
    for _ in range(6):
        m = bi.next_mep(MEPS, day, state)
        seen.append(m["id"])
        state = {"last_mep": {"id": m["id"], "sort_label": m["sort_label"]}}
    assert seen == [1, 2, 3, 1, 2, 3]  # poslanec 4 bez mandátu se nevybere


def test_rotation_continues_after_departed_mep():
    state = {"last_mep": {"id": 99, "sort_label": "BRAVO"}}  # mezitím odešel
    assert bi.next_mep(MEPS, "2026-10-16", state)["id"] == 3
    with pytest.raises(FormatError):
        bi.next_mep([], "2026-10-16", {})


SHARE = {
    "title": "MOCK hlasování",
    "kindLabel": "závěrečné hlasování",
    "resultLabel": "přijato",
    "ep": [400, 200, 30, 50],
    "parties": [{"label": "MOCK", "groups": ["EPP"], "positions": ["FOR", "FOR", "AGAINST", "DID_NOT_VOTE"]}],
}


def test_vote_texts_numbers_rule_sources_and_alt():
    v = vote(5, "2026-10-08", [])
    t = bi.vote_texts(v, SHARE, [{"name": "MOCK Jedna", "role": "rapporteur"}], "2026-10-10", ["2026-10-05", "2026-10-08"])
    assert "2 pro, 1 proti, 1 nehlasoval" in t["popisek"]
    assert "Česká stopa: MOCK Jedna (zpravodaj/ka)" in t["popisek"]
    assert "rozdělili nejvíc" in t["popisek"] and "data k 10. 10. 2026" in t["popisek"]
    assert "epwatch.cz/v/5" in t["popisek"] and "https://howtheyvote.eu/votes/5" in t["zdroje"]
    assert [line.split(":")[0] for line in t["alt"].splitlines()] == ["slide-1.png", "story.png"]
    plain = bi.vote_texts(v, SHARE, [], "2026-10-10", ["2026-10-08"])
    assert "Česká stopa" not in plain["popisek"] and "EP Open Data" not in plain["zdroje"]


def test_mep_texts_skip_missing_values():
    data = {
        "name": "MOCK Poslanec",
        "chips": [{"label": "EPP"}],
        "mandate": "v mandátu od 16. 7. 2024",
        "attendance": [90, 100],
        "attendanceMedian": None,
        "loyalty": None,
    }
    t = bi.mep_texts({"id": 7}, data, "2026-10-10")
    assert "90,0 %" in t["popisek"] and "Medián" not in t["popisek"] and "frakcí" not in t["popisek"]
    assert len(t["alt"].splitlines()) == 4 and "neutrální avatar" in t["alt"]


def test_check_slide_requires_source_date_url_and_fit():
    ok = ["EP Watch CZ", "Zdroj: HowTheyVote.eu · data k 10. 10. 2026", "epwatch.cz/v/1"]
    bi.check_slide("ok", ok, [])
    with pytest.raises(FormatError, match="datum dat"):
        bi.check_slide("x", ["Zdroj: X", "epwatch.cz"], [])
    with pytest.raises(FormatError, match="adresa"):
        bi.check_slide("x", ["Zdroj: X · data k 1. 1. 2026"], [])
    with pytest.raises(FormatError, match="přetéká"):
        bi.check_slide("x", ok, ["dlouhý text"])


def test_write_package_needs_alt_for_every_slide(tmp_path):
    res = {"png": b"MOCK", "texts": ["Zdroj · data k 1. 1. 2026 · epwatch.cz"], "overflow": []}
    texts = {"popisek": "MOCK\n", "alt": "slide-1.png: MOCK\n", "zdroje": "MOCK\n"}
    bi.write_package(tmp_path / "a", [("slide-1.png", res)], texts)
    assert (tmp_path / "a" / "alt.txt").exists()
    with pytest.raises(FormatError, match="alt.txt"):
        bi.write_package(tmp_path / "b", [("slide-1.png", res), ("story.png", res)], texts)


def test_vote_card_dots_equal_meps_in_mandate():
    """Součet teček na kartě = počet českých poslanců v mandátu k datu hlasování (reálná data, když jsou)."""
    import json
    import build_pages as bp
    from compute_stats import active_positions, load_votes

    root = Path(__file__).resolve().parent.parent / "data"
    if not (root / "votes" / "index.json").exists():
        return
    meps = {m["id"]: m for m in json.loads((root / "meps.json").read_text(encoding="utf-8"))["meps"]}
    index, votes = load_votes(root / "votes")
    v = bi.pick_vote(votes, meps)
    share = bp.vote_share_data(v, meps, index["groups"], json.loads((root / "parties.json").read_text(encoding="utf-8")), None)
    assert sum(len(p["positions"]) for p in share["parties"]) == len(active_positions(v, meps))
