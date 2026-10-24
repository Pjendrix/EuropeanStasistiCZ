"""Rozcestník na „/“ (public/index.html, zadání R2): co na webu je, na jedné obrazovce.

Hero (vždy tmavé): oblouk 21 českých poslanců kolem nadpisu, pod ním poslední hlasování. Bez JavaScriptu statický stav
posledního závěrečného hlasování; public/portal.js ho oživí (hvězdy loga → křesla → barvy frakcí → 5 nejnovějších
závěrečných hlasování z home.json, pauza, tečky 1–5, bez pohybu při prefers-reduced-motion).
Dlaždice: každá je odkaz a čísla jsou jen z existujících JSON (home.json, session.json, quiz.json, overview.json,
groups.json), nic nového se tu nepočítá. Stránku Aktuálně (dřívější úvod) generuje hub.py.
"""

from __future__ import annotations

import json
from pathlib import Path

from build_pages import esc, fmt_date, fmt_num, og_meta, page
from categories import LABEL, icon_svg
from hub import (
    _range,
    POS_TXT,
    _ARROW,
    _SEARCH_ICON,
    _read,
    active_meps,
    hemi_slots,
    mosaic_html,
    party_text,
    seats_svg,
)
from layout import MODULES, QUIZ_HREF

# Oblouk rozcestníku: tři řady 0–180°, uvnitř volné místo pro nadpis (desktop) nebo číslo „pro : proti“ (mobil).
PORTAL_VB = (740, 384)
PORTAL_CX, PORTAL_CY = 370, 362
PORTAL_RINGS = ((246, 180, 0), (294, 180, 0), (342, 180, 0))
PORTAL_SEAT = 20
# Hvězdy loga (souřadnice symbolu v layout.BRAND_MARK), odkud se tečky na začátku animace rozletí do křesel.
LOGO_STARS = [(-40, -69.6), (0, -80.4), (40, -69.6), (69.2, -40.4), (80, -0.4), (69.2, 39.6), (40, 68.8), (0, 79.6), (-40, 68.8)]
LOGO_AT = (392, 214, 1.15)  # střed a měřítko loga uvnitř oblouku (jen pro animaci)
# Pořadí frakcí zleva doprava (stejné jako build_home.GROUP_ORDER a home.js).
GROUP_ORDER = ["GUE_NGL", "SD", "GREEN_EFA", "RENEW", "EPP", "ECR", "PFE", "ESN", "NI"]
RESULT_SHORT = {"ADOPTED": "přijato", "REJECTED": "zamítnuto"}


def counts_html(c: dict) -> str:
    """Počty pod obloukem (pro / proti / zdrželo se / nehlasovalo; nulové se vynechají kromě pro a proti)."""
    parts = [("F", "pro", "pt-F"), ("A", "proti", "pt-A"), ("B", "zdrželo se", "pt-B"), ("N", "nehlasovalo", "pt-N")]
    return "".join(
        f'<span><i class="{cls}" aria-hidden="true"></i>{fmt_num(c[k])} {t}</span>' for k, t, cls in parts if c.get(k) or k in "FA"
    )


def vote_caption(v: dict) -> dict:
    """Popisek jednoho hlasování (stejný text bez JS i po přepnutí v portal.js)."""
    res = RESULT_SHORT.get(v["result"], "výsledek neuveden")
    return {
        "k": f"Poslední hlasování · {fmt_date(v['date'])} · {res}",
        "t": v["title"],
        "href": f"v/{v['id']}",
        "c": counts_html(v["counts"]),
    }


def groups_caption(ppl: list[dict], groups: list[dict]) -> dict:
    """Popisek fáze „barvy frakcí“: počet poslanců, frakcí (nezařazení nejsou frakce) a legenda s počty."""
    by = {g["code"]: g for g in groups}
    cnt: dict[str, int] = {}
    for p in ppl:
        cnt[p["group"]] = cnt.get(p["group"], 0) + 1
    codes = [c for c in GROUP_ORDER if cnt.get(c)] + sorted(c for c in cnt if c not in GROUP_ORDER)
    n_groups = sum(1 for c in codes if c != "NI")
    legend = "".join(
        f'<span><i style="background:{esc((by.get(c) or {}).get("color") or "#94A3B8")}" aria-hidden="true"></i>'
        f"{esc('nezařazení' if c == 'NI' else (by.get(c) or {}).get('short_label') or c)} {cnt[c]}</span>"
        for c in codes
    )
    return {
        "k": f"Čeští europoslanci · {len(ppl)} v mandátu",
        "t": f"{len(ppl)} poslanců v {n_groups} {'frakci' if n_groups == 1 else 'frakcích'} Evropského parlamentu",
        "href": "poslanci",
        "c": legend,
    }


def hero_svg(vote: dict, colors: dict) -> str:
    slots = hemi_slots(len(vote["ppl"]), PORTAL_RINGS, PORTAL_CX, PORTAL_CY)
    c = vote["counts"]
    w, h = PORTAL_VB
    return (
        f'<svg viewBox="0 0 {w} {h}" id="pt-svg" role="group" '
        f'aria-label="Čeští poslanci jako tečky, barva a symbol podle hlasu; mezi poslanci se přechází šipkami">'
        f"{seats_svg(vote['ppl'], slots, PORTAL_SEAT, colors, titles=True)}"
        f'<g class="pt-score" aria-hidden="true" text-anchor="middle"><text class="pt-num" id="pt-num" x="{PORTAL_CX}" y="{PORTAL_CY - 28}" '
        f'font-size="96" font-weight="300">{c["F"]}<tspan class="hm-num-c" dx="3" dy="-6">:</tspan><tspan dx="3" dy="6">{c["A"]}</tspan></text>'
        f'<text class="pt-num-u" id="pt-num-u" x="{PORTAL_CX}" y="{PORTAL_CY + 2}" font-size="15" font-weight="700">PRO : PROTI</text></g></svg>'
    )


def days_badge(day: str | None) -> str:
    """Štítek „zasedání za N dní“: počet dní dopočítá portal.js podle dnešního data (stránka se nepřestavuje denně)."""
    return f'<span class="pt-badge" data-from="{esc(day)}" hidden></span>' if day else ""


def tiles_html(data_dir: Path, home: dict, overview: dict, groups: list[dict]) -> str:
    f, agenda = home["facts"], home.get("agenda") or {}
    session = _read(data_dir / "session.json") or {}
    quiz = _read(data_dir / "quiz.json") or {}
    sums = (_read(data_dir / "quiz_summaries.json") or {}).get("items", {})
    active = active_meps(overview)
    tiles = []

    # Aktuálně: poslední a další zasedání (session.json, home.json → agenda)
    rows = []
    if session.get("from"):
        rows.append(
            f'<div><span class="pt-l">Poslední zasedání</span><span class="pt-v">{_range(session["from"], session["to"])}</span>'
            f'<span class="pt-s">{fmt_num(session.get("main") or 0)} závěrečných hlasování</span></div>'
        )
    from agenda import effective, heading, today_cz

    agenda = effective(agenda or None, today_cz()) or {}
    if agenda.get("from"):
        n = agenda.get("votes") or 0
        what = (
            f"{fmt_num(n)} {'bod' if n == 1 else 'body' if 1 < n < 5 else 'bodů'} k hlasování v programu"
            if n
            else "program zatím nezveřejněn"
        )
        nb = agenda.get("following")
        after = f' data-after-from="{nb["from"]}" data-after-to="{nb["to"]}"' if nb else ""
        rows.append(
            f'<div class="pt-next" data-from="{agenda["from"]}" data-to="{agenda["to"]}"{after}><span class="pt-l">{heading(agenda)}</span>'
            f'<span class="pt-v">{_range(agenda["from"], agenda["to"])}</span><span class="pt-s">{what}</span></div>'
        )
    tiles.append(
        f'<a class="pt-tile pt-now" href="aktualne"><span class="pt-k">Aktuálně {days_badge(agenda.get("from"))}</span>'
        f"<h3>Co se stalo na posledním zasedání a co se chystá</h3>"
        f'<div class="pt-now-row">{"".join(rows)}</div><span class="pt-go">Otevřít přehled {_ARROW}</span></a>'
    )

    # Kvíz: počet otázek krátkého testu a náhled první otázky (název od AI podle čísla procedury, jinak úřední)
    qs = {q["id"]: q for q in quiz.get("questions", [])}
    short = [qs[i] for i in quiz.get("short", []) if i in qs]
    # Dvě prázdné karty za první otázkou dělají „balíček“; text má jen přední karta.
    cards = (
        '<span class="pt-qcard"></span><span class="pt-qcard"></span>'
        + f'<span class="pt-qcard">{esc((sums.get(short[0].get("procedure") or "") or {}).get("nazev") or short[0]["title"])}'
        + '<span class="pt-ops"><b>Pro</b><span>Proti</span><span>Zdržel/a</span></span></span>'
        if short
        else ""
    )
    tiles.append(
        f'<a class="pt-tile pt-quiz" href="{QUIZ_HREF}"><span class="pt-k">Kvíz · Moje shoda</span><h3>Jak byste <b>hlasovali vy?</b></h3>'
        f"<p>{fmt_num(len(short))} skutečných hlasování o zákonech. Na konci uvidíte, kdo z {fmt_num(len(active))} českých poslanců "
        f"hlasoval nejčastěji jako vy.</p>"
        f'<span class="pt-qstack" aria-hidden="true">{cards}</span><span class="pt-cta">Spustit kvíz {_ARROW}</span></a>'
    )

    # Poslanci: mozaika portrétů (stejná jako na Aktuálně)
    tiles.append(
        f'<div class="pt-tile pt-meps"><span class="pt-k">Poslanci</span><h3><a href="poslanci">{fmt_num(len(active))} profilů</a></h3>'
        f'<div class="pt-mosaic">{mosaic_html(active)}</div><a class="pt-go" href="poslanci">Všichni poslanci {_ARROW}</a></div>'
    )

    # Hlasování: počet jmenovitých hlasování a sloupečky po měsících (home.json → facts.monthly), všechny ve stejném měřítku
    monthly = f.get("monthly") or []
    mx = max((m["votes"] for m in monthly), default=0) or 1
    ym = lambda s: f"{int(s[5:7])}/{s[:4]}"  # noqa: E731
    bars = "".join(f'<i style="height:{m["votes"] / mx * 100:.1f}%" title="{ym(m["month"])}: {fmt_num(m["votes"])}"></i>' for m in monthly)
    axis = f'<span class="pt-ax"><span>{ym(monthly[0]["month"])}</span><span>{ym(monthly[-1]["month"])}</span></span>' if monthly else ""
    tiles.append(
        f'<a class="pt-tile" href="hlasovani"><span class="pt-k">Hlasování</span><span class="pt-big">{fmt_num(f["votes_total"])}</span>'
        f"<p>jmenovitých hlasování od {fmt_date(f['votes_from'])}; sloupec = počet hlasování v měsíci (nejvíc {fmt_num(mx)})</p>"
        f'<span class="pt-spark" role="img" aria-label="Počet jmenovitých hlasování po měsících, nejvíc {fmt_num(mx)} za měsíc">{bars}</span>{axis}</a>'
    )

    # Strany a frakce: počet stran (home.json) a frakcí s českými poslanci k poslednímu hlasování (stejná data jako oblouk;
    # nezařazení nejsou frakce), štítky v barvách frakcí
    by = {g["code"]: g for g in groups}
    now_groups = {p["group"] for p in home["votes"][0]["ppl"]}
    codes = [c for c in GROUP_ORDER if c in now_groups]
    frakce = [c for c in codes if c != "NI"]
    chips = "".join(
        f'<span><i style="background:{esc((by.get(c) or {}).get("color") or "#94A3B8")}" aria-hidden="true"></i>'
        f"{esc('nezařazení' if c == 'NI' else (by.get(c) or {}).get('short_label') or c)}</span>"
        for c in codes
    )
    n_f = len(frakce)
    tiles.append(
        f'<a class="pt-tile" href="party"><span class="pt-k">Strany a frakce</span>'
        f"<h3>{fmt_num(f['parties'])} {'stran' if f['parties'] >= 5 else 'strany'} · {n_f} {'frakce' if 0 < n_f < 5 else 'frakcí'}</h3>"
        f'<p>Jak hlasují české strany a evropské frakce.</p><span class="pt-gchips">{chips}</span></a>'
    )

    # Práce poslanců (home.json → facts.work)
    w = f.get("work") or {}
    tiles.append(
        f'<a class="pt-tile" href="prace"><span class="pt-k">Práce poslanců</span><h3>Projevy, otázky, zprávy</h3>'
        f'<span class="pt-stats"><span><b>{fmt_num(w.get("speeches", 0))}</b>projevů</span><span><b>{fmt_num(w.get("questions", 0))}</b>otázek</span>'
        f'<span><b>{fmt_num(w.get("reports_lead", 0))}</b>zpráv jako zpravodaj</span></span><span class="pt-go">Podle poslanců {_ARROW}</span></a>'
    )

    # Analýzy: tři odkazy, čísla z home.json → facts
    tiles.append(
        f'<div class="pt-tile pt-an"><span class="pt-k">Analýzy</span><ul class="pt-links">'
        f'<li><a href="rozkol">Kde se Češi rozdělili <small>{fmt_num(f["united_final"])} z {fmt_num(f["considered_final"])} jednotně</small></a></li>'
        f'<li><a href="rozhodujici">Kde rozhodly české hlasy <small>{fmt_num(f["decisive"])}×</small></a></li>'
        f'<li><a href="shoda">Kdo s kým hlasuje <small>{_ARROW}</small></a></li></ul></div>'
    )

    # Témata: štítky 12 témat (categories.py), každý vede na seznam hlasování s filtrem
    topics = "".join(
        f'<a href="votes?c={k}"><span class="cat-ico sm" aria-hidden="true">{icon_svg(k)}</span>{esc(v)}</a>' for k, v in LABEL.items()
    )
    tiles.append(
        f'<div class="pt-tile pt-topics"><span class="pt-k">Témata</span><h3><a href="temata">Hlasování podle témat</a></h3>'
        f'<div class="pt-tchips">{topics}</div></div>'
    )

    # O projektu
    tiles.append(
        '<div class="pt-tile pt-about"><div><span class="pt-k">O projektu</span><h3><a href="o-projektu">Každé číslo má odkaz na zdroj</a></h3>'
        "<p>Oficiální data, otevřené výpočty, bez pořadí a známek.</p></div>"
        '<div class="pt-src"><a href="https://howtheyvote.eu">HowTheyVote.eu</a><a href="https://data.europarl.europa.eu">EP Open Data</a>'
        '<a href="https://github.com/Pjendrix/ep-watch-cz-open">Kód na GitHubu</a></div></div>'
    )
    return "".join(tiles)


def tasks_html(n_active: int) -> str:
    """Tři hlavní úkoly návštěvníka (audit UX 2026-10-18): najít poslance, najít hlasování, porovnat postoje."""
    tasks = [
        (
            "Najít poslance",
            f"Jak hlasuje, jak často chybí a na čem pracuje každý z {fmt_num(n_active)} českých poslanců v mandátu.",
            [("poslanci", "Všichni poslanci"), ("party", "Strany a frakce")],
        ),
        (
            "Najít hlasování",
            "Podle názvu, čísla dokumentu nebo tématu; u každého hlasování, jak hlasovali Češi a co znamenal hlas pro.",
            [("votes", "Databáze hlasování"), ("temata", "Podle témat"), ("radar", "Co se chystá")],
        ),
        (
            "Porovnat postoje",
            "Kdo s kým hlasuje stejně, kde se Češi rozdělili a se kterými poslanci se shodujete vy.",
            [("shoda", "Kdo s kým hlasuje"), ("kviz", "Kvíz"), ("analyzy", "Všechny analýzy")],
        ),
    ]
    more = lambda links: " · ".join(f'<a href="{h}">{esc(t)}</a>' for h, t in links)  # noqa: E731
    cards = "".join(
        f'<li class="pt-task"><h3><a href="{links[0][0]}">{esc(title)} {_ARROW}</a></h3><p>{esc(text)}</p>'
        f'<p class="pt-task-links">{more(links[1:])}</p></li>'
        for title, text, links in tasks
    )
    return (
        '<section class="pt-wrap pt-tasks-wrap" aria-labelledby="h-tasks">'
        '<div class="pt-head"><h2 id="h-tasks">Co chcete <strong>zjistit?</strong></h2></div>'
        f'<ul class="pt-tasks">{cards}</ul></section>'
    )


def _prelim_vote(v: dict, people: dict, parties: dict, groups: dict, title: bool) -> str:
    """Jedno předběžné hlasování: výsledek, počty EP, souhrn Čechů a rozbalení na jména (frakce a strana k datu)."""
    from preliminary import FIX_LABEL, POS_LABEL, POS_ORDER, RESULT_LABEL, cz_summary

    c, cz = v["counts"], cz_summary(v)
    head = f'<p class="pl-t">{esc(v["title"])}</p>' if title and v.get("title") else ""
    names = []
    for pos in POS_ORDER:
        rows = sorted((r for r in v["cz"] if r[1] == pos), key=lambda r: people[r[0]]["sort_label"])
        if not rows:
            continue
        items = []
        for mid, _, gcode, pid in rows:
            m = people[mid]
            g = "nezařazení" if gcode == "NI" else (groups.get(gcode) or {}).get("short_label") or gcode or "bez frakce"
            party = (parties.get(pid) or {}).get("short_label") or "–"
            fix = v["corrections"].get(str(mid))
            note = f' <span class="muted">(oprava hlasu po hlasování: {FIX_LABEL[fix]})</span>' if fix else ""
            items.append(
                f'<li><a href="p/{mid}">{esc(m["given_name"])} {esc(m["family_name"])}</a> <span class="muted">{esc(party)} · {esc(g)}</span>{note}</li>'
            )
        names.append(f"<li><strong>{POS_LABEL[pos]} ({len(rows)})</strong><ul>{''.join(items)}</ul></li>")
    summary = " · ".join(f"{POS_LABEL[p]} {cz[p]}" for p in POS_ORDER)
    return f"""<li class="pl-vote">{head}
  <p class="pl-label">{esc(v["label"] or "")} <span class="small muted">({fmt_date(v["date"])})</span></p>
  <p class="pl-res"><strong>{RESULT_LABEL[v["result"]]}</strong> <span class="muted">· celý EP: pro {fmt_num(c["for"])}, proti {fmt_num(c["against"])}, zdrželo se {fmt_num(c["abstention"])}</span></p>
  <p class="pl-cz">Čeští poslanci: {summary}</p>
  <details class="pl-names"><summary>Jak hlasovali jmenovitě ({len(v["cz"])})</summary><ul class="pl-pos">{"".join(names)}</ul></details>
</li>"""


def preliminary_html(data_dir: Path) -> str:
    """Blok „Poslední zasedání: předběžně“ (zadání 24. 10. 2026, C3). Prázdný, když nejsou předběžná data novější než HowTheyVote."""
    from preliminary import HTV_VOTES, check_day, home_items, htv_last_day, pending_days
    from session_page import session_view

    prelim_dir = data_dir / "preliminary"
    days = [_read(prelim_dir / f"{d}.json") for d in pending_days(prelim_dir, htv_last_day(data_dir / "votes"))]
    days = [d for d in days if d]
    if not days:
        return ""
    for d in days:
        check_day(d)
    meps = (_read(data_dir / "meps.json") or {}).get("meps", [])
    people = {m["id"]: m for m in meps}
    parties = {int(p["id"]): p for p in _read(data_dir / "parties.json") or [] if str(p.get("id", "")).isdigit()}
    groups = {g["code"]: g for g in _read(data_dir / "groups.json") or []}
    radar = _read(data_dir / "radar.json")
    s = (radar or {}).get("session") or {}
    picks = []
    if s and any(s["from"] <= d["date"] <= s["to"] for d in days):
        view = session_view(radar, _read(data_dir / "proposals.json"), [], people, None)
        picks = (view or {}).get("picks", [])
    picked, rest = home_items(days, radar, picks)
    if not picked and not rest:
        return ""
    blocks = "".join(
        f'<li class="pl-item"><h3>{esc(it["title"])}</h3><ul class="pl-votes">'
        + "".join(_prelim_vote(dict(v, title=None), people, parties, groups, False) for v in it["votes"])
        + "</ul></li>"
        for it in picked
    )
    others = ""
    if rest:
        inner = "".join(_prelim_vote(v, people, parties, groups, True) for v in rest)
        label = "Další hlasování o celých textech" if picked else "Hlasování o celých textech"
        others = f'<details class="pl-more"{"" if picked else " open"}><summary>{label} ({len(rest)})</summary><ul class="pl-votes">{inner}</ul></details>'
    when = ", ".join(fmt_date(d["date"]) for d in days)
    sources = ", ".join(f'<a href="{esc(d["source"])}">{fmt_date(d["date"])}</a>' for d in days)
    fetched = max(d["fetched"] for d in days)
    return f"""<section class="pt-wrap pl" aria-labelledby="h-prelim">
  <div class="pt-head"><h2 id="h-prelim">Poslední zasedání: <strong>předběžně</strong></h2><p>Jmenovitá hlasování {when} · staženo {fmt_date(fetched)} {esc(fetched[11:16])}</p></div>
  <p class="pl-note" role="note"><span class="tag pl-tag">Předběžné</span> Předběžné výsledky z dokumentů EP, ještě neověřené.
    Do statistik se započítají po zveřejnění exportu HowTheyVote (obvykle do týdne).</p>
  {f'<ul class="pl-items">{blocks}</ul>' if blocks else ""}
  {others}
  <p class="small muted pl-src">Zdroj: EP Open Data API ({sources}). Ověřená data: <a href="{HTV_VOTES}">howtheyvote.eu/votes</a>.
    Hlas = zaznamenaný hlas; opravy hlasu jen uvádíme, výsledek nemění. <a href="o-projektu#predbezne">Co znamená předběžné</a>.</p>
</section>"""


def portal_page(data_dir: Path, base_url: str | None) -> tuple[str, str]:
    home = _read(data_dir / "home.json")
    if not home or not home.get("votes"):
        raise ValueError("chybí data/home.json (spusť build_web.py)")
    overview = _read(data_dir / "overview.json")
    groups = _read(data_dir / "groups.json")
    votes = home["votes"]
    first = votes[0]
    colors = {g["code"]: g.get("color") or g.get("chart_color") for g in groups}
    by = {g["code"]: g for g in groups}
    lx, ly, ls = LOGO_AT

    # Data pro portal.js: popisky hlasování hotové z Pythonu (jeden zdroj textu), hlasy podle poslance, frakce pro fázi barev.
    payload = {
        "votes": [
            {"id": v["id"], "cap": vote_caption(v), "counts": v["counts"], "pos": {str(p["id"]): p["pos"] for p in v["ppl"]}} for v in votes
        ],
        "groups": groups_caption(first["ppl"], groups),
        "group_of": {
            str(p["id"]): ("nezařazení" if p["group"] == "NI" else (by.get(p["group"]) or {}).get("short_label") or p["group"])
            for p in first["ppl"]
        },
        "names": {str(p["id"]): p["name"] for p in first["ppl"]},
        "party": {str(p["id"]): party_text(p) for p in first["ppl"]},
        "pos_txt": POS_TXT,
        "stars": [[round(lx + ls * x, 1), round(ly + ls * y, 1)] for x, y in LOGO_STARS],
        "logo": [lx, ly, ls],
    }
    data_json = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    cap = vote_caption(first)
    dots = "".join(
        f'<button type="button" class="pt-d" data-i="{i}" aria-label="Hlasování {i + 1} z {len(votes)}"{' aria-current="true"' if i == 0 else ""}></button>'
        for i in range(len(votes))
    )
    hero = f"""<section class="pt-hero" aria-labelledby="h1">
  <div class="pt-inner">
    <p class="pt-eyebrow">Nezávislý přehled z oficiálních dat · od 16. 7. 2024</p>
    <div class="pt-art" id="pt-art">
      <h1 id="h1">Co dělají v Bruselu <strong>čeští europoslanci<span class="hm-stop" aria-hidden="true"></span></strong></h1>
      {hero_svg(first, colors)}
    </div>
    <div class="pt-cap">
      <div class="pt-cap-top"><span class="pt-capk" id="pt-k">{esc(cap["k"])}</span>
        <span class="pt-ctl" id="pt-ctl" role="group" aria-label="Přepínání hlasování" hidden>{dots}<button type="button" class="pt-pp" id="pt-pp" aria-label="Pozastavit přehrávání"></button></span></div>
      <a class="pt-t" id="pt-t" href="{cap["href"]}">{esc(cap["t"])}</a>
      <div class="pt-c" id="pt-c">{cap["c"]}</div>
      <p class="sr-only" id="pt-live" aria-live="polite"></p>
    </div>
    <form class="hm-search pt-search" role="search" action="poslanci" method="get">
      <label for="hub-q">{_SEARCH_ICON}<span class="sr-only">Najdi poslance, stranu nebo hlasování</span>
        <input id="hub-q" name="q" type="search" autocomplete="off" placeholder="Najdi poslance, stranu nebo hlasování…" role="combobox" aria-expanded="false" aria-controls="hub-results" aria-autocomplete="list" aria-haspopup="listbox"><kbd aria-hidden="true">/</kbd><button class="hm-go" type="submit">Hledat</button></label>
      <ul id="hub-results" class="hm-results" role="listbox" aria-label="Výsledky hledání" hidden></ul>
    </form>
  </div>
  <script type="application/json" id="portal-data">{data_json}</script>
</section>"""
    body = f"""{hero}
{preliminary_html(data_dir)}
{tasks_html(len(active_meps(overview)))}
<section class="pt-wrap" aria-labelledby="h-tiles">
  <div class="pt-head"><h2 id="h-tiles">Novinky a <strong>přehledy</strong></h2><p>Data: HowTheyVote.eu a EP Open Data · aktualizace každý týden</p></div>
  <div class="pt-bento">{tiles_html(data_dir, home, overview, groups)}</div>
</section>"""
    title = "EP Watch CZ – jak hlasují čeští europoslanci"
    desc = "Hlasování, účast na hlasování a statistiky českých europoslanců v 10. volebním období. Jen ověřená data z oficiálních zdrojů."
    meta = og_meta(title, desc, "", base_url, None, "EP Watch CZ – fakta a data o českých europoslancích")
    from layout import INSTAGRAM, REPO

    org = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "EP Watch CZ",
        **({"url": base_url.rstrip("/") + "/", "logo": base_url.rstrip("/") + "/assets/brand/apple-touch-icon.png"} if base_url else {}),
        "sameAs": [INSTAGRAM, REPO],
    }
    meta += f'<script type="application/ld+json">{json.dumps(org, ensure_ascii=False)}</script>\n'
    html = page(
        title,
        body,
        root="",
        current=None,
        description=desc,
        meta=meta,
        main_attrs='class="portal-page"',
        scripts=MODULES.format(root="", page="portal.js"),
    )
    return "index.html", html
