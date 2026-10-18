"""Sestavení webu na Vercelu (audit A6) a hlasování po jednom (audit A4)."""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build_shards as bs  # noqa: E402


def _block(text: str, name: str) -> str:
    m = re.search(rf"^{name}==.*?(?=^\S|\Z)", text, re.M | re.S)
    assert m, name
    return re.sub(r"\s*# via.*", "", m.group(0)).strip()


def test_build_requirements_match_main_lock():
    # Pillow pro build_cards.py: stejná verze a otisky jako v requirements.txt (jedna zamčená verze).
    main = (ROOT / "requirements.txt").read_text(encoding="utf-8")
    build = (ROOT / "requirements-build.txt").read_text(encoding="utf-8")
    assert _block(build, "pillow") == _block(main, "pillow")
    assert re.findall(r"^[a-z][\w.-]*==", build, re.M) == ["pillow=="]


def test_vercel_runs_build_script_and_ships_scripts():
    cfg = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    assert cfg["buildCommand"] == "bash scripts/vercel_build.sh" and cfg["outputDirectory"] == "public"
    ignored = [
        line.strip()
        for line in (ROOT / ".vercelignore").read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    for needed in ("scripts/", "data/", "design/", "requirements-build.txt"):
        assert needed not in ignored
    script = (ROOT / "scripts" / "vercel_build.sh").read_text(encoding="utf-8")
    for step in ("build_shards.py", "build_pages.py", "build_cards.py", "--require-hashes"):
        assert step in script


def test_generated_outputs_not_in_git():
    ignore = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
    for path in (
        "public/p/",
        "public/s/",
        "public/v/",
        "public/z/",
        "public/og/",
        "public/index.html",
        "public/aktualne.html",
        "public/sitemap.xml",
    ):
        assert path in ignore


def _vote(i, date, kind, ref="A10-0001/2025", result="ADOPTED"):
    return {"id": i, "date": date, "reference": ref, "vote_kind": kind, "is_main": kind == "final", "result": result, "procedure": {}}


def test_shards_link_partial_vote_to_latest_final():
    votes = [
        _vote(1, "2025-01-10", "amendment"),
        _vote(2, "2025-01-10", "final", result="REJECTED"),
        _vote(3, "2025-02-11", "final"),
        _vote(4, "2025-02-11", "amendment", ref="B10-0002/2025"),
    ]
    out = bs.shards(votes)
    assert out[1]["final_vote"] == {"id": 3, "date": "2025-02-11", "month": "2025-02", "result": "ADOPTED"}
    assert out[3]["final_vote"] is None  # závěrečné hlasování odkaz nepotřebuje
    assert out[4]["final_vote"] is None  # k referenci žádné závěrečné hlasování není
    assert out[1]["vote"]["month"] == "2025-01" and out[1]["vote"]["id"] == 1


def test_shards_write_one_file_per_vote(tmp_path):
    n = bs.write(bs.shards([_vote(7, "2025-03-01", "final")]), tmp_path / "id")
    doc = json.loads((tmp_path / "id" / "7.json").read_text(encoding="utf-8"))
    assert n == 1 and doc["vote"]["id"] == 7 and doc["final_vote"] is None
