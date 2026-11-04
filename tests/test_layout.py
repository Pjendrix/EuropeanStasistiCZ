import posixpath
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


ROOT = Path(__file__).resolve().parent.parent


def test_hand_pages_have_description_and_share_preview():
    """Revize 3. 11. 2026: každá ruční stránka má popis (nejvýš 160 znaků) a náhled pro sdílení (og:image),
    kromě šablon s noindex (vote.html, mep.html)."""
    for f in sorted((ROOT / "public").glob("*.html")):
        if f.name in layout.GENERATED:
            continue
        html = f.read_text(encoding="utf-8")
        if 'name="robots" content="noindex' in html:
            continue
        d = re.search(r'<meta name="description" content="([^"]*)"', html)
        assert d and len(d[1]) <= 160, f.name
        assert html.count('property="og:image"') == 1 and html.count('property="og:title"') == 1, f.name


def test_short_title_keeps_brand():
    long = "MOCK " + "velmi dlouhý úřední název nařízení " * 6 + "– EP Watch CZ"
    t = layout.short_title(long)
    assert t.endswith(" – EP Watch CZ") and len(t) <= layout.TITLE_MAX + len(layout.SUFFIX) and "…" in t
    assert layout.short_title("MOCK krátký – EP Watch CZ") == "MOCK krátký – EP Watch CZ"
    assert layout.clip("MOCK slovo " * 40, 155).endswith("…") and len(layout.clip("MOCK slovo " * 40, 155)) <= 155


def test_long_title_shortened_in_page_but_not_h1():
    title = "MOCK " + "dlouhý název hlasování " * 8 + "– EP Watch CZ"
    html = layout.page(title, "<h1>MOCK plný nadpis</h1>", description="MOCK " + "popis " * 60)
    t = re.search(r"<title>(.*?)</title>", html)[1]
    assert len(t) <= 75 and "<h1>MOCK plný nadpis</h1>" in html
    assert len(re.search(r'name="description" content="([^"]*)"', html)[1]) <= 155


def test_module_hash_includes_imports(monkeypatch, tmp_path):
    """Otisk modulu se změní i se změnou modulu, který importuje (bod 9 revize 3. 11. 2026)."""
    (tmp_path / "lib").mkdir()
    (tmp_path / "app.js").write_text('import { a } from "./lib/a.js";\n', encoding="utf-8")
    (tmp_path / "lib" / "a.js").write_text('import { b } from "./b.js";\nexport const a = 1;\n', encoding="utf-8")
    (tmp_path / "lib" / "b.js").write_text("export const b = 1;\n", encoding="utf-8")
    monkeypatch.setattr(layout, "PUBLIC", tmp_path)
    layout.asset_hash.cache_clear()
    before = layout.asset_hash("app.js")
    (tmp_path / "lib" / "b.js").write_text("export const b = 2;\n", encoding="utf-8")
    layout.asset_hash.cache_clear()
    assert layout.asset_hash("app.js") != before
    # přepis importů: ?v= u statických i dynamických importů, stejný otisk jako asset_hash (a tedy ?v= v HTML)
    (tmp_path / "share.js").write_text('export const load = () => import("./lib/a.js");\n', encoding="utf-8")
    layout.asset_hash.cache_clear()
    assert layout.version_all_imports() == 3
    ha, hb = layout.asset_hash("lib/a.js"), layout.asset_hash("lib/b.js")
    assert f'from "./lib/a.js?v={ha}"' in (tmp_path / "app.js").read_text(encoding="utf-8")
    assert f'import("./lib/a.js?v={ha}")' in (tmp_path / "share.js").read_text(encoding="utf-8")
    assert f'from "./b.js?v={hb}"' in (tmp_path / "lib" / "a.js").read_text(encoding="utf-8")
    # druhý běh nic nezmění (otisk se počítá bez ?v=), takže ?v= v HTML sedí i po opakovaném sestavení
    layout.asset_hash.cache_clear()
    assert layout.version_all_imports() == 0 and layout.asset_hash("lib/a.js") == ha
    layout.asset_hash.cache_clear()


def test_head_preloads_fonts_and_app_modules():
    head = layout.head_assets("../")
    assert "plus-jakarta-sans-latin-ext.woff2" in head and "plus-jakarta-sans-latin.woff2" in head
    for m in layout.PRELOAD_MODULES:
        assert f'<link rel="modulepreload" href="../lib/{m}">' in head
    app = (ROOT / "public" / "app.js").read_text(encoding="utf-8")
    deps = {posixpath.basename(d) for d in layout._js_deps("app.js", app)}
    assert deps <= set(layout.PRELOAD_MODULES)
