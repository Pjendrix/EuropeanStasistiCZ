"""Úvodní stránka jako rozcestník (X11): generuje se staticky (index.html), JavaScript (hub.js) jen přidává
vyhledávání a přepínač období. Seznam poslanců je na poslanci.html.

Pořadí bloků: hero s vyhledáváním → poslední zasedání → česká delegace → Prozkoumejte (6 dlaždic s živými čísly)
→ klíčová hlasování (D13) → O datech. Žádná tabulka, každý blok nejvýš 5 položek a odkaz „vše“. Všechna čísla
jsou z data/*.json (compute_stats.py, build_web.py), nic se tu nepočítá nově kromě součtů a skládání vět.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from build_pages import (POSITIONS, RESULT_LABEL, esc, fmt_date, fmt_num, fmt_pct, group_label, meps_count, page,
                         og_meta, split_bar)
from categories import ICON, LABEL, icon_svg
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


def key_votes_html(kv: dict) -> str:
    """Čtyři seznamy za celé období: zákony od nejnovějších, ostatní podle svého pravidla. Přepínač období tu není:
    výběr za kratší období se od celého skoro neliší a ukazoval by pořád stejná hlasování, poslední zasedání má blok výš."""
    out = ['<div class="hub-lists">']
    for name, (title, rule) in LIST_TITLES.items():
        lst = kv["lists"]["all"][name]
        items = "".join(vote_card(kv["votes"][str(i["id"])], i["reason"]) for i in lst["items"]) or '<p class="muted small">Nic.</p>'
        more = (f'<p class="small"><a href="votes.html?f=final">všechna závěrečná hlasování</a> ({fmt_num(lst["total"])} v 10. období)</p>'
                if lst["total"] > len(lst["items"]) else "")
        out.append(f'<section class="hub-list"><h3>{esc(title)}</h3><p class="small muted">{esc(rule)}</p>{items}{more}</section>')
    out.append("</div>")
    out.append(f'<p class="small muted">{esc(kv["note"])} <a href="o-projektu.html#metodika">Jak počítáme</a>.</p>')
    return "".join(out)


def hub_page(data_dir: Path, base_url: str | None) -> tuple[str, str]:
    overview = _read(data_dir / "overview.json")
    groups = _read(data_dir / "groups.json")
    parties = _read(data_dir / "parties.json")
    session = _read(data_dir / "session.json")
    kv = _read(data_dir / "key_votes.json")
    work = _read(data_dir / "work.json")
    bench = _read(data_dir / "benchmarks.json")
    meps = overview["meps"]
    active = [m for m in meps if _active(m)]
    release = overview["sources"]["votes"].get("release")
    release = release if re.fullmatch(r"\d{4}-\d{2}-\d{2}", release or "") else None  # tag exportu HowTheyVote je datum
    dname = lambda m: " ".join(x for x in (m.get("given_name"), m.get("family_name")) if x) or m["name"]
    avatar = lambda m, size=44: (f'<a class="hub-av" href="p/{m["id"]}.html" title="{esc(dname(m))}"><img src="assets/photos/thumbs/{m["id"]}.webp" '
                                 f'alt="{esc(dname(m))}" width="{size}" height="{size}" loading="lazy"></a>' if m.get("photo_url") else "")

    # --- hero -------------------------------------------------------------------------
    hero = f"""<section class="hub-hero" aria-labelledby="h1">
  <h1 id="h1">Jak hlasují čeští europoslanci</h1>
  <p class="lead">Jmenovitá hlasování, účast a spolupráce napříč frakcemi. Ověřená data, čísla počítá skript, ne AI.</p>
  <div class="hub-search" role="search">
    <label for="hub-q" class="sr-only">Najdi poslance, stranu nebo hlasování</label>
    <input id="hub-q" type="search" autocomplete="off" placeholder="Najdi poslance, stranu nebo hlasování…" role="combobox" aria-expanded="false" aria-controls="hub-results" aria-autocomplete="list">
    <ul id="hub-results" class="hub-results" role="listbox" hidden></ul>
  </div>
  <p class="small muted">Data k {fmt_date(release) if release else fmt_date(overview["period"]["to"])} (export HowTheyVote) · hlasování {fmt_date(overview["period"]["from"])} – {fmt_date(overview["period"]["to"])} · aktualizace každý týden</p>
</section>"""

    # --- poslední zasedání ---------------------------------------------------------------
    sess_votes = []
    for name in ("laws", "splits", "close", "against_result"):
        for it in kv["lists"]["session"][name]["items"]:
            if it["id"] not in [i for i, _ in sess_votes]:
                sess_votes.append((it["id"], it["reason"]))
    sess_cards = "".join(vote_card(kv["votes"][str(i)], r) for i, r in sess_votes[:3])
    session_html = f"""<section class="hub-block" aria-labelledby="h-sess">
  <h2 id="h-sess">Co se naposledy odhlasovalo</h2>
  <p>Zasedání {fmt_date(session["from"])} – {fmt_date(session["to"])}: {fmt_num(session["votes"])} jmenovitých hlasování, z toho {fmt_num(session["main"])} závěrečných
    ({fmt_num(session["adopted_main"])} přijato). <a href="votes.html?od={session["from"]}&amp;m={session["to"][:7]}&amp;f=final">Celé zasedání</a></p>
  <div class="hub-lists three">{sess_cards}</div>
</section>"""

    # --- česká delegace -----------------------------------------------------------------
    by_group: dict[str, list[dict]] = {}
    for m in active:
        by_group.setdefault((m.get("group") or {}).get("code") or "", []).append(m)
    order = sorted(by_group, key=lambda g: (-len(by_group[g]), group_label(g or None, groups)))
    strip = "".join(
        f'<div class="hub-group"><span class="small muted">{esc(group_label(g or None, groups))}</span><div class="hub-avs">'
        + "".join(avatar(m) for m in sorted(by_group[g], key=lambda m: m.get("sort_label") or m["name"])) + "</div></div>" for g in order)
    att = [sum(m["total"]["attendance"][0] for m in active), sum(m["total"]["attendance"][1] for m in active)]
    med = ((bench or {}).get("ep") or {}).get("attendance")
    delegation_html = f"""<section class="hub-block" aria-labelledby="h-del">
  <h2 id="h-del">Kdo jsou čeští poslanci</h2>
  <div class="hub-strip">{strip}</div>
  <p class="small">Účast delegace na hlasování {fmt_pct(att)}{f" · medián celého EP {fmt_pct(med)}" if med else ""}. Každý poslanec má vlastní stránku, <a href="poslanci.html">půlkruh a tabulka</a> jsou na stránce Poslanci.</p>
</section>"""

    # --- Prozkoumejte (živé dlaždice) ------------------------------------------------------
    lead = sum(m["lead_reports"] for m in work["meps"] if m.get("delegation")) if work else 0
    shadow = sum(m["shadow_reports"] for m in work["meps"] if m.get("delegation")) if work else 0
    logos = "".join(f'<img class="hub-logo" src="{esc(p["logo"])}" alt="{esc(p.get("name") or p["short_label"])}" height="24" loading="lazy">'
                    for p in parties if p.get("logo") and not p.get("independent"))
    ts = session["top_splits_main"][0] if session.get("top_splits_main") else None
    tiles = [
        ("poslanci.html", "Poslanci", '<div class="hub-avs">' + "".join(
            f'<img src="assets/photos/thumbs/{m["id"]}.webp" alt="" width="36" height="36" loading="lazy">' for m in active[:5] if m.get("photo_url")) + "</div>" + f'<p class="small muted">{len(active)} v mandátu, {len(meps) - len(active)} {"bývalý" if len(meps) - len(active) == 1 else "bývalí"}</p>'),
        ("party.html", "Strany", f'<div class="hub-logos">{logos}</div>'),
        ("votes.html", "Hlasování", f'<p class="hub-num">{fmt_num(overview["votes_total"])}</p><p class="small muted">jmenovitých hlasování, poslední {fmt_date(overview["period"]["to"])}</p>'),
        ("rozkol.html", "Kde se Češi rozdělili", (f'<p class="hub-num">{ts["cz"][0]} : {ts["cz"][1]}</p><p class="small muted">poslední: {esc(ts["title"][:80])}{"…" if len(ts["title"]) > 80 else ""}</p>' if ts else "")),
        ("shoda.html", "Kdo s kým hlasuje", f'<p class="hub-num">{len(active)} × {len(active)}</p><p class="small muted">shoda každé dvojice poslanců</p>'),
        ("prace.html", "Práce poslanců", f'<p class="hub-num">{fmt_num(lead)} + {fmt_num(shadow)}</p><p class="small muted">zpráv vedou Češi jako zpravodajové + stínové zprávy za frakci</p>'),
    ]
    explore = "".join(f'<a class="card hub-tile" href="{h}"><h3>{esc(t)}</h3>{body}</a>' for h, t, body in tiles)
    explore_html = f'<section class="hub-block" aria-labelledby="h-exp"><h2 id="h-exp">Co tu najdete</h2><div class="hub-tiles">{explore}</div></section>'

    # --- klíčová hlasování -------------------------------------------------------------------
    key_html = f'<section class="hub-block" aria-labelledby="h-key"><h2 id="h-key">Klíčová hlasování</h2>{key_votes_html(kv)}</section>'

    about = """<section class="hub-block" aria-labelledby="h-data"><h2 id="h-data">O datech</h2><ul class="plain hub-about">
  <li><strong>Zdroje.</strong> HowTheyVote.eu (ODbL) a EP Open Data (CC BY 4.0). Žádný scraping webu, každé číslo má odkaz na zdroj.</li>
  <li><strong>Čísla počítá skript, ne AI.</strong> Kód je otevřený, metodika má definici u každé metriky a záznam oprav.</li>
  <li><strong>Chyba?</strong> <a href="o-projektu.html#kontakt">Nahlaste ji</a>, opravíme ji a zapíšeme do změn metodiky.</li>
</ul><p class="small"><a href="o-projektu.html#metodika">Jak počítáme</a></p></section>"""

    body = hero + session_html + delegation_html + explore_html + key_html + about
    title = "EP Watch CZ – jak hlasují čeští europoslanci"
    desc = "Hlasování, účast na hlasování a statistiky českých europoslanců v 10. volebním období. Jen ověřená data z oficiálních zdrojů."
    meta = og_meta(title, desc, "", base_url, None, "EP Watch CZ – fakta a data o českých europoslancích")
    html = page(title, body, root="", current=None, description=desc, meta=meta,
                scripts='<script src="app.js"></script>\n<script src="hub.js"></script>\n')
    return "index.html", html
