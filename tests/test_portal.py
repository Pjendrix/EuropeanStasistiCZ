"""Rozcestník na „/“ (scripts/portal.py, zadání R2): oblouk poslanců s nadpisem, statický stav bez JS, dlaždice z JSON."""

import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_home as bh  # noqa: E402
import build_pages as bp  # noqa: E402
import build_web as bw  # noqa: E402
import portal  # noqa: E402
from hub import hemi_slots  # noqa: E402
from test_build_web import data_dir  # noqa: E402,F401  (sdílená fixture s MOCK daty)


def built(data_dir):
    (data_dir / "groups.json").write_text(
        json.dumps([{"code": "EPP", "ep_code": "PPE", "short_label": "EPP", "color": "#3B82F6"}]), encoding="utf-8"
    )
    bw.run(data_dir, "2024-11-01")
    (data_dir / "splits.json").write_text(
        json.dumps({"unity": {"considered": 4, "united_final": 1, "considered_final": 2}}), encoding="utf-8"
    )
    (data_dir / "decisive.json").write_text(json.dumps({"votes": [{"id": 1}]}), encoding="utf-8")
    (data_dir / "work_hub.json").write_text(
        json.dumps({"updated": "2024-10-20", "totals": {"meps": 2, "speeches": 5, "questions": 3, "reports_lead": 1}}), encoding="utf-8"
    )
    home = bh.build(data_dir)
    (data_dir / "home.json").write_text(json.dumps(home), encoding="utf-8")
    return home, bp.build(data_dir)


def test_portal_static_hero_and_tiles(data_dir):
    home, pages = built(data_dir)
    html = pages["index.html"]
    first = home["votes"][0]
    assert "<title>EP Watch CZ – jak hlasují čeští europoslanci</title>" in html and 'src="portal.js?v=' in html
    assert 'id="hub-q"' in html and "application/ld+json" in html
    # bez JS: statický stav posledního hlasování (tečky s hlasem, <title> pro najetí myší, popisek a počty)
    assert html.count('class="hm-seat"') == len(first["ppl"]) and html.count("<title>") == 1 + len(first["ppl"])
    assert f'data-pos="{first["ppl"][0]["pos"]}"' in html and f'href="v/{first["id"]}"' in html
    assert re.search(r'id="pt-ctl"[^>]*hidden', html)  # ovládání ukáže až skript
    assert "opacity: 0" not in html and "opacity:0" not in html
    # dlaždice: každá je odkaz nebo obsahuje odkazy, čísla z home.json
    assert html.count('class="pt-tile') == 9
    for href in (
        'href="aktualne"',
        'href="moje-shoda"',
        'href="poslanci"',
        'href="hlasovani"',
        'href="party"',
        'href="prace"',
        'href="rozkol"',
        'href="temata"',
        'href="o-projektu"',
    ):
        assert href in html, href
    f = home["facts"]
    assert f"{f['united_final']} z {f['considered_final']} jednotně" in html and f"{f['decisive']}×" in html
    assert f"<b>{f['work']['speeches']}</b>projevů" in html
    # frakce ze stejných dat jako oblouk (kódy z groups.json, ne z overview.json)
    assert re.search(r"Strany a frakce</span><h3>\d+ (strany|stran) · 1 frakce</h3>", html)


def test_portal_payload_captions(data_dir):
    home, pages = built(data_dir)
    data = json.loads(re.search(r'<script type="application/json" id="portal-data">(.*?)</script>', pages["index.html"], re.S)[1])
    assert len(data["votes"]) == len(home["votes"]) and len(data["stars"]) == 9
    v0 = home["votes"][0]
    assert data["votes"][0]["cap"]["href"] == f"v/{v0['id']}" and data["votes"][0]["pos"] == {str(p["id"]): p["pos"] for p in v0["ppl"]}
    assert data["groups"]["t"].startswith(f"{len(v0['ppl'])} poslanců v ")


def test_portal_arc_free_middle():
    """Tečky rozcestníku se nepřekrývají a vnitřní řada nechá uprostřed místo pro nadpis / číslo."""
    s = hemi_slots(21, portal.PORTAL_RINGS, portal.PORTAL_CX, portal.PORTAL_CY)
    assert len(s) == 21
    r = portal.PORTAL_SEAT
    for i, a in enumerate(s):
        for b in s[i + 1 :]:
            assert math.dist(a, b) > 2 * r
        assert r <= a[0] <= portal.PORTAL_VB[0] - r and r <= a[1] <= portal.PORTAL_VB[1] - r
        assert math.dist(a, (portal.PORTAL_CX, portal.PORTAL_CY)) - r >= 220  # volný střed
