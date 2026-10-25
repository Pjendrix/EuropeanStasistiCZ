import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import layout  # noqa: E402


def test_all_pages_use_shared_layout():
    # Ruční úprava hlavičky nebo patičky v jedné stránce = test selže; oprava: python scripts/layout.py
    assert layout.main(["--check"]) == 0


def test_page_with_root():
    html = layout.page("MOCK titulek", "<p>obsah</p>", root="../", current="votes", description="MOCK popis")
    assert '<html lang="cs" data-root="../">' in html
    assert 'href="../style.css?v=' in html and 'href="../hlasovani" data-page="votes" aria-current="page"' in html
    assert '<main id="main">' in html and 'class="skip-link"' in html
    assert '<meta name="description" content="MOCK popis">' in html


def test_sync_rejects_page_without_header():
    import pytest

    with pytest.raises(ValueError):
        layout.sync_text("<html><body>bez hlavičky</body></html>")


def test_instagram_in_header_sheet_footer_and_head():
    """Blok B: odkaz na Instagram v hlavičce (desktop), v panelu Více a v patičce; og:site_name a feed v <head>."""
    from layout import INSTAGRAM, footer, head_assets, header

    h, f, a = header(), footer(), head_assets()
    assert INSTAGRAM == "https://www.instagram.com/epwatch.cz/"
    assert f'class="ig-link" href="{INSTAGRAM}" rel="me noopener"' in h  # hlavička
    assert f'<li><a href="{INSTAGRAM}" rel="me noopener">Instagram @epwatch.cz</a></li>' in h  # panel Více
    assert f'<a href="{INSTAGRAM}" rel="me noopener">Instagram</a>' in f
    assert '<meta property="og:site_name" content="EP Watch CZ">' in a and 'type="application/atom+xml"' in a


def test_assets_get_content_version():
    html = layout.version_assets(
        '<link rel="stylesheet" href="../style.css"><script src="app.js?v=00000000"></script>'
        '<script src="https://cdn.example/x.js"></script><a href="neexistuje.js">'
    )
    assert re.search(r'href="\.\./style\.css\?v=[0-9a-f]{8}"', html)
    assert re.search(r'src="app\.js\?v=[0-9a-f]{8}"', html) and "v=00000000" not in html
    assert 'src="https://cdn.example/x.js"' in html and 'href="neexistuje.js"' in html  # cizí a neexistující beze změny


def test_all_pages_reference_versioned_assets():
    """Žádná stránka v public/ neodkazuje na vlastní .js/.css bez verze (vercel.json je cachuje natrvalo)."""
    root = Path(__file__).resolve().parent.parent / "public"
    bad = []
    for f in list(root.glob("*.html")) + list(root.glob("[psvz]/*.html"))[:50]:
        for m in re.finditer(r'(?:src|href)="(?:\.\./)*([\w-]+\.(?:js|css))"', f.read_text(encoding="utf-8")):
            if (root / m[1]).is_file():
                bad.append(f"{f.name}: {m[1]}")
    assert not bad, bad


def test_tabbar_five_equal_items_quiz_in_more():
    bar = layout.tabbar()
    labels = re.findall(r"<span>([^<]+)</span></(?:a|button)>", bar.split("</nav>")[0])
    assert labels == ["Novinky", "Poslanci", "Hledat", "Hlasování", "Více"]
    assert "tab-quiz" not in bar and 'href="kviz"' in bar.split("</nav>")[1]


def test_analytics_script_in_head():
    assert '<script defer src="/_vercel/insights/script.js"></script>' in layout.head_assets()
