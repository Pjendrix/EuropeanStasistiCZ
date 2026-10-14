import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import own_work as ow  # noqa: E402


def vote(vid, ref, result, date="2025-09-09", is_main=True, description=None, subject=None):
    return {"id": vid, "reference": ref, "result": result, "date": date, "timestamp": date + " 12:00:00",
            "is_main": is_main, "description": description, "amendment_subject": subject}


def part(mep, role="AUTHOR", **kw):
    return {"mep_id": mep, "role": role, "group": kw.get("group"), "in_name_of": kw.get("in_name_of"),
            "date": kw.get("date")}


def test_htv_reference():
    assert ow.htv_reference("RC-10-2025-0156", None) == "RC-B10-0156/2025"
    assert ow.htv_reference("A-10-2025-0142", "A10-0142/2025") == "A10-0142/2025"


def test_report_uses_last_main_vote():
    votes = [vote(1, "A10-0001/2025", "REJECTED", "2025-03-01"), vote(2, "A10-0001/2025", "ADOPTED", "2025-04-01"),
             vote(3, "A10-0001/2025", "REJECTED", "2025-05-01", is_main=False)]
    items = [{"id": "A-10-2025-0001", "kind": "report", "label": "A10-0001/2025", "procedure": "2025-0001",
              "participants": [part(1, "RAPPORTEUR")]}]
    out = ow.link(items, {}, votes)
    assert out[1][0]["status"] == "ADOPTED" and out[1][0]["vote_id"] == 2


def test_motion_superseded_by_joint_motion():
    docs = {"RC-10-2025-0156": {"kind": "joint_motion", "derived_from": ["B-10-2025-0156", "B-10-2025-0157"]}}
    votes = [vote(9, "RC-B10-0156/2025", "ADOPTED")]
    items = [
        {"id": "B-10-2025-0156", "kind": "motion", "label": "B10-0156/2025", "participants": [part(1)]},
        {"id": "B-10-2025-0200", "kind": "motion", "label": "B10-0200/2025", "participants": [part(1)]},
        {"id": "RC-10-2025-0156", "kind": "joint_motion", "label": "RC10-0156/2025", "participants": [part(2)]},
    ]
    out = ow.link(items, docs, votes)
    by_id = {e["id"]: e for e in out[1]}
    assert by_id["B-10-2025-0156"]["status"] == "superseded"
    assert by_id["B-10-2025-0156"]["joint_result"] == "ADOPTED"
    assert by_id["B-10-2025-0200"]["status"] == "no_vote"
    assert out[2][0]["status"] == "ADOPTED" and out[2][0]["vote_id"] == 9


def test_procedure_roles_and_shadow_result():
    docs = {"A-10-2025-0001": {"kind": "report", "label": "A10-0001/2025", "procedure": "2025-0001", "date": "2025-06-01"}}
    votes = [vote(5, "A10-0001/2025", "ADOPTED")]
    items = [
        {"id": "A-10-2025-0001", "kind": "report", "label": "A10-0001/2025", "procedure": "2025-0001",
         "participants": [part(1, "RAPPORTEUR")]},
        {"id": "proc-2025-0001", "kind": "procedure", "label": "2025/0001(COD)", "procedure": "2025-0001",
         "participants": [part(1, "RAPPORTEUR", date="2025-01-01"), part(2, "RAPPORTEUR_SHADOW", date="2025-02-01"),
                          part(3, "RAPPORTEUR_OPINION", in_name_of="ENVI"), part(4, "RAPPORTEUR_SHADOW_OPINION")]},
        {"id": "proc-2025-0002", "kind": "procedure", "label": "2025/0002(COD)", "procedure": "2025-0002",
         "participants": [part(1, "RAPPORTEUR")]},  # zpráva zatím v plénu není
    ]
    out = ow.link(items, docs, votes)
    assert sorted((e["id"], e["type"], e["status"]) for e in out[1]) == [
        ("A-10-2025-0001", "report", "ADOPTED"), ("proc-2025-0002", "report", "no_vote")]  # proc-2025-0001 je duplicita zprávy
    assert (out[2][0]["type"], out[2][0]["status"], out[2][0]["report"]) == ("shadow_report", "ADOPTED", "A10-0001/2025")
    assert (out[3][0]["type"], out[3][0]["status"], out[3][0]["committee"]) == ("opinion", None, "ENVI")
    assert out[4][0]["type"] == "shadow_opinion"


def test_questions_and_summary():
    items = [{"id": "E-1", "kind": "question_written", "participants": [part(1)], "answer_date": "2025-02-01"},
             {"id": "E-2", "kind": "question_priority", "participants": [part(1)], "answer_date": None}]
    out = ow.link(items, {}, [])
    s = ow.summarize(out[1])
    assert s["question"] == {"count": 2, "answered": 1}
    assert s["report"] == {"count": 0, "voted": 0, "adopted": 0, "no_vote": 0, "other": 0}


def test_summary_counts_only_known_results():
    entries = [{"type": "motion", "status": s} for s in ("ADOPTED", "REJECTED", "superseded", "no_vote", "LAPSED")]
    assert ow.summarize(entries)["motion"] == {"count": 5, "voted": 2, "adopted": 1, "no_vote": 1, "other": 1,
                                              "superseded": 1}


# --- review R2: návrh na zamítnutí, mandát, naléhavost ---------------------------

REPORT = [{"id": "A-10-2025-0176", "kind": "report", "label": "A10-0176/2025", "procedure": "2023-0272",
           "participants": [part(1, "RAPPORTEUR")]}]


def test_adopted_rejection_means_text_rejected():
    """Podle 179804: jediné hlavní hlasování je přijatý návrh na zamítnutí (370 : 264)."""
    votes = [vote(179804, "A10-0176/2025", "ADOPTED", description="Proposition de rejet", subject="Proposal for rejection")]
    e = ow.link(REPORT, {}, votes)[1][0]
    assert (e["status"], e["vote_id"], e["note"]) == ("REJECTED", 179804, "rejection_adopted")


def test_rejected_rejection_then_final_vote_counts():
    """Podle AGILE: návrh na zamítnutí zamítnut (197601), prozatímní dohoda přijata (197360)."""
    votes = [vote(197601, "A10-0176/2025", "REJECTED", "2026-05-05", description="Proposition de rejet - Am 3",
                  subject="Proposal for rejection"),
             vote(197360, "A10-0176/2025", "ADOPTED", "2026-05-05", description="Accord provisoire - Am 2",
                  subject="Provisional agreement")]
    e = ow.link(REPORT, {}, votes)[1][0]
    assert (e["status"], e["vote_id"]) == ("ADOPTED", 197360) and "note" not in e


def test_mandate_and_urgency_are_ignored():
    votes = [vote(1, "A10-0176/2025", "ADOPTED", "2025-01-01",
                  description="Décision d'engager des négociations interinstitutionnelles"),
             vote(2, "A10-0176/2025", "ADOPTED", "2025-01-02", description="Demande de décision d'urgence")]
    e = ow.link(REPORT, {}, votes)[1][0]
    assert e["status"] == "no_vote" and e["vote_id"] is None
