import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import title_translations as tt  # noqa: E402


class FakeBackend:
    def __init__(self, answers):
        self.answers, self.calls = answers, 0

    def ask(self, text):
        self.calls += 1
        return self.answers.pop(0)


VOTES = [
    {"id": 1, "is_main": True, "title": "MOCK Objection pursuant to Rule 115(2): soybean MON 87769"},
    {"id": 2, "is_main": True, "title": "MOCK Official", "title_cs": "MOCK Oficiální"},
    {"id": 3, "is_main": False, "title": "MOCK Amendment"},
]


def test_translates_only_final_without_title_and_caches():
    b = FakeBackend([{"nazev": "MOCK Námitka podle článku 115 odst. 2: sója MON 87769"}])
    out = tt.run(VOTES, {}, b, "2026-10-25", log=lambda m: None)
    assert list(out["items"]) == ["1"] and out["items"]["1"]["title"] == VOTES[0]["title"]
    again = tt.run(VOTES, out, FakeBackend([]), "2026-10-26", log=lambda m: None)
    assert again["items"] == out["items"]


def test_rejects_foreign_numbers_and_too_long():
    logs = []
    out = tt.run(VOTES, {}, FakeBackend([{"nazev": "MOCK Námitka 2026"}]), "2026-10-25", log=logs.append)
    assert out["items"] == {} and logs
    out = tt.run(VOTES, {}, FakeBackend([{"nazev": "x" * 301}]), "2026-10-25", log=logs.append)
    assert out["items"] == {}


def test_without_backend_keeps_nothing_new():
    assert tt.run(VOTES, {}, None, "2026-10-25")["items"] == {}
