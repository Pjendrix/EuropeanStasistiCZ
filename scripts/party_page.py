"""Detail české strany s/{id}.html (audit A1): celý obsah vykresluje tento modul, public/party.js na stránce jen přepíná
„jen závěrečná hlasování“ a sbaluje dlouhé tabulky. Data: data/parties/{id}.json (build_web.py).
Seznam stran a evropské frakce (party.html, ?v=eu, ?c=) statický protějšek nemají a zůstávají v party.js.
"""

from __future__ import annotations

from web_ui import (
    POSITION_LABEL,
    Ui,
    display_name,
    empty_state,
    esc,
    fmt_date,
    fmt_num,
    fmt_pct,
    group_link,
    is_active,
    logo_tile,
    mep_url,
    party_badge,
    pct,
    pct_cell,
    count_pct,
    photo_url,
    vote_row,
)

REPORT_STATUS = {"ADOPTED": "přijato", "REJECTED": "zamítnuto", "no_vote": "zatím bez hlasování v plénu"}
REPORT_ROLE = {"rapporteur": "zpravodaj/ka", "co": "spoluzpravodaj/ka"}


def meps_count_cs(n: int) -> str:
    return f"{fmt_num(n)} {'poslanec' if n == 1 else 'poslanci' if n < 5 else 'poslanců'}"


def pair_text(pair, unit: str = "hlasování") -> str:
    return f"{fmt_num(pair[0])} z {fmt_num(pair[1])} {unit}" if pair and pair[1] else "nepočítá se"


def names_by_position(positions, meps_by_id: dict) -> str:
    """Jména poslanců podle hlasu (pro, proti, …), abecedně, s odkazem na profil."""
    items = positions if isinstance(positions, list) else [{"member_id": int(k), "position": v} for k, v in positions.items()]
    out = []
    for k in ("FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"):
        ms = sorted(
            (meps_by_id[p["member_id"]] for p in items if p["position"] == k and p["member_id"] in meps_by_id),
            key=lambda m: _cs_key(display_name(m)),
        )
        if ms:
            names = ", ".join(f'<a href="{mep_url(m["id"])}">{esc(display_name(m))}</a>' for m in ms)
            out.append(f'<div class="small"><span class="pos pos-{k}">{POSITION_LABEL[k]} ({len(ms)}):</span> {names}</div>')
    return "".join(out)


def _cs_key(s: str):
    """Řazení jmen podle české abecedy (dost přesné pro jména: diakritika až po základním písmenu, ch za h)."""
    order = "aábcčdďeéěfghchiíjklmnňoópqrřsštťuúůvwxyýzž"
    s = s.lower().replace("ch", "\x00")
    return [
        order.index(c) if c in order else order.index("h") + 0.5 if c == "\x00" else -1 if not c.isalnum() else 1000 + ord(c) for c in s
    ]


def reports_html(r: dict | None, meps_by_id: dict) -> str:
    """Zprávy, které vedli poslanci strany (D6): výčet, bez pořadí a hodnocení."""
    if not r:
        return ""
    items = ""
    for x in r["items"]:
        m = meps_by_id.get(x.get("mep_id"))
        title = x.get("title_cs") or x.get("label") or "zpráva"
        title = f"{title[:157]}…" if len(title) > 160 else title
        status = (
            f'<a href="v/{x["vote_id"]}">{REPORT_STATUS.get(x.get("status"), "hlasování")}</a>'
            if x.get("vote_id")
            else REPORT_STATUS.get(x.get("status"), "stav neuveden")
        )
        who = f'<a href="{mep_url(m["id"])}">{esc(display_name(m))}</a>' if m else ""
        items += (
            f'<li><a href="{esc(x.get("url"))}">{esc(title)}</a><div class="small muted">{esc(x.get("label") or "")} · {fmt_date(x.get("date"))} · '
            f"{who} ({REPORT_ROLE.get(x.get('role'), '')}) · {status}</div></li>"
        )
    n = len(r["items"])
    lead = (
        f"{fmt_num(n)} {'zpráva' if n == 1 else 'zprávy' if n < 5 else 'zpráv'}, u kterých byl poslanec strany zpravodajem nebo spoluzpravodajem"
        if n
        else "Poslanci strany zatím nevedli žádnou zprávu jako zpravodajové"
    )
    shadow = (
        f"; stínovým zpravodajem byl poslanec strany u {fmt_num(r['shadow_count'])} {'zprávy' if r['shadow_count'] == 1 else 'zpráv'}"
        if r.get("shadow_count")
        else ""
    )
    updated = f", stav k {fmt_date(r['updated'][:10])}" if r.get("updated") else ""
    return (
        f'<h2>Zprávy, které vedli poslanci strany</h2><p class="muted">{lead}{shadow}. Strana k datu zprávy.</p>'
        + (f'<div class="card"><ul class="plain">{items}</ul></div>' if items else "")
        + f'<p class="source">Zdroj: <a href="https://data.europarl.europa.eu">EP Open Data</a> (CC BY 4.0){updated} · <a href="prace">Práce poslanců</a></p>'
    )


def party_body(pp: dict, groups: list[dict], parties: list[dict], today: str, share_button: str) -> tuple[str, dict]:
    """Obsah <main> stránky strany a kontext sdílení (karta strany)."""
    ui = Ui(f"s{pp['id']}")
    t = pp["total"]
    meps_by_id = {m["id"]: m for m in pp["member_list"]}
    single = pp["cohesion"][1] == 0
    name = pp.get("name") or pp["short_label"]

    def split_list(lst: list[dict], only_main: bool) -> str:
        inner = (
            '<div class="table-wrap"><table class="stack"><thead><tr><th class="num">Datum</th><th>Hlasování</th><th>Poslanci strany</th>'
            "<th>Výsledek</th></tr></thead><tbody>"
            + "".join(vote_row(v, f'<td class="extra">{names_by_position(v["positions"], meps_by_id)}</td>') for v in lst)
            + "</tbody></table></div>"
            if lst
            else empty_state(
                "Poslanci strany se v žádném takovém hlasování nerozdělili.",
                "Zkuste zrušit filtr „jen závěrečná“.",
                [("votes", "Všechna hlasování")],
            )
        )
        return f'<div class="split-list" data-main="{"1" if only_main else "0"}"{" hidden" if only_main else ""}>{inner}</div>'

    members = sorted(pp["member_list"], key=lambda m: -(pct(m["total"]["attendance"]) if pct(m["total"]["attendance"]) is not None else -1))
    rows = "".join(
        f'<tr><td><div class="mep-cell"><img src="{photo_url(m, True)}" alt="" loading="lazy" width="40" height="40">'
        f'<div><a href="{mep_url(m["id"])}">{esc(display_name(m))}</a><div>{group_link(None, groups, (m.get("group") or {}).get("code"))}</div></div></div></td>'
        f'<td class="small wide" data-label="Ve straně (podle EP)">{"<br>".join(f"{fmt_date(x['start'])} – {fmt_date(x['end']) if x.get('end') else 'dosud'}" for x in m["party_periods"])}</td>'
        f'<td class="num" data-label="Účast na hlasování">{pct_cell(m["total"]["attendance"])}</td>'
        f'<td class="num" data-label="Hlasuje s frakcí">{pct_cell(m["total"]["group_loyalty"])}</td></tr>'
        for m in members
    )
    cohesion_main = "–" if single else f"{fmt_pct(pct(pp['cohesion_main']))} ({pair_text(pp['cohesion_main'])})"
    release = ((pp.get("sources") or {}).get("votes") or {}).get("release")
    splits = (
        ""
        if single
        else f"""<h2>Kde se strana rozdělila</h2>
<p class="muted">Hlasování, kde poslanci strany hlasovali pro i proti. Celkem {fmt_num(pp["splits_count"])} z {fmt_num(pp["cohesion"][1])} hlasování ({fmt_pct(pp["splits_count"] / pp["cohesion"][1])}), z toho v závěrečných {fmt_num(pp["splits_count_main"])} z {fmt_num(pp["cohesion_main"][1])}.</p>
<div class="controls"><label><input type="checkbox" id="split-main"> jen závěrečná hlasování</label></div>
<div id="splits">{split_list(pp["splits"], False)}{split_list(pp["splits_main"], True)}</div>"""
    )
    body = f"""<div class="back-row"><p class="small"><a href="party">← Všechny strany</a></p>{share_button}</div>
{f'<div class="logo-row">{logo_tile(pp, 48)}</div>' if pp.get("logo") else ""}
<h1>{esc(name)} {party_badge(pp["id"], pp["short_label"], parties)}</h1>

<h2>Poslanci</h2>
<div class="table-wrap"><table class="cards">
  <thead><tr><th>Poslanec</th><th>Ve straně (podle EP)</th><th class="num">Účast na hlasování</th><th class="num">Hlasuje s frakcí</th></tr></thead>
  <tbody>{rows}</tbody>
</table></div>

<h2>Souhrn za stranu</h2>
<div class="metrics">
  <div class="card metric"><div class="label">Účast poslanců strany na hlasování</div><div class="value">{count_pct(pct(t["attendance"]))}</div>
    <div class="detail">{pair_text(t["attendance"], "hlasů poslanců")}</div></div>
  <div class="card metric"><div class="label">Jednotnost</div><div class="value">{"–" if single else fmt_pct(pct(pp["cohesion"]))}</div>
    <div class="detail">{"strana měla v žádném hlasování víc než 1 hlasujícího poslance" if single else pair_text(pp["cohesion"])}</div>
    <div class="detail">závěrečná hlasování: {cohesion_main}</div></div>
  <div class="card metric"><div class="label">Soulad s výsledkem</div><div class="value">{count_pct(pct(t["outcome"]))}</div>
    <div class="detail">{pair_text(t["outcome"], "hlasů pro/proti")} · jen informativní</div></div>
</div>
<p class="source">{ui.source_line(release)}</p>
{reports_html(pp.get("reports"), meps_by_id)}

{splits}"""
    now_count = sum(1 for m in pp["member_list"] if is_active(m, today) and any(not x.get("end") for x in m["party_periods"]))
    sub = (f"{pp['short_label']} · " if name != pp["short_label"] else "") + (
        f"{meps_count_cs(now_count)} v mandátu" if now_count else "nikdo v mandátu"
    )

    def ent(e: dict | None) -> dict:
        return {"logo": e.get("logo"), "aspect": e.get("logo_aspect"), "color": e.get("color")} if e else {}

    by_code = {g["code"]: g for g in groups}
    ordered = sorted(pp["member_list"], key=lambda m: _cs_key(m.get("sort_label") or m["name"]))
    last = max(pp["splits_main"], key=lambda v: (v["date"], v["id"])) if pp.get("splits_main") else None
    detail = {
        **ent(pp),
        "short": pp["short_label"],
        "groups": [{"label": by_code[c]["short_label"], **ent(by_code[c])} for c in pp.get("groups", []) if c in by_code],
        "members": [
            {"name": display_name(m), "attendance": m["total"]["attendance"], "loyalty": m["total"]["group_loyalty"]}
            for m in ordered
            if m.get("current", True)
        ],
        "former": [{"name": display_name(m), "end": m.get("end")} for m in ordered if m.get("current") is False],
        "positions": t.get("positions"),
        "single": single,
        "membersEver": len(pp["member_list"]),
        "splits": None if single else [pp["splits_count"], pp["cohesion"][1]],
        "splitsMain": None if single else [pp["splits_count_main"], pp["cohesion_main"][1]],
        "lastSplit": {
            "title": last.get("title"),
            "date": last["date"],
            "positions": sorted(
                (
                    {"name": display_name(meps_by_id[x["member_id"]]), "position": x["position"]}
                    for x in last["positions"]
                    if x["member_id"] in meps_by_id
                ),
                key=lambda r: _cs_key(r["name"]),
            ),
        }
        if last
        else None,
    }
    share = {
        "kind": "party",
        "path": f"s/{pp['id']}",
        "filename": f"ep-watch-strana-{pp['id']}",
        "subtitle": f"Strana · {pp['short_label']}",
        "cite": ""
        if single
        else f"{name}: poslanci strany v Evropském parlamentu hlasovali jednotně v {fmt_pct(pct(pp['cohesion']))} hlasování "
        f"({fmt_num(pp['cohesion'][0])} z {fmt_num(pp['cohesion'][1])}, kde hlasovali aspoň dva). Zdroj: HowTheyVote.eu, výpočet EP Watch CZ.",
        "text": f"{name} v Evropském parlamentu: účast poslanců na hlasování {fmt_pct(pct(t['attendance']))}"
        f"{'' if single else f', jednotnost {fmt_pct(pct(pp["cohesion"]))}'}. Zdroj: HowTheyVote.eu, EP Watch CZ",
        "data": {
            "name": name,
            "sub": sub,
            "dataDay": release or today,
            **detail,
            "tiles": [
                {"label": "Účast poslanců na hlasování", "pair": t["attendance"]},
                {"label": "Jednotnost", "pair": None if single else pp["cohesion"], "note": "všichni hlasující poslanci strany stejně"},
                {"label": "Soulad s výsledkem", "pair": t["outcome"], "note": "jen informativní"},
            ],
        },
    }
    return body, share
