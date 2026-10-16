"""Úvodní stránka jako vstupní brána (index.html) a bloky vkládané do ručních stránek.

- hub_page: hero s hemicyklem pěti nejnovějších závěrečných hlasování (data/home.json), hledání (hub.js), pruh faktů,
  tři cesty do dat (bento), další pohledy a pás zásad. Čísla jen z JSON, žádné natvrdo.
- heads_html: portréty poslanců po frakcích, blok na poslanci.html (build_pages.sync_block).
- votes_overview_html: poslední zasedání a klíčová hlasování, přehled na hlasovani.html. Tabulka s filtry je na votes.html.

Všechna čísla jsou z data/*.json (compute_stats.py, build_web.py), nic se tu nepočítá nově kromě součtů a skládání vět.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

from build_pages import (POSITIONS, RESULT_LABEL, esc, topic_chips, fmt_date, fmt_num, fmt_pct, group_label, meps_count, page,
                         og_meta, split_bar)
from categories import ICON, LABEL, icon_svg
from hero_art import STARS
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
        out.append(f'<section class="hub-list"><h3>{esc(title)}</h3><p class="small muted">{esc(rule)}</p><div class="hub-cards">{items}</div>{more}</section>')
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
  <div class="vo-chips"><span class="vo-label">Další pohledy</span>{chips}<a class="vo-chip vo-chip-main" href="votes.html">Všechna hlasování{arrow}</a></div>
</div>
<section class="hub-block" aria-labelledby="h-sess">
  <h2 id="h-sess">Co se naposledy odhlasovalo</h2>
  <p class="small muted">Zasedání {fmt_date(session["from"])} – {fmt_date(session["to"])} · <a href="votes.html?od={session["from"]}&amp;m={session["to"][:7]}&amp;f=final">Celé zasedání</a></p>
  <div class="hub-lists three hub-cards">{sess_cards}</div>
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
            <div class="k-note">od {fmt_date(overview["period"]["from"])} · <a href="votes.html">seznam hlasování</a></div></div>
          <div class="kpi"><div class="k-label">Na posledním zasedání</div><div class="k-value">{fmt_num(session["votes"])}</div>
            <div class="k-note">{fmt_num(session["main"])} závěrečných, {fmt_num(session["adopted_main"])} přijato · <a href="votes.html?od={session["from"]}&amp;m={session["to"][:7]}&amp;f=final">celé zasedání</a></div></div>
        </div>
      </div>
    </div>
    {picker}
  </div>
</section>"""


# --- úvodní stránka (revize úvodu U1–U6) ---------------------------------------------------------

_ARROW = ('<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
          'stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>')
_SEARCH_ICON = ('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
                'aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>')
_SHARE_ICON = ('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
               'stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>')
_CHEV = {"prev": '<path d="M15 6l-6 6 6 6"/>', "next": '<path d="M9 6l6 6-6 6"/>'}

# Hemicykl: stejná geometrie jako renderDelegation v public/home.js (dvě řady, poloměry 96 a 150), viewBox 400 × 232.
HEMI_CX, HEMI_CY, HEMI_R = 200, 204, (96, 150)
# Symboly hlasu uvnitř tečky (barva sama nestačí): ✓ pro, ✕ proti, – zdržel se; nehlasoval = prázdný kroužek.
SYM = {"F": "M-5.5 1 L-1.8 4.8 L5.8 -4.2", "A": "M-4.6 -4.6 L4.6 4.6 M4.6 -4.6 L-4.6 4.6", "B": "M-5.2 0 L5.2 0"}
POS_TXT = {"F": "pro", "A": "proti", "B": "zdržel/a se", "N": "nehlasoval/a", "X": "v den hlasování nebyl/a v mandátu"}
LEGEND = [("F", "pro"), ("A", "proti"), ("B", "zdrželo se"), ("N", "nehlasovalo")]

QUICK = [("poslanci.html", "Poslanci"), ("party.html", "Strany"), ("hlasovani.html", "Hlasování"), ("prace.html", "Práce poslanců")]
MORE = [
    ("party.html", "Strany", "Jak hlasují české strany.", None),
    ("temata.html", "Podle témat", "Kde se hlasuje nejvíc a jak v tom Češi.", None),
    ("rozkol.html", "Kde se Češi rozdělili", "Závěrečná hlasování, v nichž se čeští poslanci neshodli.", "unity"),
    ("rozhodujici.html", "Kde rozhodly české hlasy", "Těsná hlasování, která by bez nich dopadla opačně.", "decisive"),
    ("shoda.html", "Shoda mezi Čechy", "Jak často hlasovali dva poslanci stejně.", None),
]


def hemi_slots(n: int) -> list[tuple[float, float]]:
    """Místa pro n teček: počet v řadě úměrný poloměru, seřazená zleva doprava (zrcadlově jako home.js)."""
    inner = max(1, round(n * HEMI_R[0] / sum(HEMI_R)))
    out = []
    for k, r in ((inner, HEMI_R[0]), (n - inner, HEMI_R[1])):
        for i in range(k):
            a = math.pi - (0.5 if k == 1 else i / (k - 1)) * math.pi
            out.append((a, r, HEMI_CX + r * math.cos(a), HEMI_CY - r * math.sin(a)))
    out.sort(key=lambda s: (-s[0], -s[1] if s[0] > math.pi / 2 else s[1]))
    return [(x, y) for _, _, x, y in out]


def _dot_svg(pos: str) -> str:
    """Malá tečka do legendy (stejný symbol jako v hemicyklu)."""
    if pos == "N":
        return '<svg viewBox="-13 -13 26 26" aria-hidden="true"><circle r="10.5" class="hm-n"/></svg>'
    return f'<svg viewBox="-13 -13 26 26" aria-hidden="true"><circle r="13" class="hm-{pos}"/><path class="hm-sym" d="{SYM[pos]}"/></svg>'


def party_text(p: dict) -> str:
    return "nezávislý/á" if p.get("ind") or not p.get("party") or p.get("party") in ("Independent", "Ind.") else p["party"]


def hemi_html(vote: dict) -> str:
    """Hemicykl 21 teček pro jedno hlasování (pořadí teček pevné, hlas v data-pos); tečka je odkaz na profil."""
    ppl = vote["ppl"]
    slots = hemi_slots(len(ppl))
    stars = "".join(
        f'<path class="hm-star" transform="translate({HEMI_CX + 188 * math.cos(math.pi - k * math.pi / 6):.1f} '
        f'{HEMI_CY - 188 * math.sin(math.pi - k * math.pi / 6):.1f}) scale(.62)" d="M0-9.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L0 4.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z"/>'
        for k in range(7))
    seats = "".join(
        f'<g transform="translate({x:.1f} {y:.1f})"><a class="hm-seat" href="p/{p["id"]}.html" data-i="{i}" data-id="{p["id"]}" '
        f'data-party="{esc(party_text(p))}" data-pos="{p["pos"]}" style="--i:{i}" aria-label="{esc(p["name"])}, {esc(party_text(p))}">'
        f'<circle class="hm-ring" r="15.5"/><g transform="scale(.86)"><circle class="hm-f" r="13"/>'
        + "".join(f'<path class="hm-sym hm-s{k}" d="{d}"/>' for k, d in SYM.items()) + "</g></a></g>"
        for i, (p, (x, y)) in enumerate(zip(ppl, slots)))
    c = vote["counts"]
    return (f'<svg viewBox="0 0 400 232" class="hm-ring-stars" aria-hidden="true">{stars}</svg>'
            f'<svg viewBox="0 0 400 232" class="hm-seats" role="group" aria-label="Čeští poslanci jako tečky, barva a symbol podle hlasu">{seats}</svg>'
            f'<div class="hm-center" aria-hidden="true"><div class="hm-big" id="hm-big">{c["F"]}<em>:</em>{c["A"]}</div><div class="hm-u">pro : proti</div></div>'
            '<div class="hm-tip" id="hm-tip" aria-hidden="true"></div>')


def caption_html(vote: dict) -> str:
    """Popisek pod hemicyklem: datum, typ, výsledek, titul (bez překladu, jak ho dodává HowTheyVote), legenda s nenulovými počty."""
    ok = vote["result"] == "ADOPTED"
    res = (f'<span class="hm-res{"" if ok else " no"}">{"✓ Přijato" if ok else "✕ Zamítnuto" if vote["result"] == "REJECTED" else esc(RESULT_LABEL.get(vote["result"], "výsledek neuveden"))}</span>')
    legend = "".join(f'<li>{_dot_svg(k)}<span><b>{vote["counts"][k]}</b> {label}</span></li>' for k, label in LEGEND if vote["counts"][k])
    if vote["counts"].get("X"):
        legend += f'<li><svg viewBox="-13 -13 26 26" aria-hidden="true"><circle r="10.5" class="hm-x"/></svg><span><b>{vote["counts"]["X"]}</b> mimo mandát</span></li>'
    return (f'<div class="hm-cap-meta"><span>{fmt_date(vote["date"])}</span><span class="hm-tag">{esc(vote["kind_label"])}</span>{res}</div>'
            f'{hero_topic(vote)}<p class="hm-cap-title">{esc(vote["title"])}</p><ul class="hm-legend">{legend}</ul>')


def hero_topic(vote: dict) -> str:
    """Jeden čip tématu (+N) na vlastním řádku nad nadpisem; bez tématu nic."""
    chips = topic_chips([t["slug"] for t in vote.get("topics") or []], 1, True, f"h{vote['id']}", "")
    return f'<div class="hm-topic">{chips}</div>' if chips else ""


def hub_page(data_dir: Path, base_url: str | None) -> tuple[str, str]:
    """Úvodní stránka: hero s hemicyklem posledních závěrečných hlasování (data/home.json, build_home.py), hledání,
    pruh faktů, tři cesty do dat, další pohledy a pás zásad. Všechna čísla z JSON; funguje i bez JavaScriptu."""
    from build_pages import vote_share_data
    from overrides import apply_name_overrides
    home = _read(data_dir / "home.json")
    if not home or not home.get("votes"):
        raise ValueError("chybí data/home.json (spusť build_web.py)")
    overview = _read(data_dir / "overview.json")
    groups = _read(data_dir / "groups.json")
    parties = _read(data_dir / "parties.json")
    meps_doc = _read(data_dir / "meps.json")
    apply_name_overrides(meps_doc["meps"], data_dir / "manual" / "overrides.json")
    meps_by_id = {m["id"]: m for m in meps_doc["meps"]}
    f = home["facts"]
    votes = home["votes"]
    first = votes[0]

    # Data pro přepínání hlasování a kartu ke sdílení (stejná karta jako na detailu hlasování).
    month_cache: dict[str, list[dict]] = {}
    share = {}
    for x in votes:
        if x["month"] not in month_cache:
            month_cache[x["month"]] = (_read(data_dir / "votes" / f"{x['month']}.json") or {"votes": []})["votes"]
        full = next((y for y in month_cache[x["month"]] if y["id"] == x["id"]), None)
        if full:
            share[str(x["id"])] = vote_share_data(full, meps_by_id, groups, parties, None)
    payload = {"votes": [{"id": x["id"], "date": x["date"], "title": x["title"], "kind_label": x["kind_label"], "result": x["result"],
                          "counts": x["counts"], "topic_html": hero_topic(x), "pos": {str(p["id"]): p["pos"] for p in x["ppl"]},
                          "party": {str(p["id"]): party_text(p) for p in x["ppl"]}} for x in votes],
               "names": {str(p["id"]): p["name"] for p in first["ppl"]}, "pos_txt": POS_TXT, "share": share}
    data_json = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")

    quick = "".join(f'<li><a href="{h}">{esc(t)}</a></li>' for h, t in QUICK)
    hero = f"""<section class="hm-hero" aria-labelledby="h1">
  <div class="hm-inner">
    <div class="hm-copy">
      <p class="hm-eyebrow"><i aria-hidden="true"></i>10. volební období · od 16. 7. 2024</p>
      <h1 id="h1">Co dělají v Bruselu <strong>čeští europoslanci<span class="hm-stop" aria-hidden="true"></span></strong></h1>
      <p class="hm-lead">Hlasování, účast a práce na textech z oficiálních dat. Bez pořadí a bez hodnocení.</p>
      <form class="hm-search" role="search" action="poslanci.html" method="get">
        <label for="hub-q">{_SEARCH_ICON}<span class="sr-only">Najdi poslance, stranu nebo hlasování</span>
          <input id="hub-q" name="q" type="search" autocomplete="off" placeholder="Najdi poslance, stranu nebo hlasování…" role="combobox" aria-expanded="false" aria-controls="hub-results" aria-autocomplete="list" aria-haspopup="listbox"><kbd aria-hidden="true">/</kbd><button class="hm-go" type="submit">Hledat</button></label>
        <ul id="hub-results" class="hm-results" role="listbox" aria-label="Výsledky hledání" hidden></ul>
      </form>
      <ul class="hm-quick" aria-label="Rychlý přístup">{quick}</ul>
    </div>
    <section class="hm-stage" aria-label="Jak čeští poslanci hlasovali v posledních závěrečných hlasováních">
      <div class="hm-top">
        <p class="hm-lbl"><i aria-hidden="true"></i>Poslední hlasování</p>
        <div class="hm-step" role="group" aria-label="Přepínání hlasování">
          <button id="hm-prev" type="button" aria-label="Novější hlasování" disabled><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{_CHEV["prev"]}</svg></button>
          <span id="hm-idx">1 / {len(votes)}</span>
          <button id="hm-next" type="button" aria-label="Starší hlasování"{" disabled" if len(votes) < 2 else ""}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{_CHEV["next"]}</svg></button>
        </div>
      </div>
      <div class="hm-hemi" id="hm-hemi">{hemi_html(first)}</div>
      <div class="hm-cap" id="hm-cap" aria-live="polite">{caption_html(first)}</div>
      <div class="hm-act"><a class="hm-detail" id="hm-more" href="v/{first["id"]}.html">Detail hlasování {_ARROW}</a>
        <button class="hm-icon" type="button" data-share="hero" aria-haspopup="dialog" aria-label="Sdílet toto hlasování">{_SHARE_ICON}</button></div>
      <p class="hm-src">Hlasy k datu hlasování, pět nejnovějších závěrečných hlasování bez výběru. Zdroj: <a href="https://howtheyvote.eu">HowTheyVote.eu</a> (ODbL).</p>
    </section>
  </div>
  <dl class="hm-facts">
    <div><dt>{fmt_num(f["meps_active"])}</dt><dd>poslanců v mandátu</dd></div>
    <div><dt>{fmt_num(f["parties"])}</dt><dd>{"českých stran" if f["parties"] >= 5 else "české strany"}{f" a {fmt_num(f['no_party'])} bez strany" if f["no_party"] else ""}</dd></div>
    <div><dt>{fmt_num(f["votes_total"])}</dt><dd>jmenovitých hlasování od {fmt_date(f["votes_from"])}</dd></div>
    <div><dt>{fmt_date(f["data_day"])}</dt><dd>stav dat (export HowTheyVote) · <a href="o-projektu.html#metodika">aktualizace každý týden</a></dd></div>
  </dl>
  <script type="application/json" id="home-data">{data_json}</script>
</section>"""

    # Bento: Poslanci (mozaika abecedně), Hlasování (číslo + měsíce), Práce (tři součty).
    active = sorted((m for m in overview["meps"] if _active(m)), key=lambda m: m.get("sort_label") or m["name"])
    def dname(m):
        return " ".join(x for x in (m.get("given_name"), m.get("family_name")) if x) or m["name"]
    def plabel(m):
        p = m.get("party") or {}
        return "nezávislý/á" if not p or p.get("short_label") in ("Ind.", None) else p["short_label"]
    mosaic = "".join(
        f'<a href="p/{m["id"]}.html" data-n="{esc(dname(m))} · {esc(plabel(m))}" aria-label="{esc(dname(m))}, {esc(plabel(m))}">'
        + (f'<img src="assets/photos/thumbs/{m["id"]}.webp" alt="" width="64" height="64" loading="lazy">' if m.get("photo_url")
           else f'<span>{esc("".join(x[0] for x in (m.get("given_name"), m.get("family_name")) if x))}</span>') + "</a>"
        for m in active)
    months = [x["month"] for x in f["monthly"]]
    by_month = {x["month"]: x["votes"] for x in f["monthly"]}
    keys, (y, mo) = [], (int(months[0][:4]), int(months[0][5:]))
    while f"{y}-{mo:02d}" <= months[-1]:
        keys.append(f"{y}-{mo:02d}")
        y, mo = (y + 1, 1) if mo == 12 else (y, mo + 1)
    vmax = max(by_month.values()) or 1
    spark = "".join(f'<i class="{"last" if i == len(keys) - 1 else ""}" style="height:{max(3, round(by_month.get(k, 0) / vmax * 100))}%" '
                    f'title="{int(k[5:])}/{k[:4]}: {fmt_num(by_month.get(k, 0))} hlasování"></i>' for i, k in enumerate(keys))
    w = f["work"]
    bento = f"""<section class="hm-wrap" aria-labelledby="h-doors">
  <div class="hm-head"><div><p class="hm-kicker">Začněte tady</p><h2 id="h-doors">Tři cesty <strong>do dat.</strong></h2></div>
    <p>Podle lidí, podle hlasování, nebo podle práce mimo plénum.</p></div>
  <div class="hm-bento">
    <div class="hm-tile hm-people"><h3><a href="poslanci.html">Poslanci</a></h3><p>Profil každého z {fmt_num(len(active))} českých europoslanců. Řazeno abecedně.</p>
      <div class="hm-mosaic" id="hm-mosaic">{mosaic}</div><div class="hm-mcap" id="hm-mcap" aria-hidden="true"></div>
      <a class="hm-open" href="poslanci.html">Otevřít {_ARROW}</a></div>
    <a class="hm-tile hm-votes" href="hlasovani.html"><h3>Hlasování</h3><p>Jak hlasoval Parlament a jak v tom Češi.</p>
      <div class="hm-row"><div class="hm-bignum">{fmt_num(f["votes_total"])}<small>jmenovitých hlasování od {fmt_date(f["votes_from"])}</small></div>
        <div class="hm-sparkbox"><div class="hm-spark" aria-hidden="true">{spark}</div><div class="hm-spark-cap" aria-hidden="true"><span>{int(keys[0][5:])}/{keys[0][:4]}</span><span>{int(keys[-1][5:])}/{keys[-1][:4]}</span></div></div></div></a>
    <a class="hm-tile hm-work" href="prace.html"><h3>Práce</h3><p>Zprávy, stanoviska, projevy a otázky Komisi.</p>
      <div class="hm-nums"><div><b>{fmt_num(w["speeches"])}</b><span>projevů v plénu</span></div><div><b>{fmt_num(w["questions"])}</b><span>otázek Komisi a Radě</span></div>
        <div><b>{fmt_num(w["reports_lead"])}</b><span>zpráv, které poslanci vedli jako zpravodajové</span></div></div>
      <p class="hm-note">Součet za všech {fmt_num(w["meps"])} poslanců 10. období včetně bývalých (proto víc než {fmt_num(len(active))} v mandátu) · EP Open Data, stav k {fmt_date(w["updated"][:10])}</p></a>
  </div>
</section>"""

    badge = {"unity": f'{fmt_num(f["united_final"])} z {fmt_num(f["considered_final"])} jednotně',
             "decisive": f'{fmt_num(f["decisive"])} hlasování'}
    rows = "".join(
        f'<li><a href="{h}"><span class="hm-t">{esc(t)}</span><span class="hm-d">{esc(d)}</span>'
        + (f'<span class="hm-st">{badge[b]}</span>' if b else "") + f'<span class="hm-ar">{_ARROW}</span></a></li>'
        for h, t, d, b in MORE)
    more = f"""<section class="hm-wrap hm-more" aria-labelledby="h-more">
  <div><p class="hm-kicker">Další pohledy</p><h2 id="h-more">Zajímavé <strong>souvislosti.</strong></h2></div>
  <ul class="hm-rows">{rows}</ul>
</section>"""

    band = f"""<section class="hm-band" aria-labelledby="h-rules">
  <div class="hm-band-in">
    <h2 id="h-rules">Každé číslo má <strong>odkaz na zdroj.</strong></h2>
    <div class="hm-pr">
      <div><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg><h3>Oficiální data</h3><p>HowTheyVote.eu a EP Open Data. Žádný scraping, žádné odhady.</p></div>
      <div><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9h14M5 15h14"/></svg><h3>Bez pořadí a známek</h3><p>Poslance neřadíme ani nehodnotíme. Čísla vždy s mediánem EP.</p></div>
      <div><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/></svg><h3>Počítá kód, ne AI</h3><p>Výpočty jsou otevřené skripty na GitHubu a mají testy.</p></div>
    </div>
    <a class="hm-pill" href="o-projektu.html#metodika">Metodika a zdroje {_ARROW}</a>
  </div>
</section>"""

    body = hero + bento + more + band
    title = "EP Watch CZ – jak hlasují čeští europoslanci"
    desc = "Hlasování, účast na hlasování a statistiky českých europoslanců v 10. volebním období. Jen ověřená data z oficiálních zdrojů."
    meta = og_meta(title, desc, "", base_url, None, "EP Watch CZ – fakta a data o českých europoslancích")
    from layout import INSTAGRAM, REPO
    org = {"@context": "https://schema.org", "@type": "Organization", "name": "EP Watch CZ",
           **({"url": base_url.rstrip("/") + "/", "logo": base_url.rstrip("/") + "/assets/brand/apple-touch-icon.png"} if base_url else {}),
           "sameAs": [INSTAGRAM, REPO]}
    meta += f'<script type="application/ld+json">{json.dumps(org, ensure_ascii=False)}</script>\n'
    html = page(title, body, root="", current=None, description=desc, meta=meta, main_attrs='class="home-page"',
                scripts='<script src="app.js"></script>\n<script src="share.js"></script>\n<script src="hub.js"></script>\n')
    return "index.html", html
