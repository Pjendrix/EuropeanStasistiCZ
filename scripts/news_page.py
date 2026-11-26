"""Stránka Novinky (aktualne.html): časová osa po zasedáních z news.py. Statické HTML, filtr typu dělá hub.js.

Struktura: hlavička (H1 + řádek o datech) → filtr typu (Vše / Hlasování / Zprávy / Změny) → karta „Chystá se“
(jediné místo s dalším zasedáním) → časová osa (zasedání, události, zprávy mezi zasedáními). Každý blok má
data-type pro filtr; bez JavaScriptu je vidět vše.
"""

from __future__ import annotations

from pathlib import Path

from build_pages import esc, fmt_date, fmt_num, og_meta, page, page_url
from compute_stats import load_votes
from layout import MODULES
from web_ui import CZ_GROUP_LABEL, result_text, vote_title

TITLE = "Novinky – EP Watch CZ"
DESC = "Co se v Evropském parlamentu dělo: zasedání, jak hlasovali čeští poslanci, nové zprávy a změny frakcí. Sestaveno kódem z oficiálních dat."
FILTERS = [("", "Vše"), ("hlasovani", "Hlasování"), ("zpravy", "Zprávy"), ("zmeny", "Změny frakcí")]
METHOD = "o-projektu#novinky"


def _range(a: str, b: str) -> str:
    from hub import _range as r

    return r(a, b)


def _read(path: Path):
    from hub import _read as r

    return r(path)


def cz_bar(cz: list[int]) -> str:
    """Proužek hlasů Čechů (pro, proti, zdržel se, nehlasoval) s popisem pro čtečky (role="img")."""
    total = sum(cz) or 1
    aria = f"Čeští poslanci: {cz[0]} pro, {cz[1]} proti, {cz[2]} se zdrželo, {cz[3]} nehlasovalo"
    keys = ("FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE")
    spans = "".join(f'<span class="s-{k}" style="width:{n / total * 100:.2f}%"></span>' for k, n in zip(keys, cz, strict=True))
    return f'<div class="split" role="img" aria-label="{esc(aria)}">{spans}</div>'


def cz_ratio(cz: list[int]) -> str:
    return f"{cz[0]} : {cz[1]}"


def vote_row(f: dict) -> str:
    """Řádek hlasování: název (odkaz na /v/), výsledek EP s popiskem a proužek Čechů s popiskem a štítky."""
    v, cz = f["vote"], f["cz"]
    tags = "".join(
        f'<span class="nv-tag{cls}">{label}</span>'
        for cond, label, cls in (
            (f["trace"], "česká stopa", " trace"),
            (f["split"], "Češi rozděleni", " spl"),
            (f["decisive"], "rozhodly české hlasy", ""),
            (f["close"], "těsný výsledek", ""),
        )
        if cond
    )
    return (
        f'<li class="nv-vote"><div class="nv-vt"><a href="v/{v["id"]}">{esc(vote_title(v))}</a>'
        f'<p class="nv-res"><span class="who">EP:</span> {esc(result_text(v))}</p>{f'<p class="nv-tags">{tags}</p>' if tags else ""}</div>'
        f'<div class="nv-cz"><p><span class="who">Češi</span> <b>{cz_ratio(cz)}</b>'
        f'<span class="small muted"> · {cz[2]} zdrž. · {cz[3]} nehl.</span></p>' + cz_bar(cz) + "</div></li>"
    )


def session_html(b: dict) -> str:
    head = f"Zasedání {_range(b['from'], b['to'])}"
    nums = (
        f"<b>{fmt_num(b['finals'])}</b> závěrečných hlasování"
        + (f" · Češi jednotní v <b>{fmt_num(b['united'])}</b> z {fmt_num(b['considered'])}" if b["considered"] else "")
        + (f" · česká stopa u <b>{fmt_num(b['trace'])}</b>" if b["trace"] else "")
    )
    links = " · ".join(
        x
        for x in (
            f'<a href="votes?od={b["from"]}&amp;m={b["to"][:7]}&amp;f=final">všechna hlasování zasedání ({fmt_num(b["finals"])} závěrečných, {fmt_num(b["votes"])} celkem)</a>',
            f'<a href="rozkol">kde se Češi rozdělili ({fmt_num(b["splits"])})</a>' if b["splits"] else "",
            f'<a href="prace">Češi jako zpravodajové ({fmt_num(b["rapporteurs"])})</a>' if b["rapporteurs"] else "",
        )
        if x
    )
    picks = "".join(vote_row(f) for f in b["picks"])
    body = (
        f'<p class="nv-sub">Hlavní hlasování <a class="small" href="{METHOD}">jak vybíráme</a></p><ol class="nv-votes">{picks}</ol>'
        if picks
        else '<p class="muted">Žádné závěrečné hlasování.</p>'
    )
    inner = f'<p class="nv-nums">{nums}</p>{body}<p class="nv-links small">{links}</p>'
    if b["full"]:
        return (
            f'<section class="nv-block nv-session" id="{b["anchor"]}" data-type="hlasovani" aria-labelledby="{b["anchor"]}-h">'
            f'<h2 id="{b["anchor"]}-h"><a class="nv-anchor" href="#{b["anchor"]}">{head}</a></h2>{inner}</section>'
        )
    return (
        f'<section class="nv-block nv-session nv-old" id="{b["anchor"]}" data-type="hlasovani" aria-labelledby="{b["anchor"]}-h">'
        f'<h2 id="{b["anchor"]}-h" class="nv-h-sm"><a class="nv-anchor" href="#{b["anchor"]}">{head}</a></h2><p class="nv-nums">{nums}</p>'
        f'<details><summary>Rozbalit zasedání</summary>{body}<p class="nv-links small">{links}</p></details></section>'
    )


def preliminary_html(b: dict) -> str:
    from preliminary import cz_summary

    def row(v):
        c = cz_summary(v)
        cz = [c.get("FOR", 0), c.get("AGAINST", 0), c.get("ABSTENTION", 0), c.get("DID_NOT_VOTE", 0)]
        return (
            f'<li class="nv-vote"><div class="nv-vt"><span>{esc(v.get("heading") or v.get("label") or "")}</span>'
            f'<p class="nv-res"><span class="who">EP:</span> {"přijato" if v["result"] == "ADOPTED" else "zamítnuto" if v["result"] == "REJECTED" else esc(v["result"].lower())}</p></div>'
            f'<div class="nv-cz"><p><span class="who">Češi</span> <b>{cz_ratio(cz)}</b></p>{cz_bar(cz)}</div></li>'
        )

    return (
        f'<section class="nv-block nv-session nv-prelim" id="{b["anchor"]}" data-type="hlasovani" aria-labelledby="{b["anchor"]}-h">'
        f'<h2 id="{b["anchor"]}-h"><a class="nv-anchor" href="#{b["anchor"]}">Zasedání {_range(b["from"], b["to"])}</a> <span class="pl-tag">předběžné</span></h2>'
        f'<p class="nv-nums">{fmt_num(b["votes"])} jmenovitých hlasování z EP Open Data. Budou potvrzena exportem HowTheyVote a do statistik se nepočítají.</p>'
        f'<ol class="nv-votes">{"".join(row(v) for v in b["mains"])}</ol><p class="nv-links small"><a href="./#h-prelim">předběžné výsledky na úvodu</a></p></section>'
    )


def event_html(b: dict) -> str:
    f = b["female"]
    name = f'<a href="{b["href"]}">{esc(b["name"])}</a>'
    k = b["kind"]
    if k == "group":
        text = f"{name} {'přešla' if f else 'přešel'} z frakce {esc(b['from_label'])} do frakce {esc(b['to_label'])}."
        tag = "změna frakce"
    elif k == "party":
        text = f"{name}: změna strany z {esc(b['from_label'])} na {esc(b['to_label'])}."
        tag = "změna strany"
    elif k == "mandate_start":
        text = f"{name} {'nastoupila' if f else 'nastoupil'} do Evropského parlamentu."
        tag = "nový mandát"
    else:
        text = f"{name}: konec mandátu."
        tag = "konec mandátu"
    return (
        f'<div class="nv-block nv-event" data-type="zmeny"><time datetime="{b["date"]}">{fmt_date(b["date"])}</time>'
        f'<span class="nv-tag">{tag}</span><p>{text} <span class="small muted">Zdroj: EP Open Data.</span></p></div>'
    )


def between_html(b: dict) -> str:
    when = _range(b["from"], b["to"]) if b["from"] != b["to"] else fmt_date(b["to"])
    main = "".join(
        f'<li><a href="p/{r["mep_id"]}#prace-prehled">{esc(r["name"])}</a> je zpravodajem: {esc(r["title"] or r["label"] or "")}'
        f' <span class="small muted">({fmt_date(r["date"])})</span></li>'
        for r in b["reports"]
    )
    chips = "".join(f'<a class="nv-chip" href="p/{c["mep_id"]}#prace-prehled">{esc(c["name"])} · {c["count"]}</a>' for c in b["shadow"])
    n = b["shadow_total"]
    noun = "nová stínová zpráva" if n == 1 else "nové stínové zprávy" if 2 <= n <= 4 else "nových stínových zpráv"
    return (
        f'<div class="nv-block nv-between" data-type="zpravy"><p class="nv-bh"><span class="nv-tag">mezi zasedáními</span> {when}</p>'
        + (f'<p class="small"><b>Nové zprávy (hlavní zpravodaj)</b></p><ul class="nv-main">{main}</ul>' if main else "")
        + (f'<details><summary>{fmt_num(n)} {noun}</summary><p class="nv-chips">{chips}</p></details>' if n else "")
        + '<p class="small muted">Zdroj: EP Open Data (role zpravodajů u procedur).</p></div>'
    )


TRACE_MAX = 3


def upcoming_html(u: dict | None) -> str:
    if not u:
        return '<section class="nv-next card" aria-labelledby="nv-next-h"><h2 id="nv-next-h">Chystá se</h2><p class="muted">Program dalšího zasedání zatím není zveřejněný.</p></section>'
    from hub import cz_people_html

    # Na Novinkách jen prvních TRACE_MAX bodů s českou stopou (s portréty je každý vysoký a odsunul by zasedání pod
    # 1,5 obrazovky mobilu); celý seznam je v programu zasedání (zasedani).
    shown, rest = u["trace"][:TRACE_MAX], len(u["trace"]) - TRACE_MAX
    trace = "".join(f'<li class="nv-tr">{esc(t["title"])}{cz_people_html(t["cz"])}</li>' for t in shown)
    if rest > 0:
        trace += f'<li class="nv-tr-more small"><a href="zasedani">a {fmt_num(rest)} další v programu zasedání</a></li>'
    return (
        f'<section class="nv-next card" aria-labelledby="nv-next-h"><p class="nv-kicker">Chystá se</p>'
        f'<h2 id="nv-next-h">Další zasedání {_range(u["from"], u["to"])}</h2>'
        f"<p>{fmt_num(u['items'])} bodů k hlasování v návrhu programu EP{f' · česká stopa u {fmt_num(len(u["trace"]))}' if u['trace'] else ''}.</p>"
        + (f'<ul class="nv-trace small">{trace}</ul>' if trace else "")
        + '<p><a href="zasedani">Celý program po dnech</a> · <span class="small muted">Návrh programu EP, může se změnit.</span></p></section>'
    )


def build(data_dir: Path) -> tuple[list[dict], dict | None, str]:
    """Bloky časové osy, karta Chystá se a datum exportu (pro stránku i feed.xml)."""
    import datetime as dt

    import news
    from overrides import apply_name_overrides
    from preliminary import check_day, htv_last_day, pending_days

    meps = (_read(data_dir / "meps.json") or {}).get("meps", [])
    apply_name_overrides(meps, data_dir / "manual" / "overrides.json")
    groups = _read(data_dir / "groups.json") or []

    def group_label(g):
        go = next((y for y in groups if y.get("ep_code") == g["code"] or y["code"] == g["code"]), None)
        return CZ_GROUP_LABEL.get((go or {}).get("code")) or (go or {}).get("short_label") or g.get("short_label") or g["code"]

    prelim_dir = data_dir / "preliminary"
    days = [d for d in (_read(prelim_dir / f"{x}.json") for x in pending_days(prelim_dir, htv_last_day(data_dir / "votes"))) if d]
    for d in days:
        check_day(d)
    _, votes = load_votes(data_dir / "votes")
    # „dnes“ = den exportu dat (stránka se nepřestavuje denně); bez freshness.json den posledního hlasování
    release = (
        (_read(data_dir / "freshness.json") or {}).get("release") or max((v["date"] for v in votes), default=dt.date.today().isoformat())
    )[:10]
    today = max([release] + [d["date"] for d in days])
    roles = (_read(data_dir / "vote_roles.json") or {}).get("votes") or {}
    blocks = news.build_timeline(votes, meps, _read(data_dir / "own_work.json"), roles, days, today, group_label)
    news.validate(blocks)
    return blocks, news.upcoming(_read(data_dir / "agenda.json"), _read(data_dir / "radar.json"), today), release


def news_page(data_dir: Path, base_url: str | None) -> tuple[str, str]:
    blocks, up, release = build(data_dir)
    html_blocks = []
    for b in blocks:
        t = b["type"]
        html_blocks.append(
            session_html(b)
            if t == "session"
            else preliminary_html(b)
            if t == "preliminary"
            else event_html(b)
            if t == "event"
            else between_html(b)
        )
    chips = "".join(
        f'<button type="button" class="nv-f" data-typ="{k}" aria-pressed="{"true" if not k else "false"}">{label}</button>'
        for k, label in FILTERS
    )
    body = f"""<div class="nv-wrap">
<header class="nv-head"><h1>Novinky</h1>
<p class="nv-meta">Data k {fmt_date(release)} z <a href="https://howtheyvote.eu">HowTheyVote.eu</a> a <a href="https://data.europarl.europa.eu">EP Open Data</a> · posledních 60 dní</p></header>
<div class="nv-filter" role="group" aria-label="Typ novinek" hidden>{chips}</div>
{upcoming_html(up)}
<div class="nv-timeline" id="nv-timeline">{"".join(html_blocks)}</div>
<p class="nv-empty muted" hidden>Pro tento typ za posledních 60 dní nic není.</p>
<p class="small muted">Hlavní hlasování vybírá pravidlo, ne redakce: <a href="{METHOD}">jak vybíráme</a>. Starší hlasování najdete v <a href="votes">seznamu hlasování</a>.</p>
</div>"""
    meta = og_meta(TITLE, DESC, "aktualne.html", base_url, None, "EP Watch CZ – novinky z Evropského parlamentu")
    html = page(TITLE, body, root="", current="now", description=DESC, meta=meta, scripts=MODULES.format(root="", page="hub.js"))
    return "aktualne.html", html


def feed_entries(data_dir: Path, base_url: str) -> list[dict]:
    """Položky feed.xml: zasedání (čísla + hlavní hlasování) a události. Zprávy do feedu nejdou (bylo by jich moc)."""
    blocks, _, _ = build(data_dir)
    out = []
    for b in blocks:
        if b["type"] == "session":
            url = page_url(base_url, f"aktualne.html#{b['anchor']}")
            picks = "; ".join(f"{vote_title(f['vote'])} ({result_text(f['vote'])}, Češi {f['cz'][0]}:{f['cz'][1]})" for f in b["picks"])
            out.append(
                {
                    "id": url,
                    "url": url,
                    "date": b["to"],
                    "title": f"Zasedání {_range(b['from'], b['to'])}: {b['finals']} závěrečných hlasování",
                    "summary": f"Češi jednotní v {b['united']} z {b['considered']}. Hlavní hlasování: {picks}. Zdroj: HowTheyVote.eu (ODbL).",
                }
            )
        elif b["type"] == "event":
            url = page_url(base_url, b["href"] + ".html")
            verb = {
                "group": f"změna frakce: {b.get('from_label')} → {b.get('to_label')}",
                "party": f"změna strany: {b.get('from_label')} → {b.get('to_label')}",
                "mandate_start": "začátek mandátu",
                "mandate_end": "konec mandátu",
            }[b["kind"]]
            out.append(
                {
                    "id": f"{url}#{b['kind']}-{b['date']}",
                    "url": url,
                    "date": b["date"],
                    "title": f"{b['name']}: {verb}",
                    "summary": f"{verb.capitalize()} ({fmt_date(b['date'])}). Zdroj: EP Open Data.",
                }
            )
    return out
