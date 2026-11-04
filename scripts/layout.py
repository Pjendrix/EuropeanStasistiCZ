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
import posixpath
import re
import sys
from html import escape, unescape
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
# Vercel Web Analytics (O6): anonymní počty návštěv bez cookies; skript z vlastní domény, projde CSP 'self'.
ANALYTICS_SCRIPT = '<script defer src="/_vercel/insights/script.js"></script>'
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
    ("aktualne", "now", "Novinky"),
    ("poslanci", "meps", "Poslanci"),
    ("party", "parties", "Strany"),
    ("hlasovani", "votes", "Hlasování"),
    ("prace", "work", "Práce poslanců"),
    ("analyzy", "analyses", "Analýzy"),
]
# Kvíz má v menu zvýrazněné místo (zlaté tlačítko na desktopu, kulaté uprostřed spodní lišty na mobilu).
# „O projektu“ je jen v patičce a v panelu Více (na 1024 px by se lišta jinak nevešla).
QUIZ_HREF = "kviz"  # adresa kvízu (stará /moje-shoda přesměruje vercel.json)
QUIZ_ICON = (
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" '
    'stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
)

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
    "now": _I.format('<path d="M4 10.5L12 4l8 6.5V20a.5.5 0 0 1-.5.5H15v-6h-6v6H4.5A.5.5 0 0 1 4 20z"/>'),
    "meps": _I.format('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-4 3.8-6.2 7.5-6.2s6.7 2.2 7.5 6.2"/>'),
    "parties": _I.format('<path d="M5 21V4"/><path d="M5 4.5c4.5-2 8.5 2 14 0v9c-5.5 2-9.5-2-14 0"/>'),
    "votes": _I.format('<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M8.5 12.2l2.4 2.4 4.8-5"/>'),
    "work": _I.format('<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5z"/><path d="M14 3.5V8h4M10 12.5h5M10 16h5"/>'),
    "search": _I.format('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>'),
    "more": _I.format('<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>'),
}
# Mobilní spodní lišta: pět stejných položek Novinky · Poslanci · Hledat · Hlasování · Více (zadání 25. 10. 2026, O3).
# „Hledat“ bez JS vede na Poslance, s JS otevře stejný dialog jako lupa v hlavičce (app.js). Kvíz je v „Více“.
TABS = [
    ("aktualne", "now", "Novinky"),
    ("poslanci", "meps", "Poslanci"),
    ("poslanci", "search", "Hledat"),
    ("hlasovani", "votes", "Hlasování"),
]
MORE_PAGES = ("parties", "work", "analyses", "about", "quiz")
SHEET = [
    ("Kvíz", [(QUIZ_HREF, "Kvíz: jak byste hlasovali vy")]),
    (
        "Strany a práce poslanců",
        [
            ("party", "Strany"),
            ("party?v=eu", "Evropské frakce"),
            ("prace", "Práce poslanců"),
            ("prace-poslanci", "Práce po poslancích"),
        ],
    ),
    (
        "Analýzy",
        [
            ("analyzy", "Přehled analýz"),
            ("rozkol", "Kde se Češi rozdělili"),
            ("rozhodujici", "Kde rozhodly české hlasy"),
            ("shoda", "Kdo s kým hlasuje"),
            ("duel", "Duel poslanců"),
            ("registr", "Zájmové skupiny z ČR (registr EU)"),
        ],
    ),
    (
        "Hlasování",
        [
            ("votes", "Všechna hlasování"),
            ("zasedani", "Zasedání pléna"),
            ("radar", "Co se chystá"),
            ("temata", "Hlasování podle témat"),
        ],
    ),
    (
        "Projekt",
        [
            ("o-projektu", "O projektu a metodika"),
            ("otevrena-data", "Otevřená data"),
            ("o-projektu#kontakt", "Kontakt a nahlášení chyby"),
            (INSTAGRAM, "Instagram @epwatch.cz"),
        ],
    ),
]


def tabbar(root: str = "", current: str | None = None) -> str:
    cur = lambda page: ' aria-current="page"' if page == current else ""
    tabs = "".join(
        f'<a class="tab-search" href="{root}{href}" aria-haspopup="dialog">{TAB_ICONS[page]}<span>{label}</span></a>'
        if page == "search"
        else f'<a href="{root}{href}" data-page="{page}"{cur(page)}>{TAB_ICONS[page]}<span>{label}</span></a>'
        for href, page, label in TABS
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
        f'<div popover id="more-sheet" class="sheet" role="dialog" aria-label="Další stránky"><button type="button" class="sheet-grip" popovertarget="more-sheet" popovertargetaction="hide" aria-label="Zavřít panel"></button>{groups}'
        f'<p class="sheet-foot"><a href="{REPO}">Výpočty na GitHubu</a></p></div><!--/tabbar-->'
    )


def json_script(data) -> str:
    """JSON pro <script type="application/json"> (bez možnosti ukončit značku)."""
    return json.dumps(data, ensure_ascii=False).replace("</", "<\\/")


def esc_(s: str) -> str:
    return escape(s, quote=False)


SITE_JSON = Path(__file__).resolve().parent.parent / "data" / "manual" / "site.json"
OG_DEFAULT_IMAGE = "assets/brand/og-default.png"  # scripts/build_brand.py, 1200 × 630


def hand_og(text: str) -> str:
    """Open Graph pro ruční stránku z jejího <title>, popisu a canonical (náhled při sdílení, revize 3. 11. 2026).
    Obrázek je výchozí náhled s logem; stránky s vlastní kartou (p/, v/, d/…) dělá build_pages.py."""
    base = json.loads(SITE_JSON.read_text(encoding="utf-8"))["base_url"].rstrip("/")
    attr = lambda s: escape(unescape(s.strip()), quote=True)  # noqa: E731
    title = re.search(r"<title>(.*?)</title>", text, re.S)
    desc = re.search(r'<meta name="description" content="([^"]*)"', text)
    canon = re.search(r'<link rel="canonical" href="([^"]*)"', text)
    img = f"{base}/{OG_DEFAULT_IMAGE}"
    lines = ['<meta property="og:type" content="website">']
    if title:
        lines.append(f'<meta property="og:title" content="{attr(title[1])}">')
    if desc:
        lines.append(f'<meta property="og:description" content="{attr(desc[1])}">')
    lines.append('<meta property="og:locale" content="cs_CZ">')
    if canon:
        lines.append(f'<meta property="og:url" content="{attr(canon[1])}">')
    lines += [
        f'<meta property="og:image" content="{img}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="EP Watch CZ – jak hlasují čeští europoslanci">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:image" content="{img}">',
    ]
    return "\n".join(lines)


PRELOAD_MODULES = ("format.js", "data.js", "ui.js", "search.js")


def head_assets(root: str = "", og: str = "") -> str:
    """Část <head> od ikony po styly (titulek a popis si stránka píše sama; og = Open Graph ruční stránky)."""
    return "\n".join(
        [
            ICON.format(root=root),
            *([og] if og else []),
            '<meta property="og:site_name" content="EP Watch CZ">',
            f'<link rel="alternate" type="application/atom+xml" title="EP Watch CZ – novinky" href="{root}feed.xml">',
            # Čeština vždy potřebuje i latin-ext (č, ř, ě…), proto se přednačítají oba soubory písma (revize 3. 11. 2026).
            f'<link rel="preload" href="{root}assets/fonts/plus-jakarta-sans-latin.woff2" as="font" type="font/woff2" crossorigin>',
            f'<link rel="preload" href="{root}assets/fonts/plus-jakarta-sans-latin-ext.woff2" as="font" type="font/woff2" crossorigin>',
            # Moduly, které importuje app.js (na každé stránce): stáhnou se hned, ne až po app.js (o 1–2 round-tripy dřív).
            *(f'<link rel="modulepreload" href="{root}lib/{m}">' for m in PRELOAD_MODULES),
            THEME_SCRIPT.format(root=root),
            ANALYTICS_SCRIPT,
            f'<link rel="stylesheet" href="{root}style.css">',
        ]
    )


def header(root: str = "", current: str | None = None, skip_href: str = "#main") -> str:
    links = "\n".join(
        f'    <a href="{root}{href}" data-page="{page}"{' aria-current="page"' if page == current else ""}>{label}</a>'
        for href, page, label in NAV
    )
    quiz = (
        f'    <a class="quiz-btn" href="{root}{QUIZ_HREF}" data-page="quiz"{' aria-current="page"' if current == "quiz" else ""}>'
        f"{QUIZ_ICON}<span>Kvíz</span></a>"
    )
    return (
        f'<a class="skip-link" href="{skip_href}">Přejít na obsah</a>\n'
        f'<header class="site-header"><div class="inner">\n'
        f'  <a class="brand" href="{root or "./"}">{BRAND_MARK}{BRAND_TEXT}</a>\n'
        f'  <nav aria-label="Hlavní navigace">\n{links}\n{quiz}\n  </nav>\n'
        f"  {SEARCH_BUTTON.format(root=root)}\n"
        f"  {INSTAGRAM_LINK}\n"
        f"  {THEME_BUTTON}\n"
        f"</div></header>\n"
        f"{tabbar(root, current)}"
    )


def footer(root: str = "") -> str:
    return (
        f'<footer class="site-footer"><div class="inner">\n'
        f'  <span class="data-asof" data-asof></span>Data: <a href="https://howtheyvote.eu">HowTheyVote.eu</a> (ODbL) a '
        f'<a href="https://data.europarl.europa.eu">EP Open Data</a> (CC BY 4.0).\n'
        f"  Portréty © European Union – Source: EP. Čísla počítá otevřený skript, ne AI.\n"
        f"  Nezávislý projekt, není oficiálně spojen s žádnou stranou, frakcí ani institucí.\n"
        f'  <a href="{root}o-projektu">O projektu</a> · <a href="{root}o-projektu#kontakt">Kontakt a nahlášení chyby</a> · '
        f'<a href="{REPO}">výpočty na GitHubu</a> · <a href="{INSTAGRAM}" rel="me noopener">Instagram</a>.\n'
        f"</div></footer>"
    )


# Vyhledávače zobrazí ~60 znaků titulku a ~155 znaků popisu (revize 3. 11. 2026: medián titulku byl 111 znaků,
# popisu 229). Zkracuje se jen <title> a meta description; H1 a Open Graph zůstávají celé.
SUFFIX = " – EP Watch CZ"
TITLE_MAX = 60
DESC_MAX = 155


def clip(text: str, limit: int) -> str:
    """Zkrátí text po celých slovech na nejvýš limit znaků (včetně „…“)."""
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:–-·") + "…"


def short_title(title: str) -> str:
    """Dlouhý titulek stránky: zkrátit text před „– EP Watch CZ“, aby značka zůstala vidět."""
    if not title.endswith(SUFFIX) or len(title) <= TITLE_MAX + len(SUFFIX):
        return title
    return clip(title[: -len(SUFFIX)], TITLE_MAX) + SUFFIX


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
    desc = f'<meta name="description" content="{escape(clip(description, DESC_MAX))}">\n' if description else ""
    title = short_title(title)
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
    for rx, new in [(_HEAD_RE, head_assets(og=hand_og(text))), (_HEADER_RE, header()), (_FOOTER_RE, footer())]:
        if len(rx.findall(text)) != 1:
            raise ValueError(f"stránka nemá právě jednu část odpovídající {rx.pattern[:30]}…")
        text = rx.sub(lambda _: new, text)  # noqa: B023 (sub volá funkci hned)
    return version_assets(text)


# --- verze skriptů a stylů (audit UI8) ------------------------------------------------
# Odkazy na vlastní .js a .css dostanou ?v=<otisk obsahu>. Prohlížeč je pak smí cachovat natrvalo (vercel.json),
# a po změně souboru se změní adresa, takže se nikdy nenačte stará verze.
PUBLIC = Path(__file__).resolve().parent.parent / "public"
_ASSET_RE = re.compile(r'((?:src|href)=")((?:\.\./)*)((?:lib/|pages/)?[\w-]+\.(?:js|css))(?:\?v=[0-9a-f]{8})?"')


# Importy mezi moduly (from "./x.js", import("./lib/x.js")): otisk modulu zahrnuje i otisky modulů, které importuje,
# takže změna lib/ui.js změní ?v= u app.js i u skriptů stránek (revize 3. 11. 2026, bod 9).
_JS_IMPORT_RE = re.compile(r'((?:\bfrom\s*|\bimport\s*\(\s*)")(\.{1,2}/[^"?]+\.js)(?:\?v=[0-9a-f]{8})?(")')


def _js_deps(name: str, text: str) -> list[str]:
    base = posixpath.dirname(name)
    return [posixpath.normpath(posixpath.join(base, m[2])) for m in _JS_IMPORT_RE.finditer(text)]


@functools.lru_cache(maxsize=None)
def asset_hash(name: str) -> str | None:
    f = PUBLIC / name
    if not f.is_file():
        return None
    data = f.read_bytes()
    if not name.endswith(".js"):
        return hashlib.sha256(data).hexdigest()[:8]
    # bez ?v= v importech: otisk je stejný před přepisem i po něm (version_all_imports je idempotentní)
    text = _JS_IMPORT_RE.sub(r"\1\2\3", data.decode("utf-8"))
    h = hashlib.sha256(text.encode("utf-8"))
    for dep in _js_deps(name, text):
        h.update((asset_hash(dep) or "").encode())
    return h.hexdigest()[:8]


def version_imports(name: str, text: str) -> str:
    """Importy v modulu name dostanou ?v=<otisk> (jen při sestavení, scripts/vercel_build.sh --version-imports).
    Prohlížeč pak lib/*.js cachuje natrvalo a nikdy nespojí nový app.js se starým lib/ui.js."""
    base = posixpath.dirname(name)

    def sub(m: re.Match) -> str:
        h = asset_hash(posixpath.normpath(posixpath.join(base, m[2])))
        return f"{m[1]}{m[2]}?v={h}{m[3]}" if h else m[0]

    return _JS_IMPORT_RE.sub(sub, text)


def version_all_imports() -> int:
    """Přepíše importy ve všech JS webu. Otisky se spočítají z původních souborů dřív, než se cokoli přepíše,
    takže sedí s ?v= v HTML (build_pages.py a ruční stránky). Musí běžet jako poslední krok sestavení."""
    files = [f for f in sorted(PUBLIC.rglob("*.js")) if "data" not in f.relative_to(PUBLIC).parts]
    names = [f.relative_to(PUBLIC).as_posix() for f in files]
    for n in names:
        asset_hash(n)
    changed = 0
    for f, n in zip(files, names, strict=True):
        old = f.read_text(encoding="utf-8")
        new = version_imports(n, old)
        if new != old:
            f.write_text(new, encoding="utf-8")
            changed += 1
    return changed


def version_assets(html: str) -> str:
    def sub(m: re.Match) -> str:
        h = asset_hash(m[3])
        return f'{m[1]}{m[2]}{m[3]}?v={h}"' if h else m[0]

    return _ASSET_RE.sub(sub, html)


# Stránky z build_pages.py (rozcestník, Novinky): hlavičku dostávají při generování z page(), ručně se neupravují.
GENERATED = {"index.html", "aktualne.html", "zasedani.html", "404.html", "otevrena-data.html", "registr.html"}


def main(argv=None) -> int:
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="store_true", help="jen ověřit, nic nepřepisovat")
    p.add_argument("--version-imports", action="store_true", help="při sestavení: importy v JS dostanou ?v=<otisk> (poslední krok)")
    args = p.parse_args(argv)
    if args.version_imports:
        print(f"layout: importy s ?v= v {version_all_imports()} modulech", file=sys.stderr)
        return 0
    stale = []
    for f in sorted((root / "public").glob("*.html")):
        if f.name in GENERATED:
            continue
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
