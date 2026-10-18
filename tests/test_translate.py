"""Strojový překlad (P2): všechny stránky mají lang="cs", jména, strany a kódy se nepřekládají (translate="no")."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import web_ui  # noqa: E402
from test_build_pages import built  # noqa: E402
from test_build_web import data_dir  # noqa: E402,F401  (sdílená fixture s MOCK daty)

NT = '<span translate="no" class="notranslate">'


def test_manual_pages_lang_cs():
    for f in sorted((ROOT / "public").glob("*.html")):
        assert re.search(r'<html lang="cs"[ >]', f.read_text(encoding="utf-8")), f.name


def test_generated_pages_lang_cs_and_names_not_translated(data_dir):
    pages = built(data_dir)
    html_pages = {k: v for k, v in pages.items() if k.endswith(".html")}
    assert any(k.startswith(p) for k in html_pages for p in ("p/", "v/", "s/"))
    for key, html in html_pages.items():
        assert re.search(r'<html lang="cs"[ >]', html), key
        assert 'class="brand-text notranslate" translate="no"' in html, key  # značka EP Watch CZ
    assert f"{NT}MOCK" in html_pages["v/1.html"]  # jména u hlasování
    assert '<h1 translate="no" class="notranslate">MOCK' in html_pages["p/1.html"]  # jméno v nadpisu profilu


def test_name_html_and_badges():
    m = {"given_name": "Jan", "family_name": "MOCK<Novák>", "name": "x"}
    assert web_ui.name_html(m) == f"{NT}Jan MOCK&lt;Novák&gt;</span>"
    assert 'translate="no"' in web_ui.party_badge(1, "MOCK", [{"id": 1, "short_label": "MOCK", "name": "MOCK strana"}])
    assert 'translate="no"' in web_ui.group_badge("EPP", [{"code": "EPP", "short_label": "EPP"}])
    assert 'translate="no"' in web_ui.entity_cell({}, "MOCK strana")
