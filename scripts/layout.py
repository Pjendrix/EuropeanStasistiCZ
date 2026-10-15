"""Společná hlavička a patička webu (R7).

Jeden zdroj pro HTML stránky v public/*.html i pro statické stránky z build_pages.py.
Ruční stránky se srovnají příkazem:

    python scripts/layout.py          # přepíše hlavičku a patičku ve všech public/*.html
    python scripts/layout.py --check  # jen ověří, že jsou stejné (běží v testech)

Web zůstává bez build stepu: výstup je obyčejné HTML v repu.
"""

from __future__ import annotations

import argparse
import re
import sys
from html import escape
from pathlib import Path

REPO = "https://github.com/Pjendrix/EuropeanStasistiCZ"

ICON = ('<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E'
        '%3Crect width=%2232%22 height=%2232%22 rx=%226%22 fill=%22%231f4fbf%22/%3E%3Ctext x=%2216%22 y=%2222%22 '
        'font-size=%2214%22 font-family=%22sans-serif%22 font-weight=%22700%22 text-anchor=%22middle%22 '
        'fill=%22white%22%3ECZ%3C/text%3E%3C/svg%3E">')

THEME_SCRIPT = """<script>
  // Režim (světlý/tmavý) a příznak JS nastavit ještě před vykreslením, ať stránka neproblikne.
  (function () {
    var d = document.documentElement; d.classList.add("js");
    try { var t = localStorage.getItem("theme"); if (t === "dark" || t === "light") d.dataset.theme = t; } catch (e) {}
  })();
</script>"""

BRAND_MARK = (
    '<svg class="brand-mark" viewBox="0 0 34 34" aria-hidden="true">'
    '<circle cx="17.00" cy="2.50" r="1.6" fill="#F59E0B"/><circle cx="24.25" cy="4.44" r="1.6" fill="#F59E0B"/>'
    '<circle cx="29.56" cy="9.75" r="1.6" fill="#F59E0B"/><circle cx="31.50" cy="17.00" r="1.6" fill="#F59E0B"/>'
    '<circle cx="29.56" cy="24.25" r="1.6" fill="#F59E0B"/><circle cx="24.25" cy="29.56" r="1.6" fill="#F59E0B"/>'
    '<circle cx="17.00" cy="31.50" r="1.6" fill="#F59E0B"/><circle cx="9.75" cy="29.56" r="1.6" fill="#F59E0B"/>'
    '<circle cx="4.44" cy="24.25" r="1.6" fill="#F59E0B"/><circle cx="2.50" cy="17.00" r="1.6" fill="#F59E0B"/>'
    '<circle cx="4.44" cy="9.75" r="1.6" fill="#F59E0B"/><circle cx="9.75" cy="4.44" r="1.6" fill="#F59E0B"/>'
    '<clipPath id="czc"><circle cx="17" cy="17" r="8"/></clipPath><g clip-path="url(#czc)">'
    '<rect x="9" y="9" width="16" height="8" fill="#F8FAFC"/><rect x="9" y="17" width="16" height="8" fill="#E11D48"/>'
    '<path d="M9 9 L18 17 L9 25 Z" fill="#3B82F6"/></g></svg>'
)

NAV = [("index.html", "meps", "Poslanci"), ("party.html", "parties", "Strany"), ("votes.html", "votes", "Hlasování"),
       ("rozkol.html", "analyses", "Analýzy"), ("o-projektu.html", "about", "O projektu")]

THEME_BUTTON = (
    '<button type="button" class="theme-toggle" id="theme-toggle" aria-label="Přepnout světlý a tmavý režim">'
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button>'
)


def head_assets(root: str = "") -> str:
    """Část <head> od ikony po styly (titulek a popis si stránka píše sama)."""
    return "\n".join([
        ICON,
        f'<link rel="preload" href="{root}assets/fonts/plus-jakarta-sans-latin.woff2" as="font" type="font/woff2" crossorigin>',
        THEME_SCRIPT,
        f'<link rel="stylesheet" href="{root}style.css">',
    ])


def header(root: str = "", current: str | None = None, skip_href: str = "#main") -> str:
    links = "\n".join(
        f'    <a href="{root}{href}" data-page="{page}"{" aria-current=\"page\"" if page == current else ""}>{label}</a>'
        for href, page, label in NAV)
    return (f'<a class="skip-link" href="{skip_href}">Přejít na obsah</a>\n'
            f'<header class="site-header"><div class="inner">\n'
            f'  <a class="brand" href="{root}index.html">{BRAND_MARK}EP Watch <span>CZ</span></a>\n'
            f'  <nav aria-label="Hlavní navigace">\n{links}\n  </nav>\n'
            f'  {THEME_BUTTON}\n'
            f'</div></header>')


def footer(root: str = "") -> str:
    return (f'<footer class="site-footer"><div class="inner">\n'
            f'  Data: <a href="https://howtheyvote.eu">HowTheyVote.eu</a> (ODbL) a '
            f'<a href="https://data.europarl.europa.eu">EP Open Data</a> (CC BY 4.0).\n'
            f'  Portréty © European Union – Source: EP. Čísla počítá otevřený skript, ne AI.\n'
            f'  Nezávislý projekt, není oficiálně spojen s žádnou stranou, frakcí ani institucí.\n'
            f'  <a href="{root}o-projektu.html">O projektu</a> · <a href="{root}o-projektu.html#kontakt">Kontakt a nahlášení chyby</a> · '
            f'<a href="{REPO}">kód a data na GitHubu</a>.\n'
            f'</div></footer>')


def page(title: str, body: str, *, root: str = "", current: str | None = None, description: str | None = None,
         meta: str = "", scripts: str = "", base: str | None = None, path: str | None = None, main_attrs: str = "") -> str:
    """Celá stránka (pro statické stránky z build_pages.py). base = <base href> (odkazy od kořene webu),
    path = cesta stránky kvůli kotvám (s <base> by „#x“ vedlo na úvodní stránku)."""
    desc = f'<meta name="description" content="{escape(description)}">\n' if description else ""
    root_attr = f' data-root="{root}"' if root else ""
    base_tag = f'<base href="{base}">\n' if base else ""
    skip = f"{path}#main" if base and path else "#main"
    attrs = f" {main_attrs}" if main_attrs else ""
    return (f'<!doctype html>\n<html lang="cs"{root_attr}>\n<head>\n<meta charset="utf-8">\n'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            f'{base_tag}<title>{escape(title)}</title>\n{desc}{meta}{head_assets(root)}\n</head>\n<body>\n'
            f'{header(root, current, skip)}\n\n<main id="main"{attrs}>\n{body}\n</main>\n\n'
            f'{footer(root)}\n{scripts}</body>\n</html>\n')


# --- srovnání ručních stránek -----------------------------------------------------

_HEAD_RE = re.compile(r'<link rel="icon".*?<link rel="stylesheet" href="style.css">', re.S)
_HEADER_RE = re.compile(r'<a class="skip-link".*?</div></header>', re.S)
_FOOTER_RE = re.compile(r'<footer class="site-footer">.*?</footer>', re.S)


def sync_text(text: str) -> str:
    for rx, new in [(_HEAD_RE, head_assets()), (_HEADER_RE, header()), (_FOOTER_RE, footer())]:
        if len(rx.findall(text)) != 1:
            raise ValueError(f"stránka nemá právě jednu část odpovídající {rx.pattern[:30]}…")
        text = rx.sub(lambda _: new, text)
    return text


def main(argv=None) -> int:
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="store_true", help="jen ověřit, nic nepřepisovat")
    args = p.parse_args(argv)
    stale = []
    for f in sorted((root / "public").glob("*.html")):
        old = f.read_text(encoding="utf-8")
        new = sync_text(old)
        if new != old:
            stale.append(f.name)
            if not args.check:
                f.write_text(new, encoding="utf-8")
    if args.check and stale:
        print(f"hlavička/patička se liší od scripts/layout.py: {', '.join(stale)}", file=sys.stderr)
        return 1
    print(f"layout: {'zkontrolováno' if args.check else 'upraveno'} {len(stale)} stránek", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
