"""Řádek „Poslední zasedání“ na úvodu (B3, scripts/hub.py). Samostatně: hub.py se do veřejného repa neexportuje."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import hub  # noqa: E402


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
