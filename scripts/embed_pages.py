"""Kompaktní karty pro vložení do článku (V2): /embed/v/{id} a /embed/p/{id}.

Karta má vždy zdroj, datum dat a odkaz na plnou stránku, aby se číslo nedalo vytrhnout z kontextu. Jen statické HTML
(bez JS), styly ze style.css. Vkládání do cizích stránek povoluje vercel.json jen pro /embed/* (frame-ancestors *).
Kód <iframe> nabízí panel Sdílet (share.js, embedCode).
"""

from __future__ import annotations

from compute_stats import POSITIONS, active_positions
from layout import version_assets
from web_ui import (
    CZ_GROUP_LABEL,
    by_gender,
    display_name,
    esc,
    fmt_date,
    fmt_num,
    fmt_pct,
    page_url,
    pct,
    result_text,
    split_bar,
    vote_title,
)

SITE = "https://epwatch.cz"


def _doc(title: str, body: str, canonical: str) -> str:
    return version_assets(
        '<!doctype html>\n<html lang="cs">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f'<base href="../../">\n<title>{esc(title)}</title>\n<meta name="robots" content="noindex">\n'
        f'<link rel="canonical" href="{esc(canonical)}">\n<link rel="stylesheet" href="style.css">\n</head>\n'
        f'<body class="embed">\n<main class="emb">{body}</main>\n</body>\n</html>\n'
    )


def _foot(src_html: str, data_day: str, url: str) -> str:
    return (
        f'<p class="emb-src">Zdroj: {src_html} · data k {fmt_date(data_day)} · '
        f'<a href="{esc(url)}" target="_blank" rel="noopener">EP Watch CZ</a></p>'
    )


def embed_vote(v: dict, meps_by_id: dict, base_url: str | None, data_day: str) -> tuple[str, str]:
    url = page_url(base_url or SITE, f"v/{v['id']}.html")
    cz = active_positions(v, meps_by_id)
    counts = [sum(p["position"] == k for p in cz) for k in POSITIONS]
    c = v["counts"]
    body = (
        f'<p class="emb-meta">Hlasování v Evropském parlamentu · {fmt_date(v["date"])}</p>'
        f'<h1 class="emb-title"><a href="{esc(url)}" target="_blank" rel="noopener">{esc(vote_title(v))}</a></h1>'
        f'<p class="emb-res"><span class="who">EP:</span> <b>{esc(result_text(v))}</b> · {fmt_num(c["for"])} pro, '
        f"{fmt_num(c['against'])} proti, {fmt_num(c['abstention'])} se zdrželo</p>"
        f"{split_bar(counts)}"
        f'<p class="emb-cz"><span class="who">Čeští poslanci:</span> {counts[0]} pro · {counts[1]} proti · {counts[2]} se zdrželo · {counts[3]} nehlasovalo</p>'
        + _foot(
            f'<a href="{esc(v.get("source_url") or "https://howtheyvote.eu")}" target="_blank" rel="noopener">HowTheyVote.eu</a> (ODbL)',
            data_day,
            url,
        )
    )
    return f"embed/v/{v['id']}.html", _doc(f"{vote_title(v)} – EP Watch CZ", body, url)


def embed_mep(prof: dict, groups: list[dict], base_url: str | None, data_day: str) -> tuple[str, str]:
    m, t = prof["mep"], prof["total"]
    url = page_url(base_url or SITE, f"p/{m['id']}.html")
    g = next((x for x in m.get("groups") or [] if not x.get("end")), None) or ((m.get("groups") or [None])[-1])
    go = next((y for y in groups if g and (y.get("ep_code") == g["code"] or y["code"] == g["code"])), None)
    group = (CZ_GROUP_LABEL.get((go or {}).get("code")) or (go or {}).get("short_label") or (g or {}).get("short_label")) if g else None
    p = next((x for x in m.get("parties") or [] if not x.get("end")), None)
    ep = ((prof.get("benchmarks") or {}).get("ep") or {}).get("attendance")
    att = t.get("attendance")
    loy = t.get("group_loyalty")
    rows = (
        f'<div class="emb-kpi"><span>Účast na hlasování</span><b>{fmt_pct(pct(att))}</b>'
        f"<small>{fmt_num(att[0])} z {fmt_num(att[1])} hlasování{f' · medián EP {fmt_pct(ep)}' if ep is not None else ''}</small></div>"
        if att and att[1]
        else ""
    ) + (
        f'<div class="emb-kpi"><span>Hlasuje s frakcí</span><b>{fmt_pct(pct(loy))}</b><small>{fmt_num(loy[0])} z {fmt_num(loy[1])} hlasování</small></div>'
        if loy and loy[1]
        else ""
    )
    who = " · ".join(x for x in (group, (p or {}).get("short_label")) if x)
    body = (
        f'<p class="emb-meta">{by_gender(m, "Europoslanec", "Europoslankyně")} za ČR{f" · {esc(who)}" if who else ""}</p>'
        f'<h1 class="emb-title"><a href="{esc(url)}" target="_blank" rel="noopener">{esc(display_name(m))}</a></h1>'
        f'<div class="emb-kpis">{rows}</div>'
        + _foot(
            '<a href="https://howtheyvote.eu" target="_blank" rel="noopener">HowTheyVote.eu</a> (ODbL), '
            '<a href="https://data.europarl.europa.eu" target="_blank" rel="noopener">EP Open Data</a>',
            data_day,
            url,
        )
    )
    return f"embed/p/{m['id']}.html", _doc(f"{display_name(m)} – EP Watch CZ", body, url)
