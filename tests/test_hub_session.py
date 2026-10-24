"""Řádek „Poslední zasedání“ na úvodu (B3, scripts/hub.py). Samostatně: hub.py se do veřejného repa neexportuje."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import hub  # noqa: E402


def ag_view(following=("2026-11-11", "2026-11-12")):
    f = {"from": following[0], "to": following[1], "days": list(following)}
    return {
        "from": "2026-10-19",
        "to": "2026-10-22",
        "days": ["2026-10-19", "2026-10-22"],
        "votes": 28,
        "items": [],
        "picks": [],
        "status": "upcoming",
        "following": f,
    }


def v(vid, date, kind):
    return {"id": vid, "date": date, "vote_kind": kind, "title": f"MOCK {vid}"}


def test_session_line_numbers_from_source_json(tmp_path):
    """B3: řádek „Poslední zasedání“ bere čísla jen z session.json a vote_roles.json; co chybí, vynechá."""
    d = tmp_path / "data"
    (d / "votes").mkdir(parents=True)
    session = {"from": "2026-10-05", "to": "2026-10-08", "main": 3, "unity": {"united": 8, "considered": 20}}
    (d / "session.json").write_text(json.dumps(session), encoding="utf-8")
    month = {
        "votes": [v(1, "2026-10-06", "final"), v(2, "2026-10-07", "final"), v(3, "2026-10-07", "amendment"), v(4, "2026-09-30", "final")]
    }
    (d / "votes" / "2026-10.json").write_text(json.dumps(month), encoding="utf-8")
    roles = {
        "votes": {
            "1": [{"mep_id": 9, "role": "rapporteur"}],
            "3": [{"mep_id": 9, "role": "shadow"}],
            "4": [{"mep_id": 9, "role": "shadow"}],
        }
    }
    (d / "vote_roles.json").write_text(json.dumps(roles), encoding="utf-8")
    f = hub.session_facts(d)
    # česká stopa jen u závěrečných hlasování v rozsahu zasedání (3 je dílčí, 4 je mimo zasedání)
    assert f == {"from": "2026-10-05", "to": "2026-10-08", "final": 3, "united": 8, "considered": 20, "trace": 1}
    html = hub.session_line_html(f)
    assert "<b>3</b> závěrečných" in html and "<b>8</b> z 20" in html and "<b>1</b>" in html and "stopa=1" in html
    (d / "vote_roles.json").unlink()
    session.pop("unity")
    (d / "session.json").write_text(json.dumps(session), encoding="utf-8")
    html = hub.session_line_html(hub.session_facts(d))
    assert "jednotní" not in html and "stopa" not in html and "<b>3</b>" in html
    assert hub.session_line_html(None) == ""


def test_session_people_rule_alphabetical_with_dated_activity(tmp_path):
    """B6: jen zpravodajové / stínoví zpravodajové zpráv hlasovaných na zasedání, abecedně; činnost jen s datem v zasedání."""
    d = tmp_path / "data"
    (d / "votes").mkdir(parents=True)
    (d / "session.json").write_text(json.dumps({"from": "2026-10-05", "to": "2026-10-08"}), encoding="utf-8")
    month = {"votes": [v(1, "2026-10-06", "final"), v(2, "2026-10-07", "amendment"), v(3, "2026-09-30", "final")]}
    (d / "votes" / "2026-10.json").write_text(json.dumps(month), encoding="utf-8")
    roles = {
        "1": [{"mep_id": 20, "role": "rapporteur", "report": "A10-0001/2026"}],
        "2": [{"mep_id": 10, "role": "shadow", "report": "A10-0002/2026"}, {"mep_id": 20, "role": "rapporteur", "report": "A10-0001/2026"}],
        "3": [{"mep_id": 30, "role": "shadow", "report": "A10-0003/2026"}],  # mimo zasedání
    }
    (d / "vote_roles.json").write_text(json.dumps({"votes": roles}), encoding="utf-8")
    speeches = {"meps": {"20": [{"date": "2026-10-06", "type": "speech"}, {"date": "2026-09-01", "type": "speech"}]}}
    (d / "speeches.json").write_text(json.dumps(speeches), encoding="utf-8")
    own = {"meps": {"10": {"items": [{"type": "question", "date": "2026-10-07"}, {"type": "question", "date": "2026-10-20"}]}}}
    (d / "own_work.json").write_text(json.dumps(own), encoding="utf-8")
    meps = {i: {"id": i, "name": n, "sort_label": n} for i, n in ((10, "NOVÁK"), (20, "ADAM"), (30, "CIBULKA"))}
    sp = hub.session_people(d, meps)
    assert [p["id"] for p in sp["people"]] == [20, 10]  # abecedně, 30 jen mimo zasedání
    adam, novak = sp["people"]
    assert len(adam["reports"]) == 1 and adam["speeches"] == 1 and adam["questions"] == 0  # stejná zpráva jednou
    assert novak["questions"] == 1 and novak["reports"][0]["role"] == "shadow"
    html = hub.session_people_html(sp, meps, [], "")
    assert html.index("ADAM") < html.index("NOVÁK") and "1 projev v plénu" in html and "1 otázka" in html


def test_next_session_html_after_session_shows_calendar_block():
    html = hub.next_session_html(ag_view(), today="2026-10-24")
    assert "Další zasedání" in html and "11.–12. 11. 2026" in html and "program zatím nezveřejněn" in html
    assert "Celý program" not in html and "Návrh programu" not in html
    assert "Probíhá zasedání" in hub.next_session_html(ag_view(), today="2026-10-20")
    assert 'data-after-from="2026-11-11"' in hub.next_session_html(ag_view(), today="2026-10-20")
