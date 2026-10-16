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
    assert 'href="../style.css"' in html and 'href="../hlasovani.html" data-page="votes" aria-current="page"' in html
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
