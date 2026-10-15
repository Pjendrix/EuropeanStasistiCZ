"""Úvodní stránka jako vstupní brána (index.html) a bloky vkládané do ručních stránek.

- hub_page: hero s vyhledáváním (hub.js), tři velké vstupy (Poslanci, Hlasování, Práce) a klidný seznam dalších pohledů.
  Na úvodce nejsou žádná čísla kromě data aktualizace, je to hlavně rozcestník.
- heads_html: portréty poslanců po frakcích, blok na poslanci.html (build_pages.sync_block).
- votes_overview_html: poslední zasedání a klíčová hlasování, přehled na začátku votes.html. Tabulka s filtry je pod ním v rozbalení.

Všechna čísla jsou z data/*.json (compute_stats.py, build_web.py), nic se tu nepočítá nově kromě součtů a skládání vět.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

from build_pages import (POSITIONS, RESULT_LABEL, esc, fmt_date, fmt_num, fmt_pct, group_label, meps_count, page,
                         og_meta, split_bar)
from categories import ICON, LABEL, icon_svg
from hero_art import EMBLEM, STARS
from vote_kinds import KIND_LABELS

LIST_TITLES = {
    "laws": ("Nejnovější zákony", "Poslední závěrečná hlasování nebo prozatímní dohody v legislativním postupu."),
    "splits": ("Kde se Češi nejvíc rozdělili", "Závěrečná hlasování 10. období s největším rozdělením českých poslanců."),
    "close": ("Nejtěsnější výsledky", "Závěrečná hlasování 10. období s nejmenším rozdílem hlasů pro a proti."),
    "against_result": ("Češi proti výsledku", "Závěrečná hlasování 10. období, ve kterých většina českých hlasů šla proti výsledku."),
}


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _active(m: dict) -> bool:
    return any(x["end"] is None for x in m["mandates"])


def vote_link(v: dict) -> str:
    final = v["vote_kind"] in ("final", "provisional_agreement", "objection")
    return f"v/{v['id']}.html" if final else f"vote.html?id={v['id']}&m={v['month']}"


def _dots(cz: list[int]) -> str:
    cls = ("f", "a", "s", "n")
    return "".join(f'<i class="vd {c}"></i>' for c, n in zip(cls, cz) for _ in range(n))


def _legend(cz: list[int]) -> str:
    return (f'<div class="vd-legend"><span><i class="vd sm f"></i><b class="pro">{cz[0]}</b> pro</span>'
            f'<span><i class="vd sm a"></i><b class="con">{cz[1]}</b> proti</span>'
            f'<span><i class="vd sm s"></i><b>{cz[2]}</b> zdrž.</span>'
            f'<span><i class="vd sm n"></i><b>{cz[3]}</b> nehl.</span></div>')


def vote_card(v: dict, reason: str) -> str:
    """Karta hlasování: kategorie, název, výsledek (neutrální štítek), 21 teček se symboly, legenda, celý EP. Zelená a červená jen u hlasů."""
    cz, c = v["cz"], v["counts"]
    cats = v.get("cats") or []
    head = ""
    if cats:
        more = f'<span class="cat-more" title="{esc(", ".join(LABEL[k] for k in cats[1:]))}">+{len(cats) - 1}</span>' if len(cats) > 1 else ""
        head = f'<span class="cat-ico">{icon_svg(cats[0])}</span><span class="cat-name">{esc(LABEL[cats[0]])}</span>{more}'
    ok = v["result"] == "ADOPTED"
    res = (f'<span class="res-pill{"" if ok else " no"}">{esc(RESULT_LABEL.get(v["result"], "výsledek neuveden"))}</span>'
           if v["result"] else "")
    ep_bar = split_bar([c["for"], c["against"], c["abstention"], 0])
    return (f'<div class="card hub-vote"><div class="hub-vote-head">{head}<span class="when">{fmt_date(v["date"])}</span></div>'
            f'<a class="vote-title" href="{vote_link(v)}">{esc(v["title"])}</a>'
            f'<div class="meta">{res}<span>{esc(KIND_LABELS.get(v["vote_kind"], ""))}</span></div>'
            f'<div class="vd-row" role="img" aria-label="Češi: {cz[0]} pro, {cz[1]} proti, {cz[2]} zdržel se, {cz[3]} nehlasoval">{_dots(cz)}</div>'
            f'{_legend(cz)}'
            f'<div class="small muted">{esc(reason)}</div>'
            f'<div class="ep-line"><span>Celý EP</span>{ep_bar}<span><b class="pro">{c["for"]}</b> : <b class="con">{c["against"]}</b></span></div></div>')


def key_votes_html(kv: dict, limit: int | None = None) -> str:
    """Čtyři seznamy za celé období: zákony od nejnovějších, ostatní podle svého pravidla. Přepínač období tu není:
    výběr za kratší období se od celého skoro neliší a ukazoval by pořád stejná hlasování, poslední zasedání má blok výš."""
    out = ['<div class="hub-lists">']
    for name, (title, rule) in LIST_TITLES.items():
        lst = kv["lists"]["all"][name]
        items = "".join(vote_card(kv["votes"][str(i["id"])], i["reason"]) for i in lst["items"][:limit]) or '<p class="muted small">Nic.</p>'
        more = (f'<p class="small"><a href="votes.html?f=final">všechna závěrečná hlasování</a> ({fmt_num(lst["total"])} v 10. období)</p>'
                if lst["total"] > len(lst["items"][:limit]) else "")
        out.append(f'<section class="hub-list"><h3>{esc(title)}</h3><p class="small muted">{esc(rule)}</p>{items}{more}</section>')
    out.append("</div>")
    out.append(f'<p class="small muted">{esc(kv["note"])} <a href="o-projektu.html#metodika">Jak počítáme</a>.</p>')
    return "".join(out)



# --- bloky vkládané do ručních stránek (build_pages.sync_block) -----------------------------

def heads_html(data_dir: Path) -> str:
    """Portréty českých poslanců po frakcích (blok „Kdo jsou čeští poslanci“ na poslanci.html)."""
    overview = _read(data_dir / "overview.json")
    groups = _read(data_dir / "groups.json")
    bench = _read(data_dir / "benchmarks.json")
    active = [m for m in overview["meps"] if _active(m)]
    dname = lambda m: " ".join(x for x in (m.get("given_name"), m.get("family_name")) if x) or m["name"]
    avatar = lambda m: (f'<a class="hub-av" href="p/{m["id"]}.html" title="{esc(dname(m))}"><img src="assets/photos/thumbs/{m["id"]}.webp" '
                        f'alt="{esc(dname(m))}" width="56" height="56" loading="lazy"></a>' if m.get("photo_url") else "")
    by_group: dict[str, list[dict]] = {}
    for m in active:
        by_group.setdefault((m.get("group") or {}).get("code") or "", []).append(m)
    order = sorted(by_group, key=lambda g: (-len(by_group[g]), group_label(g or None, groups)))
    strip = "".join(
        f'<div class="hub-group"><span class="small muted">{esc(group_label(g or None, groups))}</span><div class="hub-avs">'
        + "".join(avatar(m) for m in sorted(by_group[g], key=lambda m: m.get("sort_label") or m["name"])) + "</div></div>" for g in order)
    att = [sum(m["total"]["attendance"][0] for m in active), sum(m["total"]["attendance"][1] for m in active)]
    med = ((bench or {}).get("ep") or {}).get("attendance")
    return f"""<section class="card heads" aria-labelledby="h-heads">
  <h2 id="h-heads">Kdo jsou čeští poslanci</h2>
  <div class="hub-strip heads-strip">{strip}</div>
  <p class="small">Účast delegace na hlasování {fmt_pct(att)}{f" · medián celého EP {fmt_pct(med)}" if med else ""}. Portrét otevře profil poslance.</p>
</section>"""


def votes_overview_html(data_dir: Path) -> str:
    """Přehled na začátku stránky Hlasování: rozcestník do detailů, poslední zasedání a klíčová hlasování."""
    session = _read(data_dir / "session.json")
    kv = _read(data_dir / "key_votes.json")
    sess_votes: list[tuple[int, str]] = []
    for name in ("laws", "splits", "close", "against_result"):
        for it in kv["lists"]["session"][name]["items"]:
            if it["id"] not in [i for i, _ in sess_votes]:
                sess_votes.append((it["id"], it["reason"]))
    sess_cards = "".join(vote_card(kv["votes"][str(i)], r) for i, r in sess_votes[:3])
    arrow = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
    chips = "".join(f'<a class="vo-chip" href="{h}">{esc(t)}{arrow}</a>' for h, t in (
        ("temata.html", "Podle témat"), ("rozkol.html", "Kde se Češi rozdělili"),
        ("rozhodujici.html", "Kde rozhodly české hlasy"), ("shoda.html", "Shoda mezi Čechy")))
    return f"""<div class="vo-tools">
  <div class="vo-chips"><span class="vo-label">Další pohledy</span>{chips}<a class="vo-chip vo-chip-main" href="#all-votes">Všechna hlasování{arrow}</a></div>
</div>
<section class="hub-block" aria-labelledby="h-sess">
  <h2 id="h-sess">Co se naposledy odhlasovalo</h2>
  <p class="small muted">Zasedání {fmt_date(session["from"])} – {fmt_date(session["to"])} · <a href="votes.html?od={session["from"]}&amp;m={session["to"][:7]}&amp;f=final">Celé zasedání</a></p>
  <div class="hub-lists three">{sess_cards}</div>
</section>
<section class="hub-block" aria-labelledby="h-key">
  <h2 id="h-key">Klíčová hlasování</h2>
  {key_votes_html(kv, 3)}
</section>"""


def votes_hero_html(data_dir: Path) -> str:
    """Hero stránky Hlasování: stejná kostra jako na Poslancích (nadpis, hledání, dvě čísla, témata, vlajka v hvězdách)."""
    overview = _read(data_dir / "overview.json")
    session = _read(data_dir / "session.json")
    stats = _read(data_dir / "category_stats.json")
    cats = [c for c in stats["categories"] if c["key"] != "none" and c["key"] in LABEL]
    cats = sorted(cats, key=lambda c: (-c["final"], LABEL[c["key"]]))
    tiles = "".join(
        f'<a class="tp-tile" href="votes.html?c={esc(c["key"])}&amp;f=final"><span class="tp-ico">{icon_svg(c["key"])}</span>'
        f'<span class="tp-text"><span class="tp-name">{esc(LABEL[c["key"]])}</span><span class="tp-n">{fmt_num(c["final"])}<span class="tp-unit"> závěrečných</span></span></span></a>'
        for c in cats)
    picker = (f'<nav class="topic-picker" aria-labelledby="tp-h"><div class="tp-head"><h2 id="tp-h">Vyber téma</h2>'
              f'<a class="tp-all" href="temata.html">tabulka témat →</a></div><div class="tp-grid">{tiles}</div></nav>')
    return f"""<section class="hero">
  {STARS}
  <div class="hero-inner hero-compact">
    <div class="hero-copy">
      <p class="eyebrow">10. volební období · data k {fmt_date(overview["period"]["to"])}</p>
      <h1>Jmenovitá hlasování</h1>
      <p class="lead">Všechna jmenovitá hlasování v plénu od 16. 7. 2024 a jak v nich hlasovali čeští poslanci.</p>
      <form class="vo-search" action="votes.html" method="get" role="search">
        <label for="vo-q" class="sr-only">Hledat hlasování</label>
        <input id="vo-q" name="q" type="search" placeholder="Hledat hlasování…" aria-label="Hledat hlasování podle názvu nebo čísla" autocomplete="off">
        <button type="submit">Hledat</button>
      </form>
      <div class="kpis">
        <div class="kpi-grid kpi-2">
          <div class="kpi"><div class="k-label">Jmenovitých hlasování</div><div class="k-value">{fmt_num(overview["votes_total"])}</div>
            <div class="k-note">od {fmt_date(overview["period"]["from"])} · <a href="#all-votes">seznam hlasování</a></div></div>
          <div class="kpi"><div class="k-label">Na posledním zasedání</div><div class="k-value">{fmt_num(session["votes"])}</div>
            <div class="k-note">{fmt_num(session["main"])} závěrečných, {fmt_num(session["adopted_main"])} přijato · <a href="votes.html?od={session["from"]}&amp;m={session["to"][:7]}&amp;f=final">celé zasedání</a></div></div>
        </div>
      </div>
    </div>
    {picker}
  </div>
</section>"""


# --- úvodní stránka ---------------------------------------------------------------------------

_ARROW = ('<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
          'stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>')

_GLYPH = {
    "meps": ('<svg aria-hidden="true" width="84" height="84" viewBox="0 0 84 84" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'
             '<circle cx="42" cy="30" r="14"/><path d="M14 74c3-17 14-26 28-26s25 9 28 26"/><circle cx="42" cy="42" r="40" stroke-opacity=".25"/></svg>'),
    "votes": ('<svg aria-hidden="true" width="84" height="84" viewBox="0 0 84 84" fill="none" stroke-linecap="round">'
              '<rect x="6" y="22" width="72" height="10" rx="5" stroke="currentColor" stroke-width="2" stroke-opacity=".4"/><rect x="6" y="22" width="44" height="10" rx="5" fill="var(--gold)"/>'
              '<rect x="6" y="40" width="72" height="10" rx="5" stroke="currentColor" stroke-width="2" stroke-opacity=".4"/><rect x="6" y="40" width="26" height="10" rx="5" fill="currentColor" fill-opacity=".85"/>'
              '<rect x="6" y="58" width="72" height="10" rx="5" stroke="currentColor" stroke-width="2" stroke-opacity=".4"/><rect x="6" y="58" width="58" height="10" rx="5" fill="#3B82F6"/></svg>'),
    "work": ('<svg aria-hidden="true" width="84" height="84" viewBox="0 0 84 84" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
             '<path d="M22 8h28l14 14v54H22z" stroke="var(--eu-blue)"/><path d="M50 8v14h14" stroke="var(--eu-blue)"/><path d="M32 40h22M32 50h22M32 60h14" stroke="currentColor"/></svg>'),
}

DOORS = [
    ("poslanci.html", "01", "Poslanci", "Profil každého z českých europoslanců.", "meps", "blue"),
    ("votes.html", "02", "Hlasování", "Jak hlasoval Parlament a jak v tom Češi.", "votes", "navy"),
    ("prace.html", "03", "Práce", "Zprávy, stanoviska, projevy a otázky Komisi.", "work", "paper"),
]

MORE = [
    ("party.html", "Strany", "Jak hlasují české strany."),
    ("temata.html", "Podle témat", "Kde se hlasuje nejvíc a jak v tom Češi."),
    ("rozkol.html", "Kde se Češi rozdělili", "Hlasování, ve kterých hlasovali nejvíc rozdílně."),
    ("rozhodujici.html", "Kde rozhodly české hlasy", "Těsná hlasování, která by bez nich dopadla opačně."),
    ("shoda.html", "Shoda mezi Čechy", "Jak často hlasovali dva poslanci stejně."),
]


def hub_page(data_dir: Path, base_url: str | None) -> tuple[str, str]:
    """Úvodní stránka = vstupní brána: nadpis, vyhledávání, tři velké vstupy a seznam dalších pohledů. Žádná data v textu,
    kromě data aktualizace; poslanci jsou na poslanci.html, přehled hlasování na votes.html."""
    overview = _read(data_dir / "overview.json")
    release = overview["sources"]["votes"].get("release")
    release = release if re.fullmatch(r"\d{4}-\d{2}-\d{2}", release or "") else None  # tag exportu HowTheyVote je datum
    data_day = fmt_date(release) if release else fmt_date(overview["period"]["to"])

    hero = f"""<section class="home-hero" aria-labelledby="h1">
  <div class="home-art" aria-hidden="true"></div>
  <div class="home-hero-inner">
    <div class="home-copy">
    <p class="home-eyebrow"><span class="rule"></span>10. volební období · od 16. 7. 2024</p>
    <h1 id="h1">Co dělají v Bruselu<br><strong>čeští europoslanci.</strong></h1>
    <p class="home-lead">Hlasování, účast a práce na textech z oficiálních dat. Bez pořadí a bez hodnocení.</p>
    <div class="home-cta">
      <a class="home-pill solid" href="poslanci.html">Najít poslance {_ARROW}</a>
      <a class="home-pill ghost" href="votes.html">Poslední hlasování</a>
    </div>
    <div class="hub-search home-search" role="search">
      <label for="hub-q" class="sr-only">Najdi poslance, stranu nebo hlasování</label>
      <input id="hub-q" type="search" autocomplete="off" placeholder="Najdi poslance, stranu nebo hlasování…" role="combobox" aria-expanded="false" aria-controls="hub-results" aria-autocomplete="list">
      <ul id="hub-results" class="hub-results" role="listbox" hidden></ul>
    </div>
    <p class="home-data">Data k {data_day} (export HowTheyVote) · aktualizace každý týden</p>
    </div>
    {EMBLEM}
  </div>
</section>"""

    doors = "".join(
        f'<a class="home-door door-{tone}" href="{href}"><div class="door-top"><span class="door-no">{no}</span>{_GLYPH[glyph]}</div>'
        f'<div><h3>{esc(title)}</h3><p>{esc(line)}</p><span class="door-go">Otevřít {_ARROW}</span></div></a>'
        for href, no, title, line, glyph, tone in DOORS)
    doors_html = f"""<section class="home-wrap" aria-labelledby="h-doors">
  <div class="home-head"><div><p class="home-kicker">Začněte tady</p><h2 id="h-doors">Tři cesty <strong>do dat.</strong></h2></div>
    <p class="home-sub">Podle lidí, podle hlasování, nebo podle práce mimo plénum.</p></div>
  <div class="home-doors">{doors}</div>
</section>"""

    rows = "".join(
        f'<a class="home-row" href="{href}"><span class="row-no">{i:02d}</span><span class="row-title">{esc(t)}</span>'
        f'<span class="row-line">{esc(line)}</span><span class="row-arrow">{_ARROW}</span></a>'
        for i, (href, t, line) in enumerate(MORE, 1))
    more_html = f"""<section class="home-wrap home-more" aria-labelledby="h-more">
  <div class="home-more-head"><p class="home-kicker">Další pohledy</p><h2 id="h-more">Zajímavé <strong>souvislosti.</strong></h2></div>
  <div class="home-rows">{rows}</div>
</section>"""

    band = f"""<section class="home-band" aria-label="Zásady">
  <div class="home-band-inner">
    <p>Každé číslo má <strong>odkaz na zdroj.</strong> Žádné pořadí, žádné známky.</p>
    <a class="home-pill ghost" href="o-projektu.html#metodika">Metodika a zdroje {_ARROW}</a>
  </div>
</section>"""

    body = hero + doors_html + more_html + band
    title = "EP Watch CZ – jak hlasují čeští europoslanci"
    desc = "Hlasování, účast na hlasování a statistiky českých europoslanců v 10. volebním období. Jen ověřená data z oficiálních zdrojů."
    meta = og_meta(title, desc, "", base_url, None, "EP Watch CZ – fakta a data o českých europoslancích")
    html = page(title, body, root="", current=None, description=desc, meta=meta, main_attrs='class="home-page"',
                scripts='<script src="app.js"></script>\n<script src="hub.js"></script>\n')
    return "index.html", html
