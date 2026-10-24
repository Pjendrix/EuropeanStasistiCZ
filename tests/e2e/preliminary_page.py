"""Pro kontrolu webu (check-web.mjs): úvod s blokem předběžných výsledků z fixture (EP API, 22. 10. 2026).

Ve skutečných datech blok bývá jen pár dní po zasedání, kontrola ho ale musí projít vždy (zadání 24. 10. 2026, C4).
Zapíše {site}/predbezne-e2e.html = {site}/index.html s blokem za úvodním hero; HowTheyVote se tváří, že má data do 21. 10.

Použití: python tests/e2e/preliminary_page.py <adresář webu>
"""

import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import portal  # noqa: E402
import preliminary  # noqa: E402

site = Path(sys.argv[1])
with tempfile.TemporaryDirectory() as tmp:
    data = Path(tmp) / "data"
    shutil.copytree(ROOT / "data", data, ignore=shutil.ignore_patterns("preliminary", "votes", "meps"))
    raw = json.loads((ROOT / "tests" / "fixtures" / "ep" / "decisions_MTG-PL-2026-10-22.json").read_text(encoding="utf-8"))
    meps = json.loads((data / "meps.json").read_text(encoding="utf-8"))["meps"]
    groups = json.loads((data / "groups.json").read_text(encoding="utf-8"))
    ep = {g["ep_code"]: g["code"] for g in groups if g.get("ep_code")}
    day = preliminary.day_file("2026-10-22", preliminary.parse_decisions(raw, "2026-10-22"), meps, ep, "2026-10-22T23:37+02:00")
    (data / "preliminary").mkdir()
    (data / "preliminary" / "2026-10-22.json").write_text(json.dumps(day, ensure_ascii=False), encoding="utf-8")
    preliminary.htv_last_day = lambda _: "2026-10-21"
    block = portal.preliminary_html(data)
if 'id="h-prelim"' not in block:
    sys.exit("blok předběžných výsledků se nevykreslil")
index = (site / "index.html").read_text(encoding="utf-8")
cut = index.index("</section>", index.index('class="pt-hero"')) + len("</section>")
(site / "predbezne-e2e.html").write_text(index[:cut] + "\n" + block + index[cut:], encoding="utf-8")
