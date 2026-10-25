import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import check_freshness as cf  # noqa: E402


def test_problem_rules():
    ok = {"release": "2026-10-24", "stale_days": 14}
    assert cf.problem(ok, "2026-11-07") == ""
    assert "stará" in cf.problem(ok, "2026-11-08")
    assert "neodpovídá" in cf.problem(None, "2026-10-25", "URLError: timeout")
    assert "formátu" in cf.problem({"release": "2026-10-24"}, "2026-10-25")
