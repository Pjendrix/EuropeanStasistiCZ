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


# --- strojový překlad: jeden přepínač v data/manual/site.json (translate.enabled) --------------------
TR_ON = {"enabled": True, "languages": ["en", "de", "pl", "uk"]}
TR_OFF = {"enabled": False, "languages": ["en", "de", "pl", "uk"]}


def _all_pages():
    """Ruční stránky po srovnání hlavičky (sync_text) a stránka z page() jako u generovaných p/, v/, s/, z/."""
    root = Path(__file__).resolve().parent.parent / "public"
    pages = {f.name: layout.sync_text(f.read_text(encoding="utf-8")) for f in sorted(root.glob("*.html")) if f.name not in layout.GENERATED}
    pages["generated"] = layout.page("MOCK", "<p>MOCK</p>", root="../", current="votes")
    import build_pages as bp  # blok s odkazy v O projektu srovnává build_pages.py (sync_blocks)

    pages["o-projektu.html"] = re.sub(
        r"(<!--sync:translate-->).*?(<!--/sync:translate-->)",
        lambda m: f"{m[1]}\n{bp.translate_html()}\n{m[2]}",
        pages["o-projektu.html"],
        flags=re.S,
    )
    return pages


def test_translate_switch_on_every_page(monkeypatch):
    monkeypatch.setattr(layout, "translate_config", lambda path=None: TR_ON)
    for name, html in _all_pages().items():
        assert 'class="tr-btn notranslate" translate="no"' in html, name
        assert 'data-translate="en de pl uk"' in html and "translate.js" in html, name
        assert 'class="tr-link notranslate"' in html, name  # panel Více


def test_translate_switch_off_removes_everything(monkeypatch):
    import build_pages as bp

    monkeypatch.setattr(layout, "translate_config", lambda path=None: TR_OFF)
    for name, html in _all_pages().items():
        assert "tr-btn" not in html and "tr-link" not in html and "translate.js" not in html, name
        assert "translate.google.com" not in html, name
    assert bp.translate_html() == ""  # věta a odkazy v O projektu zmizí
    monkeypatch.setattr(layout, "translate_config", lambda path=None: TR_ON)
    assert "translate.google.com/translate?sl=cs&amp;tl=uk" in bp.translate_html()


def test_translate_config_validation(tmp_path):
    import json

    import pytest

    f = tmp_path / "site.json"
    f.write_text(json.dumps({"base_url": "https://example.test"}), encoding="utf-8")
    assert layout.translate_config(f) == {"enabled": False, "languages": []}  # bez klíče vypnuto
    f.write_text(json.dumps({"translate": {"enabled": True, "languages": ["en", "xx"]}}), encoding="utf-8")
    with pytest.raises(ValueError, match="xx"):
        layout.translate_config(f)
    f.write_text(json.dumps({"translate": {"enabled": "ano", "languages": ["en"]}}), encoding="utf-8")
    with pytest.raises(ValueError):
        layout.translate_config(f)


def test_repo_translate_config():
    cfg = layout.translate_config()
    assert cfg["enabled"] is True and cfg["languages"] == ["en", "de", "pl", "uk"]
