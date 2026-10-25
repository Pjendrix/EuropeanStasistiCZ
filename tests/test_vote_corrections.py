import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import fetch_vote_corrections as fvc  # noqa: E402
from compute_stats import FormatError  # noqa: E402

P = "person/"


def test_corrections_only_cz_and_htv_votes():
    payload = {
        "data": [
            {"notation_votingId": "100", "had_voter_intended_favor": [P + "1", P + "99"], "had_voter_intended_against": [P + "2"]},
            {"notation_votingId": "200", "had_voter_intended_abstention": [P + "1"]},  # není v HowTheyVote
            {"id": "bez-hlasovani"},
            {"notation_votingId": "300"},
        ]
    }
    assert fvc.corrections_for_day(payload, "2026-10-21", {1, 2}, {100, 300}) == {"100": {"1": "FOR", "2": "AGAINST"}}


def test_conflicting_correction_is_error():
    payload = {"data": [{"notation_votingId": "1", "had_voter_intended_favor": [P + "1"], "had_voter_intended_against": [P + "1"]}]}
    with pytest.raises(FormatError):
        fvc.corrections_for_day(payload, "2026-10-21", {1}, {1})


def test_correction_tag_text():
    from web_ui import correction_tag

    assert "chtěla hlasovat pro · nemění výsledek" in correction_tag({"gender": "FEMALE"}, "FOR")
    assert correction_tag({}, None) == ""
