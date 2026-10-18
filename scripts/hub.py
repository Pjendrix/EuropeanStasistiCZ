"""Stránka Aktuálně (aktualne.html, dřívější úvod) a bloky vkládané do ručních stránek. Rozcestník na „/“ je portal.py.

- hub_page: hero s hemicyklem pěti nejnovějších závěrečných hlasování (data/home.json), hledání (hub.js), pruh faktů,
  blok Z posledního zasedání (B6), další pohledy a pás zásad. Čísla jen z JSON, žádné natvrdo.
- heads_html: portréty poslanců po frakcích, blok na poslanci.html (build_pages.sync_block).
- votes_overview_html: poslední zasedání a klíčová hlasování, přehled na hlasovani.html. Tabulka s filtry je na votes.html.

Všechna čísla jsou z data/*.json (compute_stats.py, build_web.py), nic se tu nepočítá nově kromě součtů a skládání vět.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from build_pages import RESULT_LABEL, esc, topic_chips, fmt_date, fmt_num, fmt_pct, group_label, page, og_meta, split_bar
from categories import LABEL, icon_svg
from hero_art import STARS
from procedure_pages import procedure_url
from compute_stats import apply_titles, procedure_titles
from layout import MODULES
from vote_kinds import KIND_LABELS, is_final

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
    return f"v/{v['id']}" if final else f"vote?id={v['id']}&m={v['month']}"


def _dots(cz: list[int]) -> str:
    cls = ("f", "a", "s", "n")
    return "".join(f'<i class="vd {c}"></i>' for c, n in zip(cls, cz, strict=False) for _ in range(n))


def _legend(cz: list[int]) -> str:
    return (
        f'<div class="vd-legend"><span><i class="vd sm f"></i><b class="pro">{cz[0]}</b> pro</span>'
        f'<span><i class="vd sm a"></i><b class="con">{cz[1]}</b> proti</span>'
        f'<span><i class="vd sm s"></i><b>{cz[2]}</b> zdrž.</span>'
        f'<span><i class="vd sm n"></i><b>{cz[3]}</b> nehl.</span></div>'
    )


def vote_card(v: dict, reason: str) -> str:
    """Karta hlasování: kategorie, název, výsledek (neutrální štítek), 21 teček se symboly, legenda, celý EP. Zelená a červená jen u hlasů."""
    cz, c = v["cz"], v["counts"]
    cats = v.get("cats") or []
    head = ""
    if cats:
        more = (
            f'<span class="cat-more" title="{esc(", ".join(LABEL[k] for k in cats[1:]))}">+{len(cats) - 1}</span>' if len(cats) > 1 else ""
        )
        head = f'<span class="cat-ico">{icon_svg(cats[0])}</span><span class="cat-name">{esc(LABEL[cats[0]])}</span>{more}'
    ok = v["result"] == "ADOPTED"
    res = (
        f'<span class="res-pill{"" if ok else " no"}">{esc(RESULT_LABEL.get(v["result"], "výsledek neuveden"))}</span>'
        if v["result"]
        else ""
    )
    ep_bar = split_bar([c["for"], c["against"], c["abstention"], 0])
    return (
        f'<div class="card hub-vote"><div class="hub-vote-head">{head}<span class="when">{fmt_date(v["date"])}</span></div>'
        f'<a class="vote-title" href="{vote_link(v)}">{esc(v["title"])}</a>'
        f'<div class="meta">{res}<span>{esc(KIND_LABELS.get(v["vote_kind"], ""))}</span></div>'
        f'<div class="vd-row" role="img" aria-label="Češi: {cz[0]} pro, {cz[1]} proti, {cz[2]} zdržel se, {cz[3]} nehlasoval">{_dots(cz)}</div>'
        f"{_legend(cz)}"
        f'<div class="small muted">{esc(reason)}</div>'
        f'<div class="ep-line"><span>Celý EP</span>{ep_bar}<span><b class="pro">{c["for"]}</b> : <b class="con">{c["against"]}</b></span></div></div>'
    )


def key_votes_html(kv: dict, limit: int | None = None) -> str:
    """Čtyři seznamy za celé období: zákony od nejnovějších, ostatní podle svého pravidla. Přepínač období tu není:
    výběr za kratší období se od celého skoro neliší a ukazoval by pořád stejná hlasování, poslední zasedání má blok výš."""
    out = ['<div class="hub-lists">']
    for name, (title, rule) in LIST_TITLES.items():
        lst = kv["lists"]["all"][name]
        items = (
            "".join(vote_card(kv["votes"][str(i["id"])], i["reason"]) for i in lst["items"][:limit]) or '<p class="muted small">Nic.</p>'
        )
        more = (
            f'<p class="small"><a href="votes?f=final">všechna závěrečná hlasování</a> ({fmt_num(lst["total"])} v 10. období)</p>'
            if lst["total"] > len(lst["items"][:limit])
            else ""
        )
        out.append(
            f'<section class="hub-list"><h3>{esc(title)}</h3><p class="small muted">{esc(rule)}</p><div class="hub-cards">{items}</div>{more}</section>'
        )
    out.append("</div>")
    out.append(f'<p class="small muted">{esc(kv["note"])} <a href="o-projektu#metodika">Jak počítáme</a>.</p>')
    return "".join(out)


# --- bloky vkládané do ručních stránek (build_pages.sync_block) -----------------------------


def heads_html(data_dir: Path) -> str:
    """Portréty českých poslanců po frakcích (blok „Kdo jsou čeští poslanci“ na poslanci.html)."""
    overview = _read(data_dir / "overview.json")
    groups = _read(data_dir / "groups.json")
    bench = _read(data_dir / "benchmarks.json")
    active = [m for m in overview["meps"] if _active(m)]
    dname = lambda m: " ".join(x for x in (m.get("given_name"), m.get("family_name")) if x) or m["name"]
    avatar = lambda m: (
        f'<a class="hub-av" href="p/{m["id"]}" title="{esc(dname(m))}"><img src="assets/photos/thumbs/{m["id"]}.webp" '
        f'alt="{esc(dname(m))}" width="56" height="56" loading="lazy"></a>'
        if m.get("photo_url")
        else ""
    )
    by_group: dict[str, list[dict]] = {}
    for m in active:
        by_group.setdefault((m.get("group") or {}).get("code") or "", []).append(m)
    order = sorted(by_group, key=lambda g: (-len(by_group[g]), group_label(g or None, groups)))
    strip = "".join(
        f'<div class="hub-group"><span class="small muted">{esc(group_label(g or None, groups))}</span><div class="hub-avs">'
        + "".join(avatar(m) for m in sorted(by_group[g], key=lambda m: m.get("sort_label") or m["name"]))
        + "</div></div>"
        for g in order
    )
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
    chips = "".join(
        f'<a class="vo-chip" href="{h}">{esc(t)}{arrow}</a>'
        for h, t in (
            ("temata", "Podle témat"),
            ("rozkol", "Kde se Češi rozdělili"),
            ("rozhodujici", "Kde rozhodly české hlasy"),
            ("shoda", "Shoda mezi Čechy"),
        )
    )
    return f"""<div class="vo-tools">
  <div class="vo-chips"><span class="vo-label">Další pohledy</span>{chips}<a class="vo-chip vo-chip-main" href="votes">Všechna hlasování{arrow}</a></div>
</div>
<section class="hub-block" aria-labelledby="h-sess">
  <h2 id="h-sess">Co se naposledy odhlasovalo</h2>
  <p class="small muted">Zasedání {fmt_date(session["from"])} – {fmt_date(session["to"])} · <a href="votes?od={session["from"]}&amp;m={session["to"][:7]}&amp;f=final">Celé zasedání</a></p>
  <div class="hub-lists three hub-cards">{sess_cards}</div>
</section>
<section class="hub-block" aria-labelledby="h-key">
  <h2 id="h-key">Klíčová hlasování</h2>
  {key_votes_html(kv, 3)}
</section>"""


# --- příští zasedání (program EP, fetch_agenda.py + agenda.py) ----------------------------------------

DOC_URL = "https://www.europarl.europa.eu/doceo/document/{}_CS.html"
FULL_VISIBLE = 6  # na stránce Hlasování prvních 6 bodů, zbytek pod „Zobrazit dalších“
_ROLE_CS = {"rapporteur": "zpravodaj/ka", "co": "spoluzpravodaj/ka", "shadow": "stínový/á zpravodaj/ka"}


def _range(a: str, b: str) -> str:
    """„19.–22. 10. 2026“, přes měsíc „30. 9. – 2. 10. 2026“."""
    if a == b:
        return fmt_date(a)
    if a[:7] == b[:7]:
        return f"{int(a[8:])}.–{fmt_date(b)}"
    return f"{fmt_date(a)[:-5]} – {fmt_date(b)}"


def agenda_item_html(it: dict, root: str = "") -> str:
    """Jeden hlasovací bod: český název (jinak anglický originál), den, dokumenty s odkazem na EP a česká stopa."""
    title = it.get("title_cs") or it.get("title_en") or it["id"]
    docs = " · ".join(f'<a href="{DOC_URL.format(d)}">{esc(d)}</a>' if d[0] in "AB" else esc(d) for d in it["docs"])
    cz = ", ".join(
        f'<a href="{root}p/{c["mep_id"]}"><span translate="no" class="notranslate">{esc(c["name"] or str(c["mep_id"]))}</span></a> ({_ROLE_CS[c["role"]]})'
        for c in it.get("cz") or []
    )
    return (
        f'<li class="ns-item"><span class="ns-day">{fmt_date(it["date"])[:-5]}</span><span class="ns-title">{esc(title)}</span>'
        + (f'<span class="ns-cz"><span class="cz-badge">česká stopa</span> {cz}</span>' if cz else "")
        + (f'<span class="ns-docs small muted">{docs}</span>' if docs else "")
        + "</li>"
    )


def next_session_html(agenda: dict | None, full: bool = False, root: str = "") -> str:
    """Blok „Další zasedání“: datum, odpočet (počítá prohlížeč z data-from/data-to, bez JS jen datum), počet hlasování
    a body programu (na úvodu výběr podle pravidla, na stránce Hlasování všechny). Bez programu prázdný řetězec."""
    if not agenda:
        return ""
    picks = [i for i in agenda["items"] if i["id"] in agenda["picks"]]
    items = agenda["items"] if full else sorted(picks, key=lambda i: agenda["picks"].index(i["id"]))
    n = agenda["votes"]
    count = f"{fmt_num(n)} hlasování v programu" if n else "program zatím nezveřejněn"
    # pravidlo výběru a definice české stopy jsou celé v metodice (o-projektu.html#program-ep), tady jen odkaz
    rule = "Výběr pravidlem, ne redakcí. " if not full else ""
    head, tail = (items[:FULL_VISIBLE], items[FULL_VISIBLE:]) if full else (items, [])
    lst = f'<ol class="ns-list">{"".join(agenda_item_html(i, root) for i in head)}</ol>' if head else ""
    if tail:
        lst += (
            f'<details class="ns-rest"><summary>Zobrazit dalších {fmt_num(len(tail))}</summary>'
            f'<ol class="ns-list" start="{len(head) + 1}">{"".join(agenda_item_html(i, root) for i in tail)}</ol></details>'
        )
    as_of = f" k {fmt_date(agenda['fetched'])}" if agenda.get("fetched") else ""
    more = f'<a class="ns-all" href="{root}radar#zasedani">Celý program ({fmt_num(n)}) a co se chystá {_ARROW}</a>' if not full else ""
    return (
        f'<section class="card next-session" id="{"program" if full else "dalsi-zasedani"}" aria-labelledby="ns-h{"-full" if full else ""}">'
        f'<div class="ns-head"><h2 id="ns-h{"-full" if full else ""}">Další zasedání</h2>'
        f'<p class="ns-when" data-from="{agenda["from"]}" data-to="{agenda["to"]}"><strong>{_range(agenda["from"], agenda["to"])}</strong>'
        f'<span class="ns-count" aria-live="polite"></span> · {count}</p></div>'
        f"{lst}{more}"
        f'<p class="source">Návrh programu EP{as_of}, může se změnit. {rule}Zdroj: <a href="https://data.europarl.europa.eu">EP Open Data</a> '
        f'(CC BY 4.0) · <a href="{root}o-projektu#program-ep">výběr a česká stopa</a></p>'
        "</section>"
    )


# --- radar „Co se chystá“ (radar.py → data/radar.json) ---------------------------------------------------

_CZ_ROLE_SHORT = {
    "rapporteur": "zpravodaj/ka",
    "co": "spoluzpravodaj/ka",
    "shadow": "stínový/á zpravodaj/ka",
    "opinion": "zpravodaj/ka stanoviska",
    "shadow_opinion": "stínový/á zpravodaj/ka stanoviska",
}


def _cz_html(cz: list[dict], root: str) -> str:
    if not cz:
        return ""
    people = ", ".join(
        f'<a href="{root}p/{c["mep_id"]}"><span translate="no" class="notranslate">{esc(c["name"] or str(c["mep_id"]))}</span></a> ({_CZ_ROLE_SHORT[c["role"]]})'
        for c in cz
    )
    return f'<span class="ns-cz"><span class="cz-badge">česká stopa</span> {people}</span>'


def _committee_html(c: dict | None, root: str) -> tuple[str, str]:
    """(text výboru, čip kategorie). Bez výboru prázdné."""
    if not c:
        return "", ""
    text = f"výbor {esc(c['code'])}" + (f" ({esc(c['name'])})" if c.get("name") else "")
    chip = topic_chips([c["category"]], 1, True, "x", root) if c.get("category") else ""
    return text, chip


def _filter_attrs(cat: str | None, legislative: bool, cz: bool) -> str:
    return f' data-cat="{cat or ""}" data-leg="{1 if legislative else 0}" data-cz="{1 if cz else 0}"'


def radar_session_item(it: dict, root: str) -> str:
    title = it.get("title_cs") or it.get("title_en") or it["id"]
    proc = it.get("procedure") or {}
    comm, chip = _committee_html(it.get("committee"), root)
    legislative = bool(it.get("legislative") or proc.get("type") in ("COD", "CNS", "APP"))
    meta = [
        x
        for x in (
            "zákon" if legislative else None,
            it.get("stage_cs"),
            (f'<a href="{esc(proc["url"])}">{esc(proc["label"])}</a>' if proc.get("url") else None),
            comm or None,
        )
        if x
    ]
    docs = " · ".join(f'<a href="{DOC_URL.format(d)}">{esc(d)}</a>' if d[0] in "AB" else esc(d) for d in it["docs"])
    cat = (it.get("committee") or {}).get("category")
    return (
        f'<li class="ns-item rd-item"{_filter_attrs(cat, legislative, bool(it.get("cz")))}>'
        f'<span class="ns-day">{fmt_date(it["date"])[:-5]}</span><span class="ns-title">{esc(title)}</span>'
        + (f'<span class="rd-meta small">{chip}{" · ".join(meta)}</span>' if meta or chip else "")
        + _cz_html(it.get("cz") or [], root)
        + (f'<span class="ns-docs small muted">{docs}</span>' if docs else "")
        + "</li>"
    )


def radar_steps(steps: list[dict], reached: str | None) -> str:
    """Časová osa kroků procedury: hotové kroky s datem, aktuální zvýrazněný, budoucí šedě."""
    keys = [s["key"] for s in steps]
    cur = keys.index(reached) if reached in keys else -1
    finished = cur == len(keys) - 1  # podpis a vyhlášení: všechny kroky hotové
    lis = []
    for i, s in enumerate(steps):
        state = "done" if i < cur or finished else "current" if i == cur else "todo"
        when = f'<span class="rd-when">{fmt_date(s["date"])}</span>' if s.get("date") else ""
        attr = ' aria-current="step"' if state == "current" else ""
        lis.append(
            f'<li class="rd-step {state}"{attr}>'
            f'<span class="rd-dot" aria-hidden="true"></span><span class="rd-lbl">{esc(s["label"])}</span>{when}</li>'
        )
    return f'<ol class="rd-steps" aria-label="Průběh procedury">{"".join(lis)}</ol>'


def radar_proc_card(r: dict, root: str, done: bool = False) -> str:
    title = r.get("title_cs") or r.get("title_en") or r["label"] or r["procedure"]
    comm, chip = _committee_html(r.get("committee"), root)
    # číslo procedury vede na stránku Příběh zákona (z/, procedure_pages.py), ta odkazuje dál na Legislativní observatoř
    story = procedure_url(r.get("label"), root)
    label = (
        f'<a href="{story}">{esc(r["label"])}</a>'
        if story
        else f'<a href="{esc(r["url"])}">{esc(r["label"])}</a>'
        if r.get("url") and r.get("label")
        else esc(r.get("label") or "")
    )
    head = " · ".join(x for x in (label, comm) if x)
    if done:
        v = r.get("vote") or {}
        tail = (
            f'<p class="rd-next">Plénum hlasovalo {fmt_date(r["plenary_date"])} · '
            + (
                f'<a href="{root}v/{v["vote_id"]}">jak hlasovali Češi {_ARROW}</a>'
                if v.get("vote_id")
                else '<span class="muted">jmenovité hlasování k ní v datech HowTheyVote není</span>'
            )
            + "</p>"
        )
    else:
        last = r.get("last_event")
        nxt = (
            f"<strong>Na programu pléna {fmt_date(r['next_vote'])}</strong>"
            if r.get("next_vote")
            else "Datum hlasování v plénu zatím nezveřejněno"
        )
        tail = (
            f'<p class="small muted">Poslední krok: {esc(last["label"])} ({fmt_date(last["date"])})</p>' if last else ""
        ) + f'<p class="rd-next">{nxt}</p>'
    cat = (r.get("committee") or {}).get("category")
    return (
        f'<li class="card rd-proc"{_filter_attrs(cat, True, True)}>'
        f'<h3 class="rd-title">{esc(title)}</h3><p class="rd-meta small">{chip}{head}</p>'
        f"{_cz_html(r['cz'], root)}{radar_steps(r['steps'], r['reached'])}{tail}</li>"
    )


def radar_html(radar: dict | None, root: str = "") -> str:
    """Obsah stránky „Co se chystá“ (radar.html): nejbližší zasedání, rozpracované a odhlasované zákony s českou stopou."""
    if not radar:
        return '<p class="muted">Data radaru zatím nejsou k dispozici.</p>'
    s = radar.get("session")
    filters = (
        '<div class="controls rd-filters" role="group" aria-label="Filtry">'
        '<label>Téma <select id="rd-cat"><option value="">všechna</option>'
        + "".join(f'<option value="{k}">{esc(LABEL[k])}</option>' for k in radar.get("categories", []) if k in LABEL)
        + '</select></label><label><input type="checkbox" id="rd-leg"> jen zákony</label>'
        '<label><input type="checkbox" id="rd-cz"> jen s českou stopou</label></div>'
    )
    if s:
        items = "".join(radar_session_item(i, root) for i in s["items"])
        as_of = f" k {fmt_date(s['fetched'])}" if s.get("fetched") else ""
        sess = (
            f'<section class="card next-session" id="zasedani" aria-labelledby="rd-h1">'
            f'<div class="ns-head"><h2 id="rd-h1">Nejbližší zasedání</h2>'
            f'<p class="ns-when" data-from="{s["from"]}" data-to="{s["to"]}"><strong>{_range(s["from"], s["to"])}</strong>'
            f'<span class="ns-count" aria-live="polite"></span> · {fmt_num(len(s["items"]))} hlasování v programu</p></div>'
            f'<ol class="ns-list rd-list">{items}</ol><p class="rd-empty muted" hidden>Filtru nic neodpovídá.</p>'
            f'<p class="source">Návrh programu EP{as_of}, může se změnit. Zdroj: <a href="https://data.europarl.europa.eu">EP Open Data</a> (CC BY 4.0).</p>'
            "</section>"
        )
    else:
        sess = (
            '<section class="card" id="zasedani"><h2>Nejbližší zasedání</h2><p class="muted">Program zatím není zveřejněný.</p></section>'
        )
    active = "".join(radar_proc_card(r, root) for r in radar.get("active", []))
    done = "".join(radar_proc_card(r, root, True) for r in radar.get("done", []))
    pending = (
        f'<p class="small muted">U {fmt_num(radar["without_events"])} procedur se průběh ještě stahuje, doplní se při další aktualizaci.</p>'
        if radar.get("without_events")
        else ""
    )
    return (
        f"{filters}{sess}"
        f'<section class="rd-block" id="rozpracovane" aria-labelledby="rd-h2"><h2 id="rd-h2">Rozpracované zákony s českou stopou</h2>'
        f'<p class="muted">Legislativní procedury, ve kterých je český poslanec zpravodajem nebo stínovým zpravodajem a o kterých plénum ještě '
        f"nehlasovalo. Nahoře ty, které jsou nejblíž hlasování.</p>{pending}"
        + (f'<ol class="rd-procs">{active}</ol>' if active else '<p class="muted">Žádné takové procedury.</p>')
        + '<p class="rd-empty muted" hidden>Filtru nic neodpovídá.</p></section>'
        '<section class="rd-block" id="odhlasovano" aria-labelledby="rd-h3"><h2 id="rd-h3">Odhlasováno za poslední rok</h2>'
        + (f'<ol class="rd-procs">{done}</ol>' if done else '<p class="muted">Za poslední rok nic.</p>')
        + '<p class="rd-empty muted" hidden>Filtru nic neodpovídá.</p></section>'
        '<p class="source">Zdroj: <a href="https://data.europarl.europa.eu">EP Open Data</a> (CC BY 4.0) a '
        f'<a href="https://howtheyvote.eu">HowTheyVote.eu</a> (ODbL) · <a href="{root}o-projektu#radar">jak radar funguje</a></p>'
    )


def votes_hero_html(data_dir: Path) -> str:
    """Hero stránky Hlasování: stejná kostra jako na Poslancích (nadpis, hledání, dvě čísla, témata, vlajka v hvězdách)."""
    overview = _read(data_dir / "overview.json")
    session = _read(data_dir / "session.json")
    stats = _read(data_dir / "category_stats.json")
    cats = [c for c in stats["categories"] if c["key"] != "none" and c["key"] in LABEL]
    cats = sorted(cats, key=lambda c: (-c["final"], LABEL[c["key"]]))
    tiles = "".join(
        f'<a class="tp-tile" href="votes?c={esc(c["key"])}&amp;f=final"><span class="tp-ico">{icon_svg(c["key"])}</span>'
        f'<span class="tp-text"><span class="tp-name">{esc(LABEL[c["key"]])}</span><span class="tp-n">{fmt_num(c["final"])}<span class="tp-unit"> závěrečných</span></span></span></a>'
        for c in cats
    )
    picker = (
        f'<nav class="topic-picker" aria-labelledby="tp-h"><div class="tp-head"><h2 id="tp-h">Vyber téma</h2>'
        f'<a class="tp-all" href="temata">tabulka témat →</a></div><div class="tp-grid">{tiles}</div></nav>'
    )
    return f"""<section class="hero">
  {STARS}
  <div class="hero-inner hero-compact">
    <div class="hero-copy">
      <p class="eyebrow">10. volební období · data k {fmt_date(overview["period"]["to"])}</p>
      <h1>Jmenovitá hlasování</h1>
      <p class="lead">Všechna jmenovitá hlasování v plénu od 16. 7. 2024 a jak v nich hlasovali čeští poslanci.</p>
      <form class="vo-search" action="votes" method="get" role="search">
        <label for="vo-q" class="sr-only">Hledat hlasování</label>
        <input id="vo-q" name="q" type="search" placeholder="Hledat hlasování…" aria-label="Hledat hlasování podle názvu nebo čísla" autocomplete="off">
        <button type="submit">Hledat</button>
      </form>
      <div class="kpis">
        <div class="kpi-grid kpi-2">
          <div class="kpi"><div class="k-label">Jmenovitých hlasování</div><div class="k-value">{fmt_num(overview["votes_total"])}</div>
            <div class="k-note">od {fmt_date(overview["period"]["from"])} · <a href="votes">seznam hlasování</a></div></div>
          <div class="kpi"><div class="k-label">Na posledním zasedání</div><div class="k-value">{fmt_num(session["votes"])}</div>
            <div class="k-note">{fmt_num(session["main"])} závěrečných, {fmt_num(session["adopted_main"])} přijato · <a href="votes?od={session["from"]}&amp;m={session["to"][:7]}&amp;f=final">celé zasedání</a></div></div>
        </div>
      </div>
    </div>
    {picker}
  </div>
</section>"""


# --- úvodní stránka (revize úvodu U1–U6) ---------------------------------------------------------

_ARROW = (
    '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
)
_SEARCH_ICON = (
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    'aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
)
_SHARE_ICON = (
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    'stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>'
)
_INFO_ICON = (
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    'aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>'
)
_CHEV = {"prev": '<path d="M15 6l-6 6 6 6"/>', "next": '<path d="M9 6l6 6-6 6"/>'}

# Hemicykl: stejná geometrie jako renderDelegation v public/home.js (dvě řady, poloměry 96 a 150), viewBox 400 × 232.
# Oblouk na úvodu (návrh A): tečky i číslo „pro : proti“ v jednom SVG, takže mají vždy stejné měřítko a nepřekrývají se.
# Vnitřní řada jde jen po oblouku 154° → 26°, střed pod ní zůstává volný pro číslo; vnější řada 180° → 0°.
HEMI_VB = (400, 250)
HEMI_CX, HEMI_CY = 200, 221
HEMI_RINGS = ((114, 154, 26), (178, 180, 0))  # (poloměr, úhel první a poslední tečky ve stupních)
HEMI_SEAT = 15  # poloměr tečky
HEMI_STARS = (203, (30, 60, 90, 120, 150))  # poloměr a úhly hvězd
# Obdélník čísla (x0, y0, x1, y1): tečky do něj nesmí zasahovat (test_hub_hemi.py).
HEMI_NUM_BOX = (130, 160, 270, 250)
SYM = {"F": "M-5.5 1 L-1.8 4.8 L5.8 -4.2", "A": "M-4.6 -4.6 L4.6 4.6 M4.6 -4.6 L-4.6 4.6", "B": "M-5.2 0 L5.2 0"}
POS_TXT = {"F": "pro", "A": "proti", "B": "zdržel/a se", "N": "nehlasoval/a", "X": "v den hlasování nebyl/a v mandátu"}
LEGEND = [("F", "pro"), ("A", "proti"), ("B", "zdrželo se"), ("N", "nehlasovalo")]

QUICK = [("poslanci", "Poslanci"), ("party", "Strany"), ("hlasovani", "Hlasování"), ("prace", "Práce poslanců")]
MORE = [
    ("party", "Strany", "Jak hlasují české strany.", None),
    ("temata", "Podle témat", "Kde se hlasuje nejvíc a jak v tom Češi.", None),
    ("rozkol", "Kde se Češi rozdělili", "Závěrečná hlasování, v nichž se čeští poslanci neshodli.", "unity"),
    ("rozhodujici", "Kde rozhodly české hlasy", "Těsná hlasování, která by bez nich dopadla opačně.", "decisive"),
    ("shoda", "Shoda mezi Čechy", "Jak často hlasovali dva poslanci stejně.", None),
]


def hemi_slots(n: int, rings=HEMI_RINGS, cx: float = HEMI_CX, cy: float = HEMI_CY) -> list[tuple[float, float]]:
    """Místa pro n teček: počet v řadě úměrný poloměru (pro 21 a dvě řady 8 + 13), seřazená zleva doprava podle úhlu;
    při shodném úhlu vlevo nejdřív vnější, vpravo nejdřív vnitřní řada (stejné pravidlo jako home.js).
    rings = ((poloměr, úhel první tečky, úhel poslední tečky), …) od vnitřní řady; výchozí je oblouk karty na Aktuálně."""
    total = sum(r for r, *_ in rings)
    counts = [max(1, round(n * r / total)) for r, *_ in rings[:-1]]
    counts.append(n - sum(counts))
    out = []
    for k, (r, a0, a1) in zip(counts, rings, strict=True):
        for i in range(k):
            a = math.radians(a0 + (a1 - a0) * (0.5 if k == 1 else i / (k - 1)))
            out.append((a, r, cx + r * math.cos(a), cy - r * math.sin(a)))
    out.sort(key=lambda s: (-s[0], -s[1] if s[0] > math.pi / 2 else s[1]))
    return [(x, y) for _, _, x, y in out]


def hemi_number(c: dict) -> tuple[str, int]:
    """Obsah <text> čísla „pro : proti“ (zlatá dvojtečka) a velikost písma: pětimístné „10:11“ o něco menší,
    aby zůstalo v obdélníku HEMI_NUM_BOX."""
    fs = 68 if len(f"{c['F']}{c['A']}") <= 3 else 58
    return f'{c["F"]}<tspan class="hm-num-c" dx="2" dy="-4">:</tspan><tspan dx="2" dy="4">{c["A"]}</tspan>', fs


COUNT_TXT = [("F", "pro"), ("A", "proti"), ("B", "zdrželo se"), ("N", "nehlasovalo"), ("X", "mimo mandát")]


def hemi_label(c: dict) -> str:
    """Popis oblouku pro čtečky: počty (jen nenulové) a jak se mezi tečkami pohybovat."""
    counts = ", ".join(f"{c[k]} {t}" for k, t in COUNT_TXT if c.get(k))
    return f"Čeští poslanci: {counts}. Tečka = poslanec, barva a symbol podle hlasu; mezi poslanci se přechází šipkami."


def _dot_svg(pos: str) -> str:
    """Malá tečka do legendy (stejný symbol jako v hemicyklu)."""
    if pos == "N":
        return '<svg viewBox="-13 -13 26 26" aria-hidden="true"><circle r="10.5" class="hm-n"/></svg>'
    return f'<svg viewBox="-13 -13 26 26" aria-hidden="true"><circle r="13" class="hm-{pos}"/><path class="hm-sym" d="{SYM[pos]}"/></svg>'


def party_text(p: dict) -> str:
    return "nezávislý/á" if p.get("ind") or not p.get("party") or p.get("party") in ("Independent", "Ind.") else p["party"]


def seats_svg(ppl: list[dict], slots: list[tuple[float, float]], seat: float, colors: dict | None = None, titles: bool = False) -> str:
    """Tečky poslanců (odkaz na profil, hlas v data-pos, symbol uvnitř) pro oblouk na Aktuálně i na rozcestníku.
    colors = {kód frakce: barva} → proměnná --g pro fázi „barvy frakcí“ (portal.js); titles = <title> pro najetí myší."""
    k = seat / 13

    def one(i: int, p: dict, x: float, y: float) -> str:
        label = f"{p['name']}, {party_text(p)}: {POS_TXT.get(p['pos'], '')}"
        g = f";--g:{colors[p['group']]}" if colors and colors.get(p.get("group")) else ""
        return (
            # translate="no": jméno a strana v <title> se strojově nepřekládají
            f'<g transform="translate({x:.1f} {y:.1f})"><a class="hm-seat" translate="no" href="p/{p["id"]}" data-i="{i}" data-id="{p["id"]}" '
            f'data-party="{esc(party_text(p))}" data-pos="{p["pos"]}" style="--i:{i}{g}" tabindex="{0 if i == 0 else -1}" '
            f'aria-label="{esc(label)}">{f"<title>{esc(label)}</title>" if titles else ""}'
            f'<circle class="hm-ring" r="{seat + 4.5:g}"/><g transform="scale({k:.3f})"><circle class="hm-f" r="13"/>'
            + "".join(f'<path class="hm-sym hm-s{s}" d="{d}"/>' for s, d in SYM.items())
            + "</g></a></g>"
        )

    return "".join(one(i, p, x, y) for i, (p, (x, y)) in enumerate(zip(ppl, slots, strict=False)))


def hemi_html(vote: dict) -> str:
    """Oblouk 21 teček pro jedno hlasování a číslo „pro : proti“ v jednom SVG (pořadí teček pevné, hlas v data-pos);
    tečka je odkaz na profil. Velikost tečky: kruh r=13 zvětšený na HEMI_SEAT."""
    ppl = vote["ppl"]
    slots = hemi_slots(len(ppl))
    sr, angles = HEMI_STARS
    stars = "".join(
        f'<path class="hm-star" transform="translate({HEMI_CX + sr * math.cos(math.radians(a)):.1f} '
        f'{HEMI_CY - sr * math.sin(math.radians(a)):.1f}) scale(.62)" d="M0-9.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L0 4.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z"/>'
        for a in angles
    )
    seats = seats_svg(ppl, slots, HEMI_SEAT)
    num, fs = hemi_number(vote["counts"])
    w, h = HEMI_VB
    return (
        f'<svg viewBox="0 0 {w} {h}" id="hm-svg" role="group" aria-label="{esc(hemi_label(vote["counts"]))}">'
        f'<g aria-hidden="true">{stars}</g>{seats}'
        f'<g aria-hidden="true" text-anchor="middle"><text class="hm-num" id="hm-big" x="{HEMI_CX}" y="{HEMI_CY}" font-size="{fs}" font-weight="300">{num}</text>'
        f'<text class="hm-num-u" x="{HEMI_CX}" y="{HEMI_CY + 22}" font-size="12.5" font-weight="700">PRO : PROTI</text></g></svg>'
        '<div class="hm-tip" id="hm-tip" aria-hidden="true"></div>'
    )


TRACE_ROLE = {
    "rapporteur": ("Zpravodaj", "Zpravodajka"),
    "co": ("Spoluzpravodaj", "Spoluzpravodajka"),
    "shadow": ("Stínový zpravodaj", "Stínová zpravodajka"),
}
TRACE_MAX = 2


def trace_html(vote: dict, meps_by_id: dict, groups: list[dict]) -> str:
    """Česká stopa na kartě (B4): kdo z Čechů byl zpravodajem nebo stínovým zpravodajem zprávy (vote_roles.json).
    Nejvýš TRACE_MAX lidí s portrétem, jménem, rolí a frakcí k datu hlasování, zbytek „a další N“. Bez stopy nic."""
    trace = sorted(
        vote.get("trace") or [], key=lambda t: (list(TRACE_ROLE).index(t["role"]) if t["role"] in TRACE_ROLE else 9, t.get("name") or "")
    )
    people = [t for t in trace if t["mep_id"] in meps_by_id]
    if not people:
        return ""
    items = []
    for t in people[:TRACE_MAX]:
        m = meps_by_id[t["mep_id"]]
        g = next((x for x in m.get("groups") or [] if x["start"] <= vote["date"] and (not x.get("end") or vote["date"] <= x["end"])), None)
        role = TRACE_ROLE.get(t["role"], ("Zpravodaj", "Zpravodajka"))[1 if m.get("gender") == "FEMALE" else 0]
        img = (
            f'<img src="assets/photos/thumbs/{m["id"]}.webp" alt="" width="28" height="28" loading="lazy">'
            if m.get("photo_url")
            else '<span class="hm-tr-i" aria-hidden="true"></span>'
        )
        grp = f" ({esc(group_label(g['code'], groups))})" if g else ""
        items.append(
            f'<a href="p/{m["id"]}">{img}<span><b>{role}:</b> <span translate="no" class="notranslate">{esc(t.get("name") or m["name"])}{grp}</span></span></a>'
        )
    more = len(people) - TRACE_MAX
    if more > 0:
        items.append(f'<a class="hm-tr-more" href="v/{vote["id"]}#ceska-stopa">a další {more}</a>')
    return f'<div class="hm-trace" aria-label="Česká stopa">{"".join(items)}</div>'


def caption_html(vote: dict, meps_by_id: dict | None = None, groups: list[dict] | None = None) -> str:
    """Hlavička karty nad hemicyklem: datum, typ, výsledek, téma, nadpis a krátké AI shrnutí (když je, vote_summaries.py)."""
    ok = vote["result"] == "ADOPTED"
    res = f'<span class="hm-res{"" if ok else " no"}">{"✓ Přijato" if ok else "✕ Zamítnuto" if vote["result"] == "REJECTED" else esc(RESULT_LABEL.get(vote["result"], "výsledek neuveden"))}</span>'
    from_text = vote.get("summary_source") == "adopted_text" and vote.get("summary_url")
    why = "z úryvku přijatého textu (EP Open Data)" if from_text else "jen z úředního názvu a témat"
    # Shrnutí má nejvýš 2 řádky, „víc“ ho rozbalí (hub.js; když se vejde, tlačítko jen zneviditelní, řádek zůstane).
    # Odkaz na přijatý text je mimo ořez, na řádku s tlačítkem, takže zdroj je vidět i ve sbaleném stavu.
    summary = (
        f'<p class="hm-sum" id="hm-sum"><span class="hm-ai" title="Shrnutí napsala AI (Claude Haiku) {why}, bez čísel a výsledku">AI</span>'
        f"{esc(vote['summary'])}</p>"
        '<p class="hm-sum-act"><button type="button" class="hm-sum-more" aria-expanded="false" aria-controls="hm-sum">víc</button>'
        + (
            f'<span aria-hidden="true">·</span><a class="hm-sum-src" href="{esc(vote["summary_url"])}">přijatý text</a>'
            if from_text
            else ""
        )
        + "</p>"
        if vote.get("summary")
        else ""
    )
    return (
        f'<div class="hm-cap-meta"><span>{fmt_date(vote["date"])}</span><span class="hm-tag">{esc(vote["kind_label"])}</span>{res}{hero_topic(vote)}</div>'
        f'<p class="hm-cap-title">{esc(vote["title"])}</p>{summary}{trace_html(vote, meps_by_id or {}, groups or [])}'
    )


def session_facts(data_dir: Path) -> dict | None:
    """Čísla řádku „Poslední zasedání“ pod úvodní větou (B3): jen ze session.json (build_web.py) a vote_roles.json.
    Jednotnost stejná jako jinde na webu (compute_stats, unity.last_session); česká stopa = závěrečné hlasování zasedání,
    u jehož zprávy byl český poslanec zpravodajem nebo stínovým zpravodajem. Co v datech chybí, se vynechá."""
    session = _read(data_dir / "session.json")
    if not session or not session.get("from"):
        return None
    out = {"from": session["from"], "to": session["to"], "final": session.get("main")}
    unity = session.get("unity") or {}
    if unity.get("considered"):
        out["united"], out["considered"] = unity["united"], unity["considered"]
    roles = (_read(data_dir / "vote_roles.json") or {}).get("votes")
    if roles is not None:
        months = {session["from"][:7], session["to"][:7]}
        votes = [v for m in sorted(months) for v in (_read(data_dir / "votes" / f"{m}.json") or {"votes": []})["votes"]]
        out["trace"] = sum(1 for v in votes if session["from"] <= v["date"] <= session["to"] and is_final(v) and str(v["id"]) in roles)
    return out


SESSION_PEOPLE_MAX = 4


def _at(periods: list[dict] | None, day: str) -> dict | None:
    return next((x for x in periods or [] if x["start"] <= day and (not x.get("end") or day <= x["end"])), None)


def session_people(data_dir: Path, meps_by_id: dict) -> dict | None:
    """Blok „Z posledního zasedání“ (B6). Výběr pravidlem, ne redakcí ani podle aktivity: poslanci, kteří byli zpravodajem
    nebo stínovým zpravodajem zprávy, o které se na posledním zasedání hlasovalo (vote_roles.json), abecedně.
    U každého jen doložitelná činnost s datem v rozsahu zasedání: role u zprávy, projevy v plénu (speeches.json)
    a otázky (own_work.json). Bez session.json nic; bez vote_roles.json prázdný výběr."""
    session = _read(data_dir / "session.json")
    if not session or not session.get("from"):
        return None
    a, b = session["from"], session["to"]
    roles = (_read(data_dir / "vote_roles.json") or {}).get("votes") or {}
    votes = [v for m in sorted({a[:7], b[:7]}) for v in (_read(data_dir / "votes" / f"{m}.json") or {"votes": []})["votes"]]
    apply_titles(votes, procedure_titles(data_dir))
    speeches = (_read(data_dir / "speeches.json") or {}).get("meps") or {}
    own = (_read(data_dir / "own_work.json") or {}).get("meps") or {}
    people: dict[int, dict] = {}
    for v in sorted((v for v in votes if a <= v["date"] <= b), key=lambda v: (v["date"], v["id"])):
        for r in roles.get(str(v["id"]), []):
            if r["mep_id"] not in meps_by_id:
                continue
            p = people.setdefault(r["mep_id"], {"id": r["mep_id"], "reports": {}})
            key = r.get("report") or str(v["id"])
            if key not in p["reports"]:
                p["reports"][key] = {"role": r["role"], "title": v.get("title_cs") or v["title"], "vote_id": v["id"], "final": is_final(v)}
    out = []
    for pid, p in people.items():
        m = meps_by_id[pid]
        sp = [x for x in speeches.get(str(pid), []) if a <= x.get("date", "") <= b and x.get("type") == "speech"]
        qs = [x for x in (own.get(str(pid)) or {}).get("items", []) if x.get("type") == "question" and a <= (x.get("date") or "") <= b]
        out.append(
            {
                **p,
                "reports": list(p["reports"].values()),
                "speeches": len(sp),
                "questions": len(qs),
                "sort": m.get("sort_label") or m["name"],
            }
        )
    out.sort(key=lambda p: p["sort"])
    return {"from": a, "to": b, "people": out}


def session_people_html(sp: dict | None, meps_by_id: dict, groups: list[dict], mosaic_tile: str) -> str:
    """Kartičky poslanců z posledního zasedání (nejvýš SESSION_PEOPLE_MAX) a dlaždice se všemi poslanci."""
    if not sp:
        return ""
    people = sp["people"]
    cards = []
    for p in people[:SESSION_PEOPLE_MAX]:
        m = meps_by_id[p["id"]]
        g, pa = _at(m.get("groups"), sp["to"]), _at(m.get("parties"), sp["to"])
        party = (pa or {}).get("short_label")
        sub = " · ".join(
            x for x in ("nezávislý/á" if party in ("Ind.", None) and pa else party, group_label(g["code"], groups) if g else "") if x
        )
        female = m.get("gender") == "FEMALE"
        lines = []
        for r in p["reports"]:
            role = TRACE_ROLE.get(r["role"], ("Zpravodaj", "Zpravodajka"))[1 if female else 0]
            href = f"v/{r['vote_id']}" if r["final"] else f"vote?id={r['vote_id']}"
            lines.append(f'<li><b>{role}</b> <a href="{href}">{esc(r["title"])}</a></li>')
        if p["speeches"]:
            n = p["speeches"]
            lines.append(f"<li>{fmt_num(n)} {'projev' if n == 1 else 'projevy' if n < 5 else 'projevů'} v plénu</li>")
        if p["questions"]:
            n = p["questions"]
            lines.append(f"<li>{fmt_num(n)} {'otázka' if n == 1 else 'otázky' if n < 5 else 'otázek'} Komisi nebo Radě</li>")
        img = (
            f'<img src="assets/photos/thumbs/{m["id"]}.webp" alt="" width="56" height="56" loading="lazy">'
            if m.get("photo_url")
            else '<span class="hm-pc-i" aria-hidden="true"></span>'
        )
        cards.append(
            f'<article class="hm-tile hm-pc"><a class="hm-pc-h" href="p/{m["id"]}">{img}<span><b>{esc(dname(m))}</b><small>{esc(sub)}</small></span></a>'
            f'<ul class="plain">{"".join(lines)}</ul></article>'
        )
    more = len(people) - SESSION_PEOPLE_MAX
    base = f"votes?od={sp['from']}&amp;m={sp['to'][:7]}&amp;f=all&amp;stopa=1"
    if more > 0:
        cards.append(f'<a class="hm-tile hm-pc hm-pc-more" href="{base}">a dalších {fmt_num(more)} {_ARROW}</a>')
    if not people:
        cards.append(
            '<p class="hm-pc-none">Na posledním zasedání se nehlasovalo o žádné zprávě, u které by byl český poslanec '
            "zpravodajem nebo stínovým zpravodajem.</p>"
        )
    span = f"{fmt_date(sp['from'])[:-5]}–{fmt_date(sp['to'])}"
    return f"""<section class="hm-wrap" aria-labelledby="h-doors">
  <div class="hm-head"><div><p class="hm-kicker">Z posledního zasedání · {span}</p><h2 id="h-doors">Češi, kteří <strong>vedli texty.</strong></h2></div>
    <p>Zpravodajové a stínoví zpravodajové zpráv, o kterých se na zasedání hlasovalo, abecedně. Bez pořadí a hodnocení (<a href="o-projektu#z-posledniho-zasedani">pravidlo</a>).</p></div>
  <div class="hm-bento hm-sess-grid">{"".join(cards)}{mosaic_tile}</div>
  <p class="hm-note">Zdroj: EP Open Data (role u zpráv, projevy, otázky s datem v rozsahu zasedání) a HowTheyVote.eu (hlasování). Portréty © European Union – Source: EP.</p>
</section>"""


def active_meps(overview: dict) -> list[dict]:
    """Poslanci v mandátu abecedně (mozaika na Aktuálně i na rozcestníku)."""
    return sorted((m for m in overview["meps"] if _active(m)), key=lambda m: m.get("sort_label") or m["name"])


def mosaic_html(active: list[dict]) -> str:
    """Mozaika portrétů poslanců v mandátu; každý portrét je odkaz na profil (jméno a strana v data-n pro popisek)."""

    def plabel(m):
        p = m.get("party") or {}
        return "nezávislý/á" if not p or p.get("short_label") in ("Ind.", None) else p["short_label"]

    return "".join(
        f'<a href="p/{m["id"]}" data-n="{esc(dname(m))} · {esc(plabel(m))}" aria-label="{esc(dname(m))}, {esc(plabel(m))}">'
        + (
            f'<img src="assets/photos/thumbs/{m["id"]}.webp" alt="" width="64" height="64" loading="lazy">'
            if m.get("photo_url")
            else f"<span>{esc(''.join(x[0] for x in (m.get('given_name'), m.get('family_name')) if x))}</span>"
        )
        + "</a>"
        for m in active
    )


def dname(m: dict) -> str:
    return " ".join(x for x in (m.get("given_name"), m.get("family_name")) if x) or m["name"]


def session_line_html(f: dict | None) -> str:
    """Řádek pod úvodní větou: 2–3 čísla z posledního zasedání, každé s odkazem na seznam."""
    if not f:
        return ""
    base = f"votes?od={f['from']}&amp;m={f['to'][:7]}&amp;f=final"
    parts = []
    if f.get("final") is not None:
        parts.append(f'<a href="{base}"><b>{fmt_num(f["final"])}</b> závěrečných hlasování</a>')
    if f.get("considered"):
        parts.append(f'<a href="rozkol">Češi jednotní v <b>{fmt_num(f["united"])}</b> z {fmt_num(f["considered"])}</a>')
    if f.get("trace") is not None:
        parts.append(f'<a href="{base}&amp;stopa=1">česká stopa u <b>{fmt_num(f["trace"])}</b></a>')
    if not parts:
        return ""
    return (
        f'<p class="hm-sess"><span class="hm-sess-l">Poslední zasedání {fmt_date(f["from"])[:-5]}–{fmt_date(f["to"])}</span> '
        + '<span aria-hidden="true">·</span> '.join(parts)
        + "</p>"
    )


def hero_share(vote: dict, d: dict | None) -> dict | None:
    """Kontext panelu sdílení pro hlasování v heru (stejná karta jako na detailu v/, share.js)."""
    if not d:
        return None
    c, day = vote["counts"], fmt_date(vote["date"])
    topic = d.get("topic")
    return {
        "kind": "vote",
        "path": f"v/{vote['id']}",
        "filename": f"ep-watch-hlasovani-{vote['id']}",
        "subtitle": f"Hlasování · {day}{' · ' + topic if topic else ''}",
        "text": f"{d['title']} ({day}): {d['sentence']}. Češi: {c['F']} pro, {c['A']} proti. Zdroj: HowTheyVote.eu, EP Watch CZ",
        "cite": f"Evropský parlament {day}, {d['title']} ({d['kindLabel']}{', téma ' + topic if topic else ''}): {d['resultLabel']}, "
        f"{d['ep'][0]} pro, {d['ep'][1]} proti, {d['ep'][2]} se zdrželo. Čeští poslanci v mandátu: {c['F']} pro, {c['A']} proti, "
        f"{c['B']} se zdrželo, {c['N']} nehlasovalo. Zdroj: HowTheyVote.eu (https://howtheyvote.eu/votes/{vote['id']}).",
        "data": d,
    }


def legend_html(vote: dict) -> str:
    """Legenda pod hemicyklem s nenulovými počty (hub.js ji při přepnutí bere hotovou z home-data)."""
    legend = "".join(f"<li>{_dot_svg(k)}<span><b>{vote['counts'][k]}</b> {label}</span></li>" for k, label in LEGEND if vote["counts"][k])
    if vote["counts"].get("X"):
        legend += f'<li><svg viewBox="-13 -13 26 26" aria-hidden="true"><circle r="10.5" class="hm-x"/></svg><span><b>{vote["counts"]["X"]}</b> mimo mandát</span></li>'
    return legend


def next_vote_html(agenda: dict | None) -> str:
    """Štítek „Další hlasování“ v hlavičce úvodu: první a poslední den s hlasováním v programu (agenda.json),
    odpočet dopočítá hub.js. Bez programu, nebo když je program starý, prázdný řetězec."""
    if not agenda or not agenda.get("items"):
        return ""
    days = sorted({i["date"] for i in agenda["items"]})
    first, last = days[0], days[-1]
    wd = ["po", "út", "st", "čt", "pá", "so", "ne"][__import__("datetime").date.fromisoformat(first).weekday()]
    n = agenda.get("votes") or 0
    count = f"· {fmt_num(n)} {'bod' if n == 1 else 'body' if n < 5 else 'bodů'} k hlasování" if n else ""
    return (
        f'<a class="hm-nx" href="#dalsi-zasedani" data-from="{first}" data-to="{last}">'
        f'<i aria-hidden="true"></i><span class="hm-nx-l">Další hlasování</span> '
        f'<strong>{wd} {fmt_date(first)[:-5]}</strong><span class="hm-nx-c"></span><span class="hm-nx-n">{count}</span></a>'
    )


def hero_topic(vote: dict) -> str:
    """Jeden čip tématu (+N) v řádku s datem a výsledkem; česká stopa má vlastní řádek s portréty (trace_html)."""
    chips = topic_chips([t["slug"] for t in vote.get("topics") or []], 1, True, f"h{vote['id']}", "")
    return f'<span class="hm-topic">{chips}</span>' if chips else ""


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
    sums = (_read(data_dir / "vote_summaries.json") or {}).get("items", {})
    for x in votes:  # krátké AI shrnutí (vote_summaries.py); bez něj karta ukáže jen nadpis
        item = sums.get(str(x["id"])) or {}
        x["summary"], x["summary_source"], x["summary_url"] = item.get("shrnuti"), item.get("source"), item.get("source_url")
    first = votes[0]

    # Data pro přepínání hlasování a kartu ke sdílení (stejná karta jako na detailu hlasování).
    month_cache: dict[str, list[dict]] = {}
    titles = procedure_titles(data_dir)  # české názvy procedur jako jinde na webu
    share = {}
    for x in votes:
        if x["month"] not in month_cache:
            month_cache[x["month"]] = (_read(data_dir / "votes" / f"{x['month']}.json") or {"votes": []})["votes"]
            apply_titles(month_cache[x["month"]], titles)
        full = next((y for y in month_cache[x["month"]] if y["id"] == x["id"]), None)
        if full:
            share[str(x["id"])] = vote_share_data(full, meps_by_id, groups, parties, None, trace=bool(x.get("trace")))
    payload = {
        "votes": [
            {
                "id": x["id"],
                "title": x["title"],
                "counts": x["counts"],
                # popisek a legenda jako hotové HTML ze stejných šablon jako statická stránka (audit A1: bez dvojčat v hub.js)
                "cap": caption_html(x, meps_by_id, groups),
                "leg": legend_html(x),
                "num": hemi_number(x["counts"]),
                "aria": hemi_label(x["counts"]),
                "share": hero_share(x, share.get(str(x["id"]))),
                "pos": {str(p["id"]): p["pos"] for p in x["ppl"]},
                "party": {str(p["id"]): party_text(p) for p in x["ppl"]},
            }
            for x in votes
        ],
        "names": {str(p["id"]): p["name"] for p in first["ppl"]},
        "pos_txt": POS_TXT,
    }
    data_json = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")

    quick = "".join(f'<li><a href="{h}">{esc(t)}</a></li>' for h, t in QUICK)
    # Dlouhá vysvětlivka karty je v ⓘ (stejný popover jako jinde na webu), pod kartou zůstane jen řádek se zdrojem.
    about = (
        "Pět nejnovějších závěrečných hlasování, bez výběru. Tečka = poslanec v mandátu v den hlasování, barva i symbol podle hlasu; "
        'strana a frakce k datu hlasování. Data <a href="https://howtheyvote.eu">HowTheyVote.eu</a> (ODbL).'
        + (
            ' Shrnutí <span class="hm-ai">AI</span> píše Claude Haiku z přijatého textu, a dokud není, jen z úředního názvu '
            '(<a href="o-projektu#ai">jak</a>).'
            if any(x.get("summary") for x in votes)
            else ""
        )
        + (" Portréty © European Union – Source: EP." if any(x.get("trace") for x in votes) else "")
    )
    hero = f"""<section class="hm-hero" aria-labelledby="h1">
  <div class="hm-inner">
    <div class="hm-copy">
      {next_vote_html(home.get("agenda")) or '<p class="hm-eyebrow"><i aria-hidden="true"></i>10. volební období · od 16. 7. 2024</p>'}
      <h1 id="h1">Co dělají v Bruselu <strong>čeští europoslanci<span class="hm-stop" aria-hidden="true"></span></strong></h1>
      <p class="hm-lead">Hlasování, účast a práce na textech z oficiálních dat. Bez pořadí a bez hodnocení.</p>
      {session_line_html(session_facts(data_dir))}
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
      <div class="hm-cap" id="hm-cap" aria-live="polite">{caption_html(first, meps_by_id, groups)}</div>
      <div class="hm-hemi" id="hm-hemi">{hemi_html(first)}</div>
      <ul class="hm-legend" id="hm-leg">{legend_html(first)}</ul>
      <div class="hm-act"><a class="hm-detail" id="hm-more" href="v/{first["id"]}">Detail hlasování {_ARROW}</a>
        <div class="hm-icons"><span class="info-wrap hm-info"><button type="button" class="info-btn hm-icon" popovertarget="hm-about" aria-label="Zdroj a jak číst" aria-expanded="false">{_INFO_ICON}</button><div popover id="hm-about" class="info-pop" role="note"><p>{about}</p></div></span>
        <button class="hm-icon" type="button" data-share="hero" aria-haspopup="dialog" aria-label="Sdílet toto hlasování">{_SHARE_ICON}</button></div></div>
      <p class="hm-src">Zdroj: <a href="https://howtheyvote.eu">HowTheyVote.eu</a> · hlasy k datu hlasování</p>
    </section>
  </div>
  <dl class="hm-facts">
    <div><dt>{fmt_num(f["meps_active"])}</dt><dd>poslanců v mandátu</dd></div>
    <div><dt>{fmt_num(f["parties"])}</dt><dd>{"českých stran" if f["parties"] >= 5 else "české strany"}{f" a {fmt_num(f['no_party'])} bez strany" if f["no_party"] else ""}</dd></div>
    <div><dt>{fmt_num(f["votes_total"])}</dt><dd>jmenovitých hlasování od {fmt_date(f["votes_from"])}</dd></div>
    <div><dt>{fmt_date(f["data_day"])}</dt><dd>stav dat · <a href="o-projektu#metodika">aktualizace každý týden</a></dd></div>
  </dl>
  <script type="application/json" id="home-data">{data_json}</script>
</section>"""

    active = active_meps(overview)
    mosaic = mosaic_html(active)
    mosaic_tile = f"""<div class="hm-tile hm-people"><h3><a href="poslanci">Všech {fmt_num(len(active))} poslanců</a></h3><p>Profil každého z českých europoslanců, abecedně.</p>
      <div class="hm-mosaic" id="hm-mosaic">{mosaic}</div><div class="hm-mcap" id="hm-mcap" aria-hidden="true"></div>
      <a class="hm-open" href="poslanci">Otevřít {_ARROW}</a></div>"""
    bento = session_people_html(session_people(data_dir, meps_by_id), meps_by_id, groups, mosaic_tile)

    badge = {
        "unity": f"{fmt_num(f['united_final'])} z {fmt_num(f['considered_final'])} jednotně",
        "decisive": f"{fmt_num(f['decisive'])} hlasování",
    }
    rows = "".join(
        f'<li><a href="{h}"><span class="hm-t">{esc(t)}</span><span class="hm-d">{esc(d)}</span>'
        + (f'<span class="hm-st">{badge[b]}</span>' if b else "")
        + f'<span class="hm-ar">{_ARROW}</span></a></li>'
        for h, t, d, b in MORE
    )
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
    <a class="hm-pill" href="o-projektu#metodika">Metodika a zdroje {_ARROW}</a>
  </div>
</section>"""

    nxt = next_session_html(home.get("agenda"))
    body = hero + (f'<div class="hm-wrap hm-next">{nxt}</div>' if nxt else "") + bento + more + band
    title = "Aktuálně – EP Watch CZ"
    desc = "Poslední hlasování, zasedání a co se chystá: jak hlasují čeští europoslanci. Jen ověřená data z oficiálních zdrojů."
    meta = og_meta(title, desc, "aktualne.html", base_url, None, "EP Watch CZ – fakta a data o českých europoslancích")
    html = page(
        title,
        body,
        root="",
        current="now",
        description=desc,
        meta=meta,
        main_attrs='class="home-page"',
        scripts=MODULES.format(root="", page="hub.js"),
    )
    return "aktualne.html", html
