"""Adresy stránek bez .html (vercel.json cleanUrls): kanonický tvar, odkazy, sitemap a přesměrování."""

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_pages as bp  # noqa: E402
import layout  # noqa: E402
from test_build_pages import built  # noqa: E402
from test_build_web import data_dir  # noqa: E402,F401  (sdílená fixture s MOCK daty)
from web_ui import page_path, page_url  # noqa: E402

BASE = "https://epwatch.cz"
CASES = {
    "p/256852.html": "p/256852",
    "v/197467.html#ceska-stopa": "v/197467#ceska-stopa",
    "votes.html?c=env&f=final": "votes?c=env&f=final",
    "o-projektu.html#kontakt": "o-projektu#kontakt",
    "index.html": "",
    "../index.html": "../",
    "radar?stopa=1": "radar?stopa=1",
    "party?v=eu": "party?v=eu",
    "data/home.json": "data/home.json",  # data a assety se nemění
    "assets/brand/og-default.png": "assets/brand/og-default.png",
}
# Interní odkaz na stránku s .html (relativní nebo na vlastní doméně); data, assety a cizí weby ne.
HTML_LINK = re.compile(r'(?:href|action)="(?!https?://(?!epwatch\.cz))(?!mailto:)([^"]*?\.html)(?:[?#][^"]*)?"')


def test_page_path_and_url():
    for src, want in CASES.items():
        assert page_path(src) == want, src
    assert page_url(BASE, "index.html") == f"{BASE}/" and page_url(f"{BASE}/", "p/1.html") == f"{BASE}/p/1"


@pytest.mark.skipif(not shutil.which("node"), reason="bez Node.js")
def test_page_path_same_in_js():
    script = (
        "import('./public/lib/format.js').then((m) => { const c = JSON.parse(process.argv[1]);"
        " console.log(JSON.stringify(c.map((p) => m.pagePath(p)))); console.log(m.siteUrl('index.html')); });"
    )
    out = subprocess.run(["node", "-e", script, json.dumps(list(CASES))], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    js, site = out.splitlines()
    assert json.loads(js) == list(CASES.values()) and site == f"{BASE}/"


def test_vercel_clean_urls_without_html_targets():
    cfg = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    assert cfg["cleanUrls"] is True
    assert "rewrites" not in cfg  # /p/123 → p/123.html obslouží cleanUrls
    for r in cfg["redirects"]:
        assert ".html" not in r["destination"], r
    # cleanUrls se na Vercelu vyhodnotí dřív než redirects (/mep.html → /mep), proto pravidla pro staré adresy
    # čekají cestu bez .html a míří rovnou na cíl bez .html
    by_source = {r["source"]: r for r in cfg["redirects"]}
    assert by_source["/mep"]["destination"] == "/p/:id" and by_source["/party"]["destination"] == "/s/:id"
    assert "/mep.html" not in by_source and "/party.html" not in by_source


def test_generated_pages_canonical_sitemap_and_links(data_dir):
    built(data_dir)
    (data_dir / "manual" / "site.json").write_text(json.dumps({"base_url": BASE}), encoding="utf-8")
    pages = bp.build(data_dir)
    for rel, html in pages.items():
        if not rel.endswith(".html") or rel == "404.html" or rel.startswith("embed/"):  # 404 bez canonical; embed odkazuje na plnou stránku
            continue
        m = re.search(r'<link rel="canonical" href="([^"]+)">', html)
        assert m and m[1] == f"{BASE}/{page_path(rel)}", rel
        assert not m[1].endswith(".html") and f'<meta property="og:url" content="{m[1]}">' in html, rel
        assert not HTML_LINK.findall(html), (rel, HTML_LINK.findall(html)[:3])
        share = re.search(r'<script type="application/json" id="share-context">(.*?)</script>', html, re.S)
        assert not share or ".html" not in share[1], rel
    assert ".html" not in pages["sitemap.xml"] and ".html" not in pages["feed.xml"]
    assert pages["sitemap.xml"].count(f"<loc>{BASE}/</loc>") == 1  # úvod jednou, jako „/“


def test_manual_pages_canonical_and_links():
    for f in sorted((ROOT / "public").glob("*.html")):
        html = f.read_text(encoding="utf-8")
        assert not HTML_LINK.findall(html), (f.name, HTML_LINK.findall(html)[:3])
        for m in re.finditer(r'<link rel="canonical" href="([^"]+)">|<meta property="og:url" content="([^"]+)">', html):
            assert not (m[1] or m[2]).endswith(".html"), f.name
    for rel in bp.CANONICAL_PAGES:
        html = (ROOT / "public" / rel).read_text(encoding="utf-8")
        assert f'<link rel="canonical" href="{BASE}/{page_path(rel)}">' in html, rel


def test_js_builds_links_without_html():
    """Odkazy, které skládá JavaScript (href, action, siteUrl, přesměrování), nemají .html. Výjimky:
    komentáře a cizí weby (dokumenty EP mají v adrese _CS.html)."""
    bad = []
    for f in sorted((ROOT / "public").rglob("*.js")):
        if "data" in f.relative_to(ROOT / "public").parts:
            continue
        for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            code = line.split("//", 1)[0] if not line.lstrip().startswith("//") else ""
            for m in re.finditer(r"[\w}/-]+\.html\b", code):
                if "europarl.europa.eu" not in code:
                    bad.append(f"{f.relative_to(ROOT)}:{i}: {m[0]}")
    assert not bad, bad[:10]


def test_more_sheet_has_radar():
    sheet = layout.tabbar()
    assert '<a href="radar">Co se chystá</a>' in sheet
    assert 'href="./"' in layout.header() and 'href="../"' in layout.header("../")  # logo vede na kořen, ne na /index
