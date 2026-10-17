"""Stavební bloky statických stránek (scripts/web_ui.py): stejná čísla jako v prohlížeči (public/lib/format.js)."""

import json
import random
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import web_ui as ui  # noqa: E402


def test_fmt_pct_rounds_like_intl():
    assert ui.fmt_pct(0.9255) == "92,6 %"  # nejkratší zápis 92.55 → nahoru (Intl), ne 92,5
    assert ui.fmt_pct(0.5) == "50,0 %"
    assert ui.fmt_pct([1, 2]) == "50,0 %"
    assert ui.fmt_pct([0, 0]) == "–" and ui.fmt_pct(None) == "–"


def test_numbers_in_attributes_like_js():
    assert ui.num(50.0) == "50" and ui.num(33.333333333333336) == "33.333333333333336"
    assert ui.fixed(84.125, 2) == "84.13"  # toFixed: přesná hodnota, polovina nahoru
    assert ui.js_round(18.5) == 19 and ui.js_round(17.5) == 18  # Math.round, ne bankéřské zaokrouhlení


def test_bench_row_without_median_value_and_na():
    assert "–" in ui.bench_row("Účast", [0, 0], 0.9, "medián EP")
    html = ui.bench_row("Účast", [9, 10], 0.9, "medián EP")
    assert "stejně jako medián EP (90,0 %)" in html and "left:75.00%" in html


def test_info_ids_unique_and_stable():
    a, b = ui.Ui("p1"), ui.Ui("p1")
    first = [a.info_button("x"), a.info_button("y")]
    assert 'id="info-p1-1"' in first[0] and 'id="info-p1-2"' in first[1]
    assert b.info_button("x") == first[0]  # stejný vstup = stejné HTML (build je deterministický)


@pytest.mark.skipif(not shutil.which("node"), reason="bez Node.js")
def test_fmt_pct_same_as_browser_for_many_values():
    rnd = random.Random(1)
    values = [rnd.randint(0, 5000) / rnd.randint(1, 5000) for _ in range(3000)] + [k / 2000 for k in range(2001)]
    values = [v for v in values if v <= 1]
    script = (
        "import('./public/lib/format.js').then((m) => { const vs = JSON.parse(process.argv[1]);"
        " console.log(JSON.stringify(vs.map((v) => m.fmtPct(v)))); });"
    )
    out = subprocess.run(["node", "-e", script, json.dumps(values)], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    js = json.loads(out)
    diff = [(v, a, ui.fmt_pct(v)) for v, a in zip(values, js) if a != ui.fmt_pct(v)]
    assert not diff, diff[:5]
