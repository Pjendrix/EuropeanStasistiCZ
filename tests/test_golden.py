import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import golden  # noqa: E402

V = {1: {"id": 1, "result": "ADOPTED", "counts": {"for": 10, "against": 5, "abstention": 1}}}
M = {7: {"id": 7, "committees": [{"code": "ENVI", "role": "MEMBER", "start": "2024-07-19", "end": None}]}}
SRC = {"source": "https://www.europarl.europa.eu/MOCK", "verified_by": "MOCK", "verified_on": "2026-10-26"}


def test_matching_facts_pass():
    facts = [
        {"kind": "vote", "vote_id": 1, "result": "ADOPTED", "for": 10, **SRC},
        {"kind": "committee", "mep_id": 7, "code": "ENVI", "role": "MEMBER", "date": "2025-03-01", **SRC},
    ]
    assert golden.check(facts, V, M) == []


def test_mismatch_and_bad_entries_fail():
    facts = [
        {"kind": "vote", "vote_id": 1, "against": 6, **SRC},
        {"kind": "committee", "mep_id": 7, "code": "AFET", "date": "2025-03-01", **SRC},
        {"kind": "vote", "vote_id": 1, "result": "ADOPTED"},
        {"kind": "vote", "vote_id": 2, "result": "ADOPTED", **SRC},
        {"kind": "x", **SRC},
    ]
    assert len(golden.check(facts, V, M)) == 5


def test_repo_file_has_no_unverified_facts():
    root = Path(__file__).resolve().parent.parent / "data"
    for f in golden.load(root):
        assert f.get("verified_by") and f.get("source", "").startswith("https://")
