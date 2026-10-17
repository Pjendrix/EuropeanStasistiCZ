"""Společná hlavička a patička webu (R7).

Jeden zdroj pro HTML stránky v public/*.html i pro statické stránky z build_pages.py.
Ruční stránky se srovnají příkazem:

    python scripts/layout.py          # přepíše hlavičku a patičku ve všech public/*.html
    python scripts/layout.py --check  # jen ověří, že jsou stejné (běží v testech)

Web zůstává bez build stepu: výstup je obyčejné HTML v repu.
"""

from __future__ import annotations

import argparse
import functools
import hashlib
import json
import re
import sys
from html import escape
from pathlib import Path

from web_ui import page_path

REPO = "https://github.com/Pjendrix/ep-watch-cz-open"
INSTAGRAM = "https://www.instagram.com/epwatch.cz/"  # jediné místo s adresou profilu (hlavička, panel Více, patička, JSON-LD)

ICON = (
    '<link rel="icon" href="{root}favicon.ico" sizes="32x32">\n'
    '<link rel="icon" href="{root}assets/brand/favicon-simple.svg" type="image/svg+xml">\n'
    '<link rel="apple-touch-icon" href="{root}assets/brand/apple-touch-icon.png">\n'
    '<link rel="manifest" href="{root}site.webmanifest">\n'
    '<meta name="theme-color" content="#0F172A">'
)

# Režim a příznak JS (public/theme.js): klasický skript v <head>, ne vložený (CSP bez 'unsafe-inline').
THEME_SCRIPT = '<script src="{root}theme.js"></script>'
# Skripty stránek jsou ES moduly (audit A2): app.js, share.js a skript stránky; navzájem se neimportují, jen lib/*.js.
MODULES = (
    '<script type="module" src="{root}app.js"></script>\n<script type="module" src="{root}share.js"></script>\n'
    '<script type="module" src="{root}{page}"></script>\n'
)

# Logo: oko + oblouk hvězd (zdroj: scripts/build_brand.py, soubory v public/assets/brand/).
# Barva = currentColor; odlesk v duhovce je průhledný (maska), takže funguje na jakémkoli pozadí.

BRAND_TEXT = '<span class="brand-text"><b>EP</b> Watch <b>CZ</b></span>'

BRAND_MARK = (
    '<svg class="brand-mark" viewBox="-158 -100 262 200" aria-hidden="true">'
    '<mask id="brand-hl"><rect x="-160" y="-100" width="270" height="200" fill="#fff"/>'
    '<circle cx="-60" cy="-13" r="12" fill="#000"/></mask>'
    '<g fill="currentColor"><path d="M-137,0 C-110,-70 20,-70 47,0 C20,70 -110,70 -137,0 Z" fill="none" '
    'stroke="currentColor" stroke-width="15"/>'
    '<circle cx="-45" cy="2" r="40" mask="url(#brand-hl)"/>'
    '<path d="M-40.0,-82.2 L-36.5,-74.0 L-27.6,-73.3 L-34.4,-67.4 L-32.3,-58.7 L-40.0,-63.4 L-47.6,-58.7 L-45.5,-67.4 L-52.3,-73.3 L-43.4,-74.0 Z M0.0,-93.0 L3.4,-84.7 L12.3,-84.0 L5.5,-78.1 L7.6,-69.4 L0.0,-74.1 L-7.6,-69.4 L-5.5,-78.1 L-12.3,-84.0 L-3.4,-84.7 Z M40.0,-82.2 L43.4,-74.0 L52.3,-73.3 L45.5,-67.4 L47.6,-58.7 L40.0,-63.4 L32.3,-58.7 L34.4,-67.4 L27.6,-73.3 L36.5,-74.0 Z M69.2,-53.0 L72.7,-44.7 L81.6,-44.0 L74.8,-38.1 L76.9,-29.4 L69.2,-34.1 L61.6,-29.4 L63.7,-38.1 L56.9,-44.0 L65.8,-44.7 Z M80.0,-13.0 L83.4,-4.7 L92.3,-4.0 L85.5,1.8 L87.6,10.5 L80.0,5.8 L72.3,10.5 L74.4,1.8 L67.6,-4.0 L76.5,-4.7 Z M69.2,27.0 L72.7,35.2 L81.6,35.9 L74.8,41.8 L76.9,50.5 L69.2,45.8 L61.6,50.5 L63.7,41.8 L56.9,35.9 L65.8,35.2 Z M40.0,56.2 L43.4,64.5 L52.3,65.2 L45.5,71.0 L47.6,79.8 L40.0,75.1 L32.3,79.8 L34.4,71.0 L27.6,65.2 L36.5,64.5 Z M0.0,67.0 L3.4,75.2 L12.3,75.9 L5.5,81.8 L7.6,90.5 L0.0,85.8 L-7.6,90.5 L-5.5,81.8 L-12.3,75.9 L-3.4,75.2 Z M-40.0,56.2 L-36.5,64.5 L-27.6,65.2 L-34.4,71.0 L-32.3,79.8 L-40.0,75.1 L-47.6,79.8 L-45.5,71.0 L-52.3,65.2 L-43.4,64.5 Z"/></g></svg>'
)

NAV = [
    ("poslanci", "meps", "Poslanci"),
    ("party", "parties", "Strany"),
    ("hlasovani", "votes", "Hlasování"),
    ("prace", "work", "Práce poslanců"),
    ("rozkol", "analyses", "Analýzy"),
    ("o-projektu", "about", "O projektu"),
]

INSTAGRAM_ICON = (
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/>'
    '<circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none"/></svg>'
)
# Odkaz na Instagram v hlavičce (desktop; na mobilu je v panelu Více a v patičce). Žádné skripty ani vložený feed.
INSTAGRAM_LINK = (
    f'<a class="ig-link" href="{INSTAGRAM}" rel="me noopener" target="_blank" '
    f'aria-label="EP Watch CZ na Instagramu (otevře se v nové záložce)" title="Instagram @epwatch.cz">{INSTAGRAM_ICON}</a>'
)

SEARCH_ICON = (
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    'aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
)
# Hledání v liště (B2): bez JS odkaz na Poslance, s JS otevře dialog s našeptávačem (app.js, lib/search.js).
SEARCH_BUTTON = (
    '<a class="search-btn" href="{root}poslanci" aria-label="Hledat poslance, stranu nebo hlasování" aria-haspopup="dialog">'
    + SEARCH_ICON
    + '<span class="search-txt" aria-hidden="true">Hledat</span><kbd aria-hidden="true">/</kbd></a>'
)

THEME_BUTTON = (
    '<button type="button" class="theme-toggle" id="theme-toggle" aria-label="Přepnout světlý a tmavý režim">'
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button>'
)


# Mobilní spodní lišta (jako v aplikaci): 4 hlavní sekce + „Více“ (spodní panel s analýzami a projektem). Na desktopu skrytá.
_I = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{}</svg>'
TAB_ICONS = {
    "meps": _I.format('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-4 3.8-6.2 7.5-6.2s6.7 2.2 7.5 6.2"/>'),
    "parties": _I.format('<path d="M5 21V4"/><path d="M5 4.5c4.5-2 8.5 2 14 0v9c-5.5 2-9.5-2-14 0"/>'),
    "votes": _I.format('<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M8.5 12.2l2.4 2.4 4.8-5"/>'),
    "work": _I.format('<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5z"/><path d="M14 3.5V8h4M10 12.5h5M10 16h5"/>'),
    "more": _I.format('<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>'),
}
TABS = [
    ("poslanci", "meps", "Poslanci"),
    ("party", "parties", "Strany"),
    ("hlasovani", "votes", "Hlasování"),
    ("prace", "work", "Práce"),
]
MORE_PAGES = ("analyses", "about")
SHEET = [
    (
        "Analýzy",
        [
            ("rozkol", "Kde se Češi rozdělili"),
            ("rozhodujici", "Kde rozhodly české hlasy"),
            ("shoda", "Shoda mezi Čechy"),
            ("moje-shoda", "Moje shoda s poslanci"),
        ],
    ),
    (
        "Hlasování a strany",
        [
            ("votes", "Všechna hlasování"),
            ("radar", "Co se chystá"),
            ("temata", "Hlasování podle témat"),
            ("party?v=eu", "Evropské frakce"),
            ("prace-poslanci", "Práce po poslancích"),
        ],
    ),
    (
        "Projekt",
        [
            ("o-projektu", "O projektu a metodika"),
            ("o-projektu#kontakt", "Kontakt a nahlášení chyby"),
            (INSTAGRAM, "Instagram @epwatch.cz"),
        ],
    ),
]


def tabbar(root: str = "", current: str | None = None) -> str:
    cur = lambda page: ' aria-current="page"' if page == current else ""
    tabs = "".join(
        f'<a href="{root}{href}" data-page="{page}"{cur(page)}>{TAB_ICONS[page]}<span>{label}</span></a>' for href, page, label in TABS
    )
    more_cur = ' aria-current="page"' if current in MORE_PAGES else ""
    groups = "".join(
        f'<p class="sheet-h">{esc_(title)}</p><ul>'
        + "".join(
            f'<li><a href="{h}" rel="me noopener">{esc_(t)}</a></li>'
            if h.startswith("https://")
            else f'<li><a href="{root}{h}">{esc_(t)}</a></li>'
            for h, t in links
        )
        + "</ul>"
        for title, links in SHEET
    )
    return (
        f'<nav class="tabbar" aria-label="Hlavní navigace (mobil)">{tabs}'
        f'<button type="button" class="tab-more" popovertarget="more-sheet" data-pages="{" ".join(MORE_PAGES)}"{more_cur}>{TAB_ICONS["more"]}<span>Více</span></button></nav>\n'
        f'<div popover id="more-sheet" class="sheet" role="dialog" aria-label="Další stránky"><div class="sheet-grip" aria-hidden="true"></div>{groups}'
        f'<p class="sheet-foot"><a href="{REPO}">Výpočty na GitHubu</a></p></div><!--/tabbar-->'
    )


def json_script(data) -> str:
    """JSON pro <script type="application/json"> (bez možnosti ukončit značku)."""
    return json.dumps(data, ensure_ascii=False).replace("</", "<\\/")


def esc_(s: str) -> str:
    return escape(s, quote=False)


def head_assets(root: str = "") -> str:
    """Část <head> od ikony po styly (titulek a popis si stránka píše sama)."""
    return "\n".join(
        [
            ICON.format(root=root),
            '<meta property="og:site_name" content="EP Watch CZ">',
            f'<link rel="alternate" type="application/atom+xml" title="EP Watch CZ – nová závěrečná hlasování" href="{root}feed.xml">',
            f'<link rel="preload" href="{root}assets/fonts/plus-jakarta-sans-latin.woff2" as="font" type="font/woff2" crossorigin>',
            THEME_SCRIPT.format(root=root),
            f'<link rel="stylesheet" href="{root}style.css">',
        ]
    )


def header(root: str = "", current: str | None = None, skip_href: str = "#main") -> str:
    links = "\n".join(
        f'    <a href="{root}{href}" data-page="{page}"{' aria-current="page"' if page == current else ""}>{label}</a>'
        for href, page, label in NAV
    )
    return (
        f'<a class="skip-link" href="{skip_href}">Přejít na obsah</a>\n'
        f'<header class="site-header"><div class="inner">\n'
        f'  <a class="brand" href="{root or "./"}">{BRAND_MARK}{BRAND_TEXT}</a>\n'
        f'  <nav aria-label="Hlavní navigace">\n{links}\n  </nav>\n'
        f"  {SEARCH_BUTTON.format(root=root)}\n"
        f"  {INSTAGRAM_LINK}\n"
        f"  {THEME_BUTTON}\n"
        f"</div></header>\n"
        f"{tabbar(root, current)}"
    )


def footer(root: str = "") -> str:
    return (
        f'<footer class="site-footer"><div class="inner">\n'
        f'  Data: <a href="https://howtheyvote.eu">HowTheyVote.eu</a> (ODbL) a '
        f'<a href="https://data.europarl.europa.eu">EP Open Data</a> (CC BY 4.0).\n'
        f"  Portréty © European Union – Source: EP. Čísla počítá otevřený skript, ne AI.\n"
        f"  Nezávislý projekt, není oficiálně spojen s žádnou stranou, frakcí ani institucí.\n"
        f'  <a href="{root}o-projektu">O projektu</a> · <a href="{root}o-projektu#kontakt">Kontakt a nahlášení chyby</a> · '
        f'<a href="{REPO}">výpočty na GitHubu</a> · <a href="{INSTAGRAM}" rel="me noopener">Instagram</a>.\n'
        f"</div></footer>"
    )


def page(
    title: str,
    body: str,
    *,
    root: str = "",
    current: str | None = None,
    description: str | None = None,
    meta: str = "",
    scripts: str = "",
    base: str | None = None,
    path: str | None = None,
    main_attrs: str = "",
) -> str:
    """Celá stránka (pro statické stránky z build_pages.py). base = <base href> (odkazy od kořene webu),
    path = cesta stránky kvůli kotvám (s <base> by „#x“ vedlo na úvodní stránku)."""
    desc = f'<meta name="description" content="{escape(description)}">\n' if description else ""
    root_attr = f' data-root="{root}"' if root else ""
    base_tag = f'<base href="{base}">\n' if base else ""
    skip = f"{page_path(path)}#main" if base and path else "#main"
    attrs = f" {main_attrs}" if main_attrs else ""
    return version_assets(
        f'<!doctype html>\n<html lang="cs"{root_attr}>\n<head>\n<meta charset="utf-8">\n'
        f'<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"{base_tag}<title>{escape(title)}</title>\n{desc}{meta}{head_assets(root)}\n</head>\n<body>\n"
        f'{header(root, current, skip)}\n\n<main id="main"{attrs}>\n{body}\n</main>\n\n'
        f"{footer(root)}\n{scripts}</body>\n</html>\n"
    )


# --- srovnání ručních stránek -----------------------------------------------------

_HEAD_RE = re.compile(r'<link rel="icon".*?<link rel="stylesheet" href="style.css(?:\?v=[0-9a-f]{8})?">', re.S)
_HEADER_RE = re.compile(r'<a class="skip-link".*?</div></header>(?:\n<nav class="tabbar".*?<!--/tabbar-->)?', re.S)
_FOOTER_RE = re.compile(r'<footer class="site-footer">.*?</footer>', re.S)


def sync_text(text: str) -> str:
    for rx, new in [(_HEAD_RE, head_assets()), (_HEADER_RE, header()), (_FOOTER_RE, footer())]:
        if len(rx.findall(text)) != 1:
            raise ValueError(f"stránka nemá právě jednu část odpovídající {rx.pattern[:30]}…")
        text = rx.sub(lambda _: new, text)  # noqa: B023 (sub volá funkci hned)
    return version_assets(text)


# --- verze skriptů a stylů (audit UI8) ------------------------------------------------
# Odkazy na vlastní .js a .css dostanou ?v=<otisk obsahu>. Prohlížeč je pak smí cachovat natrvalo (vercel.json),
# a po změně souboru se změní adresa, takže se nikdy nenačte stará verze.
PUBLIC = Path(__file__).resolve().parent.parent / "public"
_ASSET_RE = re.compile(r'((?:src|href)=")((?:\.\./)*)((?:lib/|pages/)?[\w-]+\.(?:js|css))(?:\?v=[0-9a-f]{8})?"')


@functools.lru_cache(maxsize=None)
def asset_hash(name: str) -> str | None:
    f = PUBLIC / name
    return hashlib.sha256(f.read_bytes()).hexdigest()[:8] if f.is_file() else None


def version_assets(html: str) -> str:
    def sub(m: re.Match) -> str:
        h = asset_hash(m[3])
        return f'{m[1]}{m[2]}{m[3]}?v={h}"' if h else m[0]

    return _ASSET_RE.sub(sub, html)


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
