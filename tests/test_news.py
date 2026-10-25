import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import news  # noqa: E402
from compute_stats import FormatError  # noqa: E402

MEPS = [
    {
        "id": 1,
        "name": "MOCK A",
        "given_name": "MOCK",
        "family_name": "Anna",
        "gender": "FEMALE",
        "groups": [
            {"code": "NI", "short_label": "NI", "start": "2024-07-16", "end": "2026-10-20"},
            {"code": "PFE", "short_label": "PfE", "start": "2026-10-21", "end": None},
        ],
    },
    {"id": 2, "name": "MOCK B", "gender": "MALE", "groups": [{"code": "EPP", "short_label": "EPP", "start": "2024-07-16", "end": None}]},
]
SESSION = {
    "from": "2026-10-19",
    "to": "2026-10-22",
    "votes": 257,
    "main": 24,
    "adopted_main": 23,
    "unity": {"united": 23, "considered": 257},
}
OWN = {
    "meps": {
        "2": {
            "items": [
                {"type": "shadow_report", "date": "2026-10-12", "title": {"cs": "MOCK zpráva"}, "label": "2026/0001(COD)"},
                {"type": "question", "date": "2026-10-13", "title": {"cs": "MOCK otázka"}},
                {"type": "report", "date": "2025-01-01", "title": {"cs": "MOCK stará"}},
            ]
        }
    }
}
AGENDA = {"next": {"from": "2026-11-11", "to": "2026-11-12", "items": [{}, {}, {}]}}


def test_build_news_order_and_kinds():
    items = news.build_news(SESSION, MEPS, OWN, AGENDA, [{"date": "2026-10-23", "votes": [{}]}], "2026-10-24")
    assert [x["kind"] for x in items] == ["agenda", "preliminary", "session", "group_change", "shadow_report"]
    assert items[0]["items"] == 3 and items[1]["preliminary"] is True
    gc = items[3]
    assert gc["female"] and gc["from_group"] == "NI" and gc["to_group"] == "PfE" and gc["date"] == "2026-10-21"
    news.validate(items)


def test_first_group_is_not_a_change_and_old_items_drop():
    items = news.build_news(None, MEPS[1:], OWN, None, [], "2026-10-24")
    assert [x["kind"] for x in items] == ["shadow_report"]  # otázky a stará zpráva (mimo okno) se neukazují


def test_past_agenda_not_shown():
    assert news.build_news(None, [], None, AGENDA, [], "2026-11-20") == []


def test_validate_and_required_fields():
    with pytest.raises(FormatError):
        news.validate([{"date": "2026-10-01", "kind": "session"}])
    with pytest.raises(FormatError):
        news.build_news(None, [{"id": 3}], None, None, [], "2026-10-24")
