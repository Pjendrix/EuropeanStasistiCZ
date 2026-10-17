"""I1: veřejná doména epwatch.cz na jednom místě, přesměrování starých adres."""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_pages as bp  # noqa: E402

BASE = "https://epwatch.cz"


def test_base_url_same_in_python_and_js():
    site = json.loads((ROOT / "data" / "manual" / "site.json").read_text(encoding="utf-8"))
    assert site["base_url"].rstrip("/") == BASE
    js = re.search(r'const BASE_URL = "([^"]+)"', (ROOT / "public" / "lib" / "format.js").read_text(encoding="utf-8"))
    assert js and js[1].rstrip("/") == BASE


def test_no_old_domain_in_web_and_scripts():
    hits = []
    for d in ("public", "scripts", "data/manual", ".github"):
        for f in (ROOT / d).rglob("*"):
            if f.is_file() and f.suffix in {".html", ".js", ".py", ".json", ".txt", ".xml", ".yml", ".webmanifest", ".mjs"}:
                if "vercel.app" in f.read_text(encoding="utf-8", errors="ignore"):
                    hits.append(str(f.relative_to(ROOT)))
    assert hits == []


def test_vercel_redirects_old_hosts_with_path():
    cfg = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    by_host = {r["has"][0]["value"]: r for r in cfg["redirects"] if r.get("has") and r["has"][0]["type"] == "host"}
    r = by_host["european-stasisticz.vercel.app"]
    assert r["source"] == "/:path*" and r["destination"] == f"{BASE}/:path*" and r["permanent"] is True
    # www → epwatch.cz řeší nastavení domén ve Vercelu (primární doména); pravidlo tady by se s ním mohlo zacyklit
    assert "www.epwatch.cz" not in by_host
    # adresy bez .html (epwatch.cz/v/123) obslouží cleanUrls, vlastní rewrite už není potřeba
    assert cfg["cleanUrls"] is True and "rewrites" not in cfg


def test_manual_pages_have_canonical_on_new_domain():
    for rel in bp.CANONICAL_PAGES:
        html = (ROOT / "public" / rel).read_text(encoding="utf-8")
        assert f'<link rel="canonical" href="{BASE}/' in html, rel
    # index.html a robots.txt vznikají při sestavení (vercel_build.sh), v gitu nejsou: ověřit přímo z generátorů
    from hub import hub_page

    _, index = hub_page(ROOT / "data", f"{BASE}/")
    assert f'<link rel="canonical" href="{BASE}/' in index
    assert bp.sitemap(f"{BASE}/", ["index.html"])["robots.txt"].endswith(f"Sitemap: {BASE}/sitemap.xml\n")


def test_sync_head_inserts_and_replaces(tmp_path):
    page = tmp_path / "votes.html"
    page.write_text(
        '<head>\n<title>X</title>\n<meta property="og:url" content="https://old.example/votes.html">\n</head>', encoding="utf-8"
    )
    assert bp.sync_head(page, "votes.html", BASE)
    html = page.read_text(encoding="utf-8")
    assert f'<title>X</title>\n<link rel="canonical" href="{BASE}/votes">' in html
    assert f'content="{BASE}/votes"' in html and "old.example" not in html
    assert not bp.sync_head(page, "votes.html", BASE)  # podruhé beze změny
