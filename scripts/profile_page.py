"""Profil poslance p/{id}.html (audit A1): celý obsah vykresluje tento modul, public/profile.js jen doplňuje interakce
(hodnota měsíce v grafu, přepínač „jen závěrečná“, sbalení dlouhých tabulek). Data: data/meps/{id}.json (build_web.py).

Kontext panelu sdílení (karta poslance a karty jednotlivých čísel) je JSON v <script id="share-context">; čte ho share.js.
"""

from __future__ import annotations

import json

from web_ui import (
    COMMITTEE_TYPE,
    CZ_GROUP_LABEL,
    NO_PARTY_NOTE,
    POSITION_LABEL,
    RESULT_LABEL,
    RESULT_NOTE,
    ROLE_LABEL,
    SHORT_MANDATE_NOTE,
    Ui,
    by_gender,
    count_pct,
    current_of,
    display_name,
    empty_state,
    entity_cell,
    esc,
    find_group,
    find_party,
    first_sentence,
    fixed,
    js_round,
    num,
    fmt_date,
    fmt_month,
    fmt_num,
    fmt_pct,
    group_badge,
    group_color,
    is_active,
    kind_tag,
    logo_tile,
    mandate_text,
    mep_url,
    party_badge,
    party_link,
    party_url,
    pct,
    pct_cell,
    period_text,
    photo_url,
    position_for,
    result_html,
    split_bar,
    vote_row,
    vote_subtitle,
    vote_title,
    vote_url,
    bench_row,
)

OWN_STATUS = {
    "ADOPTED": ("přijato", "result-ADOPTED"),
    "REJECTED": ("zamítnuto", "result-REJECTED"),
    "LAPSED": ("propadlo", ""),
    "WITHDRAWN": ("staženo", ""),
    "superseded": ("nahrazeno společným návrhem", "muted"),
    "no_vote": ("bez jmenovitého hlasování v plénu", "muted"),
    "answered": ("odpověď přišla", ""),
    "unanswered": ("zatím bez odpovědi", "muted"),
}
OWN_ROLE = {
    "RAPPORTEUR": "zpravodaj/ka",
    "RAPPORTEUR_CO": "spoluzpravodaj/ka",
    "RAPPORTEUR_SHADOW": "stínový zpravodaj/ka",
    "RAPPORTEUR_OPINION": "zpravodaj/ka stanoviska",
    "RAPPORTEUR_SHADOW_OPINION": "stínový zpravodaj/ka stanoviska",
    "AUTHOR": "autor/ka",
}
NO_VOTE_NOTE = (
    "HowTheyVote eviduje jen jmenovitá hlasování. O textu se mohlo hlasovat jinak (zvednutím ruky, tajně, např. u jmenování) "
    "nebo hlasování teprve proběhne."
)
PROCESS_TYPE = {
    "COD": "legislativní – řádný postup",
    "CNS": "legislativní – konzultace",
    "APP": "legislativní – souhlas",
    "INI": "z vlastního podnětu",
    "NLE": "nelegislativní akt",
    "DEC": "absolutorium",
    "BUD": "rozpočet",
    "BUI": "rozpočet",
    "DEA": "akt v přenesené pravomoci",
    "RSP": "usnesení k tématu",
}
QUESTION_KIND = {"question_written": "písemná", "question_priority": "přednostní písemná", "question_oral": "ústní"}
TIER_TEXT = {"top": "▲ horní třetina delegace", "mid": "● střední třetina delegace", "low": "▼ dolní třetina delegace"}
# Šířka časové osy: široká verze pro desktop, úzká pro mobil (CSS ukáže jednu), aby text v SVG zůstal čitelný.
TIMELINE_WIDTHS = ((1000, 90, "tl-wide"), (318, 56, "tl-narrow"))


def text_on(hex_: str | None) -> str:
    """Čitelná barva textu na barevném pozadí podle relativní jasnosti WCAG."""
    if not hex_ or len(hex_) != 7 or not hex_.startswith("#"):
        return "#0F172A"
    try:
        c = [int(hex_[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    except ValueError:
        return "#0F172A"
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    return "#0F172A" if (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05) else "#FFFFFF"


def _ms(day: str) -> float:
    from datetime import date

    y, m, d = (int(x) for x in day[:10].split("-"))
    return (date(y, m, d) - date(1970, 1, 1)).days * 86400000


def timeline(mep: dict, groups: list[dict], parties: list[dict], today: str) -> str:
    """Časová osa frakcí a stran (od začátku mandátu do dneška nebo konce mandátu), dvě šířky."""
    start = mep["mandates"][0]["start"]
    last_end = mep["mandates"][-1].get("end")
    end = last_end if last_end and last_end < today else today
    t0, t1 = _ms(start), _ms(end)
    span = max(t1 - t0, 1)

    def g_of(it):
        return next((g for g in groups if g.get("ep_code") == it["code"] or g["code"] == it["code"]), None)

    def p_of(it):
        return find_party(parties, it.get("org_id"))

    desc = "; ".join(
        [f"frakce {CZ_GROUP_LABEL.get((g_of(it) or {}).get('code')) or it['short_label']} {period_text(it)}" for it in mep["groups"]]
        + [f"strana {it['short_label']} {period_text(it)}" for it in mep["parties"]]
    )
    out = []
    for width, x0, cls in TIMELINE_WIDTHS:

        def x(d, width=width, x0=x0):
            return x0 + ((min(max(_ms(d), t0), t1) - t0) / span) * (width - x0)

        def row(items, y, label, color_of, text_of, x=x):
            segs = []
            for it in items:
                x1, x2 = x(it["start"]), x(it.get("end") or end)
                w = max(x2 - x1, 3)
                txt, fill = text_of(it), color_of(it)
                seg = f'<rect x="{fixed(x1, 1)}" y="{y}" width="{fixed(w, 1)}" height="24" rx="5" fill="{fill}"><title>{esc(txt)}: {period_text(it)}</title></rect>'
                if w > len(txt) * 7.5 + 12:
                    seg += f'<text x="{fixed(x1 + 8, 1)}" y="{y + 17}" class="tl-seg" fill="{text_on(fill)}">{esc(txt)}</text>'
                segs.append(seg)
            return f'<text x="0" y="{y + 17}" class="tl-row">{label}</text>' + "".join(segs)

        ticks = ""
        for yr in range(int(start[:4]) + 1, int(end[:4]) + 1):
            xd = x(f"{yr}-01-01")
            ticks += f'<line x1="{num(xd)}" x2="{num(xd)}" y1="0" y2="68" class="tl-tick"/>'
            if x0 + 80 < xd < width - 80:
                ticks += f'<text x="{num(xd + 4)}" y="84" class="tl-year">{yr}</text>'
        groups_row = row(
            mep["groups"],
            4,
            "Frakce",
            lambda it: group_color(g_of(it)),
            lambda it: CZ_GROUP_LABEL.get((g_of(it) or {}).get("code")) or (g_of(it) or {}).get("short_label") or it["short_label"],
        )
        parties_row = row(
            mep["parties"],
            36,
            "Strana",
            lambda it: group_color(p_of(it)),
            lambda it: by_gender(mep, "nezávislý", "nezávislá") if (p_of(it) or {}).get("independent") else it["short_label"],
        )
        out.append(
            f'<svg class="timeline {cls}" viewBox="0 0 {width} 90" role="img" aria-label="{esc(f"Časová osa: {desc}")}">'
            f"{ticks}{groups_row}{parties_row}"
            f'<text x="{x0}" y="84" class="tl-year">{fmt_date(start)}</text>'
            f'<text x="{width}" y="84" class="tl-year" text-anchor="end">{"dnes" if end == today else fmt_date(end)}</text></svg>'
        )
    return "".join(out)


def month_detail(k: str, a: list[int], mep: dict) -> str:
    extra = f" V tomto měsíci {by_gender(mep, 'nehlasoval', 'nehlasovala')}. Důvod EP v datech neuvádí." if a[1] and not a[0] else ""
    return (
        f"<strong>{fmt_month(k)}</strong>: {by_gender(mep, 'hlasoval', 'hlasovala')} v {fmt_num(a[0])} z {fmt_num(a[1])} hlasování "
        f"(<strong>{fmt_pct(pct(a))}</strong>).{extra}"
    )


def monthly_chart(monthly: dict, mep: dict) -> str:
    """Graf po měsících; text pod grafem je předvyplněný pro poslední měsíc, profile.js ho mění podle sloupce (data-detail)."""
    months = list(monthly)
    if not months:
        return '<p class="muted">Žádná hlasování v době mandátu.</p>'
    cols = []
    for i, k in enumerate(months):
        pair = monthly[k]["attendance"]
        v = pct(pair)
        y, m = k.split("-")
        show_year = i == 0 or m == "01"
        sparse = not show_year and int(m) % 3 != 1
        active = " active" if i == len(months) - 1 else ""
        height = num(v * 100) if v else "0"
        cols.append(
            f'<button type="button" class="col{active}" data-month="{k}" data-detail="{esc(month_detail(k, pair, mep))}">'
            f'<span class="bar-fill {"zero" if v == 0 else ""}" style="height:{height}%"></span>'
            f'<span class="col-label{" col-sparse" if sparse else ""}" aria-hidden="true">{int(m)}{f"<br><b>{y[2:]}</b>" if show_year else ""}</span>'
            f'<span class="sr-only">{fmt_month(k)}: {fmt_pct(v)}, {pair[0]} z {pair[1]} hlasování</span></button>'
        )
    last = months[-1]
    return (
        '<div class="chart-wrap"><div class="chart-y"><span>100 %</span><span>50 %</span><span>0 %</span></div>'
        f'<div class="chart" role="group" aria-label="Účast na hlasování po měsících">{"".join(cols)}</div></div>'
        f'<p class="chart-detail" aria-live="polite">{month_detail(last, monthly[last]["attendance"], mep)}</p>'
    )


def outcome_card(label: str, own, group, detail: str, mep: dict) -> str:
    own_txt = f"{fmt_num(own[0])} z {fmt_num(own[1])} hlasů pro/proti" if own and own[1] else "nepočítá se"
    grp = (
        f"průměr {by_gender(mep, 'jeho', 'její')} frakce ve stejných hlasováních: <strong>{fmt_pct(pct(group))}</strong>"
        if group and group[1]
        else "průměr frakce se nepočítá (nezařazení)"
    )
    return (
        f'<div class="card metric"><div class="label">{label}</div><div class="value">{count_pct(pct(own))}</div>'
        f'<div class="detail">{own_txt}</div><div class="detail">{grp}</div>'
        f'<div class="detail">{detail} · <a href="o-projektu#metodika">co to znamená</a></div></div>'
    )


def side_cell(v: dict) -> str:
    """Hlasoval(a) tak, jak hlasování dopadlo? Jen u hlasů pro a proti a jen při výsledku přijato / zamítnuto."""
    pos, res = v.get("position"), v.get("result")
    won = (pos == "FOR" and res == "ADOPTED") or (pos == "AGAINST" and res == "REJECTED")
    lost = (pos == "FOR" and res == "REJECTED") or (pos == "AGAINST" and res == "ADOPTED")
    return (
        f'<td class="extra small muted">{"ano, výsledek odpovídá hlasu" if won else "ne, hlasování dopadlo opačně" if lost else "–"}</td>'
    )


def vote_table(rows: list[dict], extra_head: str, extra_cell, empty: str | None = None) -> str:
    if not rows:
        return empty if empty is not None else empty_state("Žádné takové hlasování.")
    return (
        '<div class="table-wrap"><table class="stack"><thead><tr><th class="num">Datum</th><th>Hlasování</th>'
        f"{extra_head}<th>Výsledek</th></tr></thead><tbody>{''.join(vote_row(v, extra_cell(v)) for v in rows)}</tbody></table></div>"
    )


def own_summary_line(typ: str, s: dict | None) -> str:
    if not s or not s.get("count"):
        return ""
    if typ == "question":
        detail = f"odpověď přišla na {s['answered']}"
    elif s.get("voted") is not None:
        parts = [f"hlasováno v plénu {s['voted']}, z toho přijato {s['adopted']}"]
        if s.get("superseded"):
            parts.append(f"nahrazeno společným návrhem {s['superseded']}")
        if s.get("other"):
            parts.append(f"propadlo nebo staženo {s['other']}")
        if s.get("no_vote"):
            parts.append(f"bez jmenovitého hlasování {s['no_vote']}")
        detail = " · ".join(parts)
    else:
        detail = "výsledek se nesleduje"
    return f'<div class="card metric"><div class="label">{esc(typ)}</div><div class="value">{fmt_num(s["count"])}</div><div class="detail">{detail}</div></div>'


def own_item(e: dict) -> str:
    label, cls = OWN_STATUS.get(e.get("status"), ("", ""))
    title = (e.get("title") and (e["title"].get("cs") or e["title"].get("en"))) or e.get("label") or e.get("id")
    vote_link = f' · <a href="vote?id={e["vote_id"]}">hlasování</a>' if e.get("vote_id") else ""
    if e.get("type") == "question":
        extra = (
            f"{QUESTION_KIND.get(e.get('subtype'), '')} otázka"
            + (f", spoluautorů {e['authors_total']}" if (e.get("authors_total") or 0) > 1 else "")
            + (f", odpověď {fmt_date(e['answer_date'])}" if e.get("answer_date") else "")
        )
    elif e.get("signatories_total"):
        extra = f"podepsalo {e['signatories_total']} poslanců"
    else:
        extra = f"výbor {esc(e['committee'])}" if e.get("committee") else ""
    ptag = (
        f' <span class="badge outline{" leg" if e.get("legislative") else ""}" title="typ procedury {esc(e["process_type"])}">'
        f"{esc(PROCESS_TYPE.get(e['process_type'], e['process_type']))}</span>"
        if e.get("process_type")
        else ""
    )
    meta = (
        f"{fmt_date(e.get('date'))} · {esc(e.get('label') or '')} · {OWN_ROLE.get(e.get('role')) or esc(e.get('role'))}"
        + (f" · {extra}" if extra else "")
        + (f" · zpráva {esc(e['report'])}" if e.get("report") else "")
    )
    status = ""
    if label:
        status = (
            f'<div class="small"><span class="{cls}" title="{esc(NO_VOTE_NOTE) if e.get("status") == "no_vote" else ""}">{label}</span>'
            + (" (Parlament přijal návrh na zamítnutí)" if e.get("note") == "rejection_adopted" else "")
            + (f" (společný návrh: {RESULT_LABEL.get(e['joint_result'], e['joint_result'])})" if e.get("joint_result") else "")
            + f"{vote_link}</div>"
        )
    return f'<li><a href="{esc(e.get("url"))}">{esc(title)}</a>{ptag}<div class="small muted">{meta}</div>{status}</li>'


def passed_card(label: str, value, details: list[str], suffix: str = "") -> str:
    val = "–" if value is None else f"{fmt_num(value)}{suffix}"
    return (
        f'<div class="card metric"><div class="label">{label}</div><div class="value">{val}</div>'
        + "".join(f'<div class="detail">{d}</div>' for d in details if d)
        + "</div>"
    )


def own_passed(ui: Ui, ow: dict, mep: dict) -> str:
    p, r = ow.get("passed"), ow.get("roles")
    if not p or not r:
        return ""
    d = r.get("delegation")

    def tier_line(k):
        if not d or not r.get(k):
            return ""
        if d.get("tiers_skipped"):
            return "kratší mandát, nesrovnává se"
        return f"<strong>{TIER_TEXT[d['tiers'][k]]}</strong>" if d["tiers"].get(k) else ""

    def leg(n):
        return f"z toho legislativních <strong>{fmt_num(n)}</strong>" if n else ""

    def status(adopted, pending):
        parts = [
            f"prošlo <strong>{fmt_num(adopted)}</strong>" if adopted else "",
            f"{fmt_num(pending)} zatím bez jmenovitého hlasování" if pending else "",
        ]
        return " · ".join(x for x in parts if x)

    adopted_list = [e for e in ow["items"] if e.get("type") in ("report", "shadow_report") and e.get("status") == "ADOPTED"]
    zprav = by_gender(mep, "zpravodaj", "zpravodajka")
    stin = by_gender(mep, "stínový zpravodaj", "stínová zpravodajka")
    a = by_gender(mep, "", "a")
    cards = "".join(
        [
            passed_card(
                f"Zprávy – {zprav}",
                r["lead_reports"],
                [
                    tier_line("lead_reports"),
                    f"text vedl{a} za výbor",
                    status(p["lead_adopted"], p["lead_pending"]),
                    leg(p["lead_adopted_legislative"]),
                ],
            ),
            passed_card(
                f"Stanoviska – {zprav}", r["lead_opinions"], [tier_line("lead_opinions"), "stanovisko dalšího výboru k cizí zprávě"]
            ),
            passed_card(
                f"Zprávy – {stin}",
                r["shadow_reports"],
                [
                    tier_line("shadow_reports"),
                    f"vyjednával{a} text za svou frakci",
                    status(p["shadow_adopted"], p["shadow_pending"]),
                    leg(p["shadow_adopted_legislative"]),
                ],
            ),
            passed_card(
                f"Stanoviska – {stin}", r["shadow_opinions"], [tier_line("shadow_opinions"), f"vyjednával{a} stanovisko za svou frakci"]
            ),
            passed_card(
                "Podepsané návrhy usnesení",
                r["motions_signed"],
                [
                    f"z toho přijato {fmt_num(p['resolutions_adopted'])}" if p.get("resolutions_adopted") else "",
                    "nesrovnává se: návrh podepisují desítky poslanců za frakci",
                ],
            ),
        ]
    )
    if d:
        note = (
            f"Třetina = kde poslanec stojí mezi {fmt_num(d['of'])} současnými poslanci delegace v dané kategorii;\n"
            "      celkové pořadí záměrně nepočítáme."
            + (f" Pozor: mandát má až od {fmt_date(d['mandate_from'])}, ostatní většinou od 16. 7. 2024." if d.get("mandate_from") else "")
            + (
                " Mandát pokrývá méně než 75 % období, proto se třetina neurčuje a počty se s kolegy nesrovnávají."
                if d.get("tiers_skipped")
                else ""
            )
            + '\n      <a href="prace-poslanci">Srovnání celé delegace</a>.'
        )
    else:
        note = f"{by_gender(mep, 'Bývalý poslanec', 'Bývalá poslankyně')} se se současnou delegací nesrovnává (jiné období)."
    lst = (
        f'<details class="card own-list"><summary><strong>Přijaté zprávy, na kterých pracoval{a}</strong> ({len(adopted_list)})</summary>'
        f'<ul class="plain">{"".join(own_item(e) for e in adopted_list)}</ul></details>'
        if adopted_list
        else ""
    )
    long = (
        "Zpravodaj/ka píše text za výbor (zprávu výboru, který věc vede, nebo stanovisko dalšího výboru), stínový/á zpravodaj/ka ho "
        "vyjednává za svou frakci. Počítají se všechny přidělené texty bez ohledu na výsledek hlasování. Legislativní = Parlament "
        f"spolurozhoduje o právním předpisu (procedury COD, CNS, APP). {note}"
    )
    return (
        f'<h3 class="own-sub">Práce na textech v delegaci</h3><div class="metrics">{cards}</div>{lst}'
        + ui.note_line("Počítají se všechny přidělené texty bez ohledu na výsledek hlasování.", long)
        + '<h3 class="own-sub">Všechna práce podle typu</h3>'
    )


def activity_block(ui: Ui, a: dict | None) -> str:
    if not a:
        return ""
    src = f'<a href="{esc(a["source"]["url"])}">EP Open Data (speeches)</a>' if (a.get("source") or {}).get("url") else "EP Open Data"
    minutes = ""
    if a["speeches"]:
        minutes = f"celkem {fmt_num(js_round(a['speeches_minutes']))} min" + (
            f" (délka známa u {fmt_num(a['speeches_timed'])} z {fmt_num(a['speeches'])})" if a["speeches_timed"] < a["speeches"] else ""
        )
    cards = passed_card(
        "Ústní projevy v rozpravách",
        a["speeches"],
        [minutes, f"v {fmt_num(a['speech_items'])} bodech jednání" if a.get("speech_items") else "", "jen počet, bez srovnání s kolegy"],
    ) + passed_card("Písemná prohlášení", a["written_statements"], ["počítáme zvlášť: dají se psát hromadně"])
    return f'<h3 class="own-sub">Projevy v plénu</h3><div class="metrics">{cards}</div>' + ui.note_line(
        f"Zdroj: {src} (CC BY 4.0) · stav k {fmt_date(a.get('updated'))}",
        "Počty v době mandátu. Projevy ani prohlášení nevypovídají o kvalitě ani vlivu a nejsou součástí třetin.",
        "source",
    )


def presence_card(pr: dict | None, mep: dict) -> str:
    if not pr or not pr.get("days"):
        return ""
    src = f'<a href="{esc(pr["source"]["url"])}">EP Open Data (meetings)</a>' if (pr.get("source") or {}).get("url") else "EP Open Data"
    excused = f" · {fmt_num(pr['excused'])} omluven{by_gender(mep, '', 'a')}" if pr.get("excused") else ""
    return (
        f'<div class="card metric"><div class="label">Prezence na zasedání (podle EP)</div>'
        f'<div class="value">{count_pct(pr["present"] / pr["days"])}</div>'
        f'<div class="detail">{fmt_num(pr["present"])} z {fmt_num(pr["days"])} dnů jednání v době mandátu{excused}</div>'
        f'<div class="detail">podle prezenční listiny EP, jen dny, ke kterým listina existuje · {src}, stav k {fmt_date(pr.get("updated"))}</div></div>'
    )


def own_work(ui: Ui, ow: dict | None, mep: dict) -> str:
    if not ow:
        return '<p class="muted">Data o vlastní práci se připravují.</p>'
    types = list(ow["type_labels"])
    cards = "".join(own_summary_line(ow["type_labels"][t], ow["summary"].get(t)) for t in types)
    lists = ""
    for t in types:
        items = [e for e in ow["items"] if e.get("type") == t]
        if items:
            lists += (
                f'<details class="card own-list"><summary><strong>{esc(ow["type_labels"][t])}</strong> ({len(items)})</summary>'
                f'<ul class="plain">{"".join(own_item(e) for e in items)}</ul></details>'
            )
    body = (
        f'<div class="metrics">{cards}</div>'
        if cards
        else empty_state(
            "V datech EP není žádná zpráva, usnesení ani otázka.",
            "Ne každý poslanec je zpravodajem nebo autorem návrhu a práci ve výborech data EP celou neevidují.",
            [("o-projektu#metodika", "Co se počítá")],
        )
    )
    return (
        own_passed(ui, ow, mep)
        + body
        + lists
        + ui.note_line(
            f'Zdroj: <a href="https://data.europarl.europa.eu">EP Open Data</a> (CC BY 4.0), <a href="https://howtheyvote.eu">HowTheyVote.eu</a> · '
            f"aktualizováno {fmt_date(ow.get('updated'))}{'' if ow.get('complete') else ' (data nejsou úplná)'}",
            f'Pozměňovací návrhy nejsou zahrnuté. „Bez jmenovitého hlasování“: {esc(NO_VOTE_NOTE)} <a href="o-projektu#metodika">Jak počítáme</a>.',
            "source",
        )
    )


def summary_sentence(mep: dict, t: dict, prof: dict) -> str:
    """Souhrn ve větě ze šablony; všechna čísla jsou spočítaná skriptem (meps/{id}.json)."""
    att, loy = pct(t["attendance"]), pct(t["group_loyalty"])
    ow = prof.get("own_work") or {}
    ro, pa = ow.get("roles"), ow.get("passed")

    def plural(n):
        return f"{fmt_num(n)} {'zprávu' if n == 1 else 'zprávy' if n < 5 else 'zpráv'}"

    def adopted_of(n, adopted):
        return f", z toho {fmt_num(adopted)} Parlament přijal" if n and adopted else ""

    sentences = []
    if att is not None or loy is not None:
        first = (
            f"{by_gender(mep, 'Hlasoval', 'Hlasovala')} v {fmt_pct(att)} jmenovitých hlasování ze svého mandátu "
            f"({fmt_num(t['attendance'][0])} z {fmt_num(t['attendance'][1])})"
            if att is not None
            else ""
        )
        second = (
            f"v {fmt_pct(loy)} {by_gender(mep, 'hlasoval', 'hlasovala')} stejně jako většina {by_gender(mep, 'jeho', 'její')} frakce"
            if loy is not None
            else ""
        )
        sentences.append(esc(f"{first} a {second}" if first and second else first or f"{by_gender(mep, 'Hlasoval', 'Hlasovala')} {second}"))
    if ro and ro.get("lead_reports"):
        sentences.append(
            esc(
                f"{by_gender(mep, 'Vedl', 'Vedla')} {plural(ro['lead_reports'])} výboru{adopted_of(ro['lead_reports'], (pa or {}).get('lead_adopted'))}"
            )
        )
    if ro and ro.get("shadow_reports"):
        sentences.append(
            esc(
                f"Jako {by_gender(mep, 'stínový zpravodaj', 'stínová zpravodajka')} {by_gender(mep, 'vyjednával', 'vyjednávala')} za frakci "
                f"{plural(ro['shadow_reports'])}{adopted_of(ro['shadow_reports'], (pa or {}).get('shadow_adopted'))}"
            )
        )
    return " ".join(s + "." for s in sentences)


def share_context(prof: dict, groups: list[dict], parties: list[dict], ctx: dict, today: str) -> dict:
    """Kontext panelu sdílení: karta poslance („default“) a karty čísel („metric:klíč“). Jen čísla, která jsou na stránce."""
    mep, t, b = prof["mep"], prof["total"], prof.get("benchmarks") or {}
    name, group_label, party_label, is_ni = ctx["name"], ctx["group_label"], ctx["party_label"], ctx["is_ni"]
    ep, grp = b.get("ep") or {}, b.get("group") or {}
    release = ((prof.get("sources") or {}).get("votes") or {}).get("release")
    day = release if release and len(release) == 10 else today
    since = fmt_date(mep["mandates"][0]["start"])

    def defn(k):
        return first_sentence((prof.get("definitions") or {}).get(k))

    def cite(what, pair):
        if not pair or not pair[1]:
            return ""
        return (
            f"{name}: {what} {fmt_pct(pct(pair))} ({fmt_num(pair[0])} z {fmt_num(pair[1])} jmenovitých hlasování v Evropském parlamentu "
            f"v době mandátu, od {since}). Zdroj: HowTheyVote.eu, výpočet EP Watch CZ."
        )

    metrics = {
        "attendance": ("Účast na hlasování", t["attendance"], ep.get("attendance"), "medián EP", "účast na hlasování"),
        "attendance_main": (
            "Účast na hlasování – závěrečná",
            t["attendance_main"],
            ep.get("attendance_main"),
            "medián EP",
            "účast na hlasování u závěrečných hlasování",
        ),
        "group_loyalty": (
            "Hlasuje s frakcí",
            t["group_loyalty"],
            None if is_ni else grp.get("group_loyalty"),
            "medián frakce",
            "hlasuje s frakcí",
        ),
        "cz_agreement": ("Shoda s ostatními Čechy", t["cz_agreement"], None, "", "shoda s ostatními českými poslanci"),
    }
    out = {}
    context_line = " · ".join(x for x in (name, group_label, party_label) if x)
    for key, (label, pair, median, med_label, what) in metrics.items():
        if not pair or not pair[1]:
            continue
        out[f"metric:{key}"] = {
            "kind": "metric",
            "path": f"p/{mep['id']}#dochazka",
            "filename": f"ep-watch-{mep['id']}-{key}",
            "subtitle": f"{name} · {label}",
            "cite": cite(what, pair),
            "text": f"{name}: {label.lower()} {fmt_pct(pct(pair))} ({fmt_num(pair[0])} z {fmt_num(pair[1])} hlasování). Zdroj: HowTheyVote.eu, EP Watch CZ",
            "data": {
                "context": context_line,
                "label": label,
                "pair": pair,
                "median": median,
                "medLabel": med_label,
                "definition": defn(key),
                "dataDay": day,
            },
        }
    ow = prof.get("own_work") or {}
    ro, ows, pas = ow.get("roles"), ow.get("summary") or {}, ow.get("passed") or {}
    c_now = [c for c in mep["committees"] if not c.get("end") or c["end"] >= today]
    top = sorted(
        (
            {"name": display_name(x), "party": (x.get("party") or {}).get("short_label") or "", "share": x["same"] / x["total"]}
            for x in prof["pairwise"]
            if x["total"] >= 100
        ),
        key=lambda x: -x["share"],
    )[:3]
    act, pres = prof.get("activity"), prof.get("presence")
    work_day = ow.get("updated") or (act or {}).get("updated")
    out["default"] = {
        "kind": "mep",
        "path": f"p/{mep['id']}",
        "filename": f"ep-watch-{mep['id']}",
        "subtitle": f"Poslanec · {name}",
        "cite": cite("účast na hlasování", t["attendance"]),
        "text": f"{name}: {by_gender(mep, 'hlasoval', 'hlasovala')} v {fmt_pct(pct(t['attendance']))} jmenovitých hlasování "
        f"(medián EP {fmt_pct(ep['attendance']) if ep.get('attendance') is not None else '–'}). Zdroj: HowTheyVote.eu, EP Watch CZ",
        "data": {
            "name": name,
            "avatar": "photo",
            "female": True if mep.get("gender") == "FEMALE" else False if mep.get("gender") == "MALE" else None,
            "photoUrl": photo_url(mep) or None,
            "dataDay": day,
            "workDay": work_day if work_day and len(work_day) == 10 else None,
            "chips": [
                c
                for c in (
                    group_label and {"label": group_label, "color": group_color(ctx["group"])},
                    party_label and {"label": party_label, "color": group_color(ctx["party"])},
                )
                if c
            ],
            "mandate": f"v mandátu od {since}" if ctx["active"] else f"mandát {mandate_text(mep)}",
            "attendance": t["attendance"],
            "attendanceMedian": ep.get("attendance"),
            "loyalty": None if is_ni else t["group_loyalty"],
            "loyaltyMedian": None if is_ni else grp.get("group_loyalty"),
            "positions": t["positions"],
            "outcome": t["outcome"],
            "groupOutcome": t["group_outcome"],
            "attendanceMain": t["attendance_main"],
            "attendanceMainMedian": ep.get("attendance_main"),
            "pairwiseTop": top,
            "ownWork": {
                "leadReports": ro["lead_reports"],
                "leadAdopted": pas.get("lead_adopted"),
                "leadOpinions": ro["lead_opinions"],
                "shadowReports": ro["shadow_reports"],
            }
            if ro
            else None,
            "speeches": act["speeches"] if act else None,
            "speechesMinutes": act["speeches_minutes"] if act else None,
            "questions": ows["question"]["count"] if ows.get("question") else None,
            "questionsAnswered": ows["question"]["answered"] if ows.get("question") else None,
            "presence": {"present": pres["present"], "days": pres["days"]} if pres and pres.get("days") else None,
            "committees": {
                "members": [
                    {"code": c["code"], "name": c.get("name_cs") or c.get("name_en") or ""}
                    for c in c_now
                    if c["role"] != "MEMBER_SUBSTITUTE"
                ],
                "substitutes": [c["code"] for c in c_now if c["role"] == "MEMBER_SUBSTITUTE"],
            },
        },
    }
    return out


def profile_body(prof: dict, groups: list[dict], parties: list[dict], today: str, share_button: str) -> tuple[str, dict]:
    """Obsah <main> profilu a kontext sdílení."""
    ui = Ui(f"p{prof['mep']['id']}")
    mep, t = prof["mep"], prof["total"]
    b = prof.get("benchmarks")
    name = display_name(mep)
    active = is_active(mep, today)
    g, p = current_of(mep["groups"], today), current_of(mep["parties"], today)
    g_obj = find_group(groups, ep_code=g["code"]) if g else None
    p_obj = find_party(parties, p["org_id"]) if p else None
    party_label = (
        (by_gender(mep, "nezávislý", "nezávislá") if p["short_label"] == "Ind." or (p_obj or {}).get("independent") else p["short_label"])
        if p
        else ""
    )
    group_label = (CZ_GROUP_LABEL.get((g_obj or {}).get("code")) or (g_obj or {}).get("short_label") or g["short_label"]) if g else ""
    is_ni = (((g_obj or {}).get("code")) or (g or {}).get("code")) == "NI"
    htv = f"https://howtheyvote.eu/members/{mep['id']}"
    ext_links = (
        f'<a href="{esc(mep.get("profile_url"))}">Profil na webu EP</a> ·\n      <a href="{htv}">Hlasování na HowTheyVote.eu</a> · '
        f'<a href="{esc(mep.get("source_url"))}">Data z EP API</a>'
    )
    prev_groups = ", ".join(
        f"do {fmt_date(x['end'])} {CZ_GROUP_LABEL.get((go or {}).get('code')) or (go or {}).get('short_label') or x['short_label']}"
        for x in mep["groups"]
        if x is not g and x.get("end")
        for go in [next((y for y in groups if y.get("ep_code") == x["code"] or y["code"] == x["code"]), None)]
    )
    ow = prof.get("own_work")
    has_own = bool(ow and ow.get("items"))
    here = mep_url(mep["id"])
    since = fmt_date(mep["mandates"][0]["start"])
    defs = prof.get("definitions") or {}

    def defn(k):
        return first_sentence(defs.get(k))

    def cite(what, pair):
        if not pair or not pair[1]:
            return ""
        return (
            f"{name}: {what} {fmt_pct(pct(pair))} ({fmt_num(pair[0])} z {fmt_num(pair[1])} jmenovitých hlasování v Evropském parlamentu "
            f"v době mandátu, od {since}). Zdroj: HowTheyVote.eu, výpočet EP Watch CZ."
        )

    def metric_card(
        label,
        pair,
        detail,
        source_href,
        median=None,
        ref_label="",
        cite_text="",
        share=None,
        def_text=None,
        extra="",
        na_text="nepočítá se",
    ):
        if median is not None and pct(pair) is not None:
            head = bench_row(label, pair, median, ref_label or "", na_text)
        else:
            head = f'<div class="label">{label}</div><div class="value">{count_pct(pct(pair))}</div>' + (
                f'<div class="detail">{esc(na_text)}</div>' if pct(pair) is None else ""
            )
        counts = f"{fmt_num(pair[0])} z {fmt_num(pair[1])} hlasování" if pair and pair[1] else ""
        acts = (
            ui.metric_actions(f"<p><strong>{label}</strong>: {esc(def_text or detail)}</p>", share, cite_text)
            if cite_text and pair and pair[1]
            else ""
        )
        return (
            f'<div class="card metric">{head}<div class="detail">{counts}{f" · {extra}" if extra else ""}</div>'
            f'<div class="detail">{detail} · <a href="{source_href}">zdroj a metodika</a></div>{acts}</div>'
        )

    ep, grp = (b or {}).get("ep") or {}, (b or {}).get("group") or {}
    committees_now = [c for c in mep["committees"] if not c.get("end") or c["end"] >= today]
    committees_past = [c for c in mep["committees"] if c not in committees_now]

    def committee_li(c):
        return (
            f"<li><strong>{esc(c['code'])}</strong> – {esc(c.get('name_cs') or c.get('name_en') or '')}"
            f'<div class="small muted">{ROLE_LABEL.get(c["role"]) or esc(c["role"])} · {COMMITTEE_TYPE.get(c.get("type")) or esc(c.get("type"))} · {period_text(c)}</div></li>'
        )

    def pair_li(x):
        v = [x["same"], x["total"]]
        return (
            '<li style="display:flex;justify-content:space-between;gap:1rem;align-items:center">'
            f'<span><a href="{mep_url(x["id"])}">{esc(display_name(x))}</a> {group_badge(None, groups, (x.get("group") or {}).get("code"))}</span>'
            f'<span class="num">{fmt_pct(pct(v))} <span class="small muted">({fmt_num(v[0])} z {fmt_num(v[1])})</span></span></li>'
        )

    pairs = [x for x in prof["pairwise"] if x["total"] >= 50]
    initials = "".join(x[0] for x in (mep.get("given_name"), mep.get("family_name")) if x)
    portrait = (
        f'<img src="{photo_url(mep)}" alt="Portrét: {esc(name)}">'
        if mep.get("photo_url")
        else f'<span class="avatar-initials" style="width:160px;height:200px;border-radius:var(--radius);font-size:3rem" aria-hidden="true">{esc(initials)}</span>'
    )
    gl = logo_tile(g_obj, 32)
    pl = logo_tile(p_obj, 32) if p else ""
    party_html = (
        party_link(p["org_id"], p["short_label"], parties, mep)
        if p
        else f'<span class="badge outline" title="{esc(NO_PARTY_NOTE)}">strana neuvedena</span>'
    )
    status_badge = (
        '<span class="badge outline">v mandátu</span>'
        if active
        else f'<span class="badge outline">{by_gender(mep, "bývalý poslanec", "bývalá poslankyně")}</span>'
    )
    pos = t["positions"]
    release = ((prof.get("sources") or {}).get("votes") or {}).get("release")
    bench_note = ""
    if b:
        window = b.get("window")
        win = (
            f" Mediány u {by_gender(mep, 'tohoto poslance', 'této poslankyně')} jsou počítané jen z {fmt_num(window['votes'])} hlasování "
            f"v době mandátu ({fmt_date(window['from'])} – {fmt_date(window['to']) if window.get('to') else 'dosud'})."
            if window
            else ""
        )
        bench_note = f'<div id="srovnani">{ui.note_line("Medián EP je prostřední hodnota všech poslanců.", f"Srovnání s celým EP: {esc(b.get('definition') or '')}{win}")}</div>'
    ag = prof["against_group"]
    a_suffix = by_gender(mep, "", "a")

    def against_table(only_main: bool) -> str:
        rows = ag["recent_main"] if only_main else ag["recent"]
        empty = empty_state(
            f"{by_gender(mep, 'Nehlasoval', 'Nehlasovala')} proti většině své frakce{' v žádném závěrečném hlasování' if only_main else ''}.",
            "Zkuste zrušit filtr „jen závěrečná“." if only_main else "",
        )

        def cell(v):
            party = (
                f"většina strany: {POSITION_LABEL[v['party_majority']]}{' (stejně)' if v['party_majority'] == v['position'] else ''}"
                if v.get("party_majority")
                else "strana: bez většiny"
            )
            return (
                f'<td class="extra"><span class="pos pos-{v["position"]}">{position_for(v["position"], mep)}</span>'
                f'<div class="small muted">většina {esc(v["group_code"])}: {POSITION_LABEL[v["group_majority"]]}</div></td>'
                f'<td class="extra small muted">{party}</td>'
            )

        return (
            f'<div class="against-list" data-main="{"1" if only_main else "0"}"{" hidden" if only_main else ""}>'
            + vote_table(rows, "<th>Volba / frakce</th><th>Strana</th>", cell, empty)
            + f'<p class="small muted">Posledních {fmt_num(len(rows))} z {fmt_num(ag["count_main"] if only_main else ag["count"])}.</p></div>'
        )

    against_html = (
        '<div class="controls"><label><input type="checkbox" id="against-main"> jen závěrečná hlasování</label></div>'
        f'<div id="against">{against_table(False)}{against_table(True)}</div>'
        if ag["count"]
        else ""
    )
    party_known = (
        f"Z těchto {fmt_num(ag['party_known'])} hlasování, kde měla česká strana jasnou většinu,\n"
        f"            {by_gender(mep, 'hlasoval', 'hlasovala')} {fmt_num(ag['with_party'])}× stejně jako ostatní poslanci {by_gender(mep, 'jeho', 'její')} strany."
        if ag.get("party_known")
        else ""
    )

    def membership_group(x):
        go = next((y for y in groups if y.get("ep_code") == x["code"] or y["code"] == x["code"]), None)
        role = f" · <strong>{ROLE_LABEL.get(x['role']) or esc(x['role'])}</strong>" if x.get("role") and x["role"] != "MEMBER" else ""
        sub = f"{esc(CZ_GROUP_LABEL.get(go['code']) or go['short_label'] if go else x['short_label'])}{role} · {period_text(x)}"
        return f"<li>{entity_cell(go or {'code': x['code']}, x.get('name_cs') or x.get('name_en') or x['short_label'], sub=sub, size=24, slot='sm')}</li>"

    def membership_party(x):
        po = find_party(parties, x.get("org_id"))
        if po and po.get("independent"):
            return f'<li>{party_badge(x.get("org_id"), x["short_label"], parties, mep)}<div class="small muted">{period_text(x)}</div></li>'
        return f"<li>{entity_cell(po or {}, x.get('name') or x['short_label'], href=party_url(po['id']) if po else '', sub=f'{esc(x["short_label"])} · {period_text(x)}', size=24, slot='sm')}</li>"

    recent = prof["recent_main_votes"]
    recent_html = (
        '<div class="table-wrap"><table class="stack"><thead><tr><th>Datum</th><th>Hlasování</th><th>Volba</th><th>Výsledek</th></tr></thead><tbody>'
        + "".join(
            f'<tr><td class="num date">{fmt_date(v["date"])}</td>'
            f'<td class="title"><a class="vote-title" href="{vote_url(v)}">{esc(vote_title(v))}</a>'
            f'<div class="small muted">{kind_tag(v)}{esc(vote_subtitle(v))}</div></td>'
            f'<td class="extra pos pos-{v["position"]}">{position_for(v["position"], mep)}</td>'
            f'<td class="result result-{v.get("result") or ""}" title="{esc(RESULT_NOTE.get(v.get("result"), ""))}">{result_html(v)}</td></tr>'
            for v in recent
        )
        + "</tbody></table></div>"
        f'<p class="source">Zdroj: <a href="https://howtheyvote.eu/members/{mep["id"]}">HowTheyVote.eu</a>.\n'
        '      Všechna hlasování najdeš v <a href="votes">seznamu hlasování</a>.</p>'
        if recent
        else empty_state("Žádná hlasování v tomto výběru.", "", [(f"votes?mep={mep['id']}", "Všechna hlasování poslance")])
    )
    topics_rows = "".join(
        f'<tr><td class="title"><a href="votes?t={esc(x["code"])}&amp;f=final">{esc(x.get("label_cs") or x.get("label") or f"téma {x['code']} (zdroj neuvádí název)")}</a> '
        f'<span class="small muted">{esc(x["code"])}</span></td>'
        f'<td class="num" data-label="Hlasování">{fmt_num(x["attendance"][1])}</td>'
        f'<td class="num" data-label="Účast">{pct_cell(x["attendance"])}</td>'
        f'<td class="num extra">{split_bar([x["positions"][k] for k in ("FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE")])}'
        f'<div class="small">{fmt_num(x["positions"]["FOR"])} pro · {fmt_num(x["positions"]["AGAINST"])} proti · '
        f"{fmt_num(x['positions']['ABSTENTION'])} zdržel{a_suffix} se</div></td>"
        f'<td class="num" data-label="S frakcí">{pct_cell(x["group_loyalty"])}</td></tr>'
        for x in prof["topics"]
    )
    topic_options = "".join(
        f'<option value="{esc(x["code"])}">{esc(x.get("label_cs") or x.get("label") or x["code"])}</option>' for x in prof["topics"]
    )
    own_section = (
        '<h2 id="vlastni-prace">Práce na textech</h2>'
        + ui.note_line(
            f"Zprávy, stanoviska, usnesení a otázky, na kterých se {by_gender(mep, 'podílel', 'podílela')}. Počty, ne kvalita.",
            "Hlasování je jen část práce poslance. Kromě něj poslanci vedou zprávy a stanoviska výborů, vyjednávají je za frakci, kladou "
            "otázky Komisi a vystupují v rozpravách. Čísla ukazují, kolik takové práce kdo má přidělené, ne jak kvalitní je. U zpráv a "
            "usnesení je uveden výsledek závěrečného jmenovitého hlasování v plénu (nebo přijatého návrhu na zamítnutí), vždy po typech zvlášť.",
        )
        + own_work(ui, ow, mep)
        if has_own
        else ""
    )

    body = f"""<div class="back-row"><p class="small"><a href="poslanci">← Všichni poslanci</a></p>{share_button}</div>
<div class="profile-head">
  <figure class="portrait">{portrait}{f"<figcaption>{esc(mep['photo_credit'])}</figcaption>" if mep.get("photo_credit") else ""}</figure>
  <div>
    <h1>{esc(name)}</h1>
    {f'<div class="logo-row">{gl}{pl}</div>' if gl or pl else ""}
    <div class="facts">
      {group_badge(None, groups, g["code"] if g else None)}{f'<span class="small muted">({esc(prev_groups)})</span>' if prev_groups else ""}
      {party_html}
      {status_badge}
    </div>
    <p class="muted">Mandát: {mandate_text(mep)}</p>
    {f'<p class="small muted">Podoba jména: {esc(mep["name_note"])}</p>' if mep.get("name_note") else ""}
    {
        f'<p class="small note">{esc(SHORT_MANDATE_NOTE)} Mandát trval {fmt_num(prof["mandate_days"])} dní.</p>'
        if prof.get("short_mandate")
        else ""
    }
    <p class="small profile-links head-only">{ext_links}</p>
  </div>
</div>

<p class="lead" style="margin-top:1.5rem">{summary_sentence(mep, t, prof)}</p>
<nav class="subnav profile-nav" aria-label="Části profilu">
  <a href="{here}#dochazka">Účast na hlasování</a>{f'<a href="{here}#vlastni-prace">Práce na textech</a>' if has_own else ""}
  <a href="{here}#frakce">Frakce a strana</a><a href="{here}#temata">Témata</a>
  <a href="{here}#s-kym">S kým hlasuje</a><a href="{here}#posledni">Poslední hlasování</a>
</nav>

<h2 id="dochazka">Hlasování v číslech</h2>
<div class="metrics">
  {
        metric_card(
            "Účast na hlasování",
            t["attendance"],
            "všechna jmenovitá hlasování v době mandátu",
            "o-projektu#metodika",
            ep.get("attendance"),
            "medián EP",
            cite("účast na hlasování", t["attendance"]),
            "metric:attendance",
            defn("attendance"),
            f"medián frakce {fmt_pct(grp['attendance'])}" if grp.get("attendance") is not None else "",
        )
    }
  {
        metric_card(
            "Účast na hlasování – závěrečná",
            t["attendance_main"],
            "o celém textu, o prozatímní dohodě s Radou nebo o námitce proti aktu Komise",
            "o-projektu#metodika",
            ep.get("attendance_main"),
            "medián EP",
            cite("účast na hlasování u závěrečných hlasování", t["attendance_main"]),
            "metric:attendance_main",
            defn("attendance_main"),
            f"medián frakce {fmt_pct(grp['attendance_main'])}" if grp.get("attendance_main") is not None else "",
        )
    }
  {presence_card(prof.get("presence"), mep)}
  {
        metric_card(
            "Hlasuje s frakcí",
            t["group_loyalty"],
            "jen informativní",
            "o-projektu#metodika",
            None if is_ni else grp.get("group_loyalty"),
            "medián frakce",
            cite("hlasuje s frakcí", t["group_loyalty"]),
            "metric:group_loyalty",
            defn("group_loyalty"),
            na_text="nezařazení nemají frakci, nepočítá se" if is_ni else "nepočítá se",
        )
    }
  {
        metric_card(
            "Shoda s ostatními Čechy",
            t["cz_agreement"],
            "jen informativní",
            "o-projektu#metodika",
            None,
            "",
            cite("shoda s ostatními českými poslanci", t["cz_agreement"]),
            "metric:cz_agreement",
            defn("cz_agreement"),
        )
    }
</div>
<div class="source">{by_gender(mep, "Hlasoval", "Hlasovala")} pro {fmt_num(pos["FOR"])}×, proti {fmt_num(pos["AGAINST"])}×,
  {position_for("ABSTENTION", mep)} {fmt_num(pos["ABSTENTION"])}×, {position_for("DID_NOT_VOTE", mep)} {fmt_num(pos["DID_NOT_VOTE"])}×.{
        ui.info_button(f"<p>{ui.source_line(release)}</p>", "Zdroj")
    }</div>

{bench_note}

{own_section}
{activity_block(ui, prof.get("activity"))}

<h2 id="soulad">Soulad s výsledkem hlasování</h2>
{
        ui.note_line(
            f"Jak často hlasoval{a_suffix} tak, jak hlasování nakonec dopadlo.",
            "Číslo hlavně odráží velikost a pozici frakce; hlasovat proti většině je legitimní opoziční role. Proto ho vždy srovnáváme s průměrem frakce.",
        )
    }
<div class="metrics">
  {outcome_card("Všechna hlasování", t["outcome"], t["group_outcome"], "jen informativní", mep)}
  {outcome_card("Závěrečná hlasování", t["outcome_main"], t["group_outcome_main"], "jen informativní", mep)}
  {metric_card("Těsná hlasování", t["outcome_close"], "rozdíl pro − proti nejvýš 21 hlasů", "o-projektu#metodika")}
</div>

<h2 id="frakce">Frakce a strana</h2>
<div class="card">{timeline(mep, groups, parties, today)}
  <p class="source">Příslušnost podle EP Open Data, k datu. Zdroj: <a href="{esc(mep.get("source_url"))}">EP Open Data</a>.</p></div>

<h2 id="mesice">Účast na hlasování po měsících</h2>
<div class="card">{monthly_chart(prof["monthly"], mep)}
  {
        ui.note_line(
            "Sloupec = podíl hlasování v měsíci. Klepnutím ukážete přesné číslo.",
            f"Sloupec = podíl hlasování v měsíci, ve kterých {by_gender(mep, 'hlasoval', 'hlasovala')}; pod sloupcem číslo měsíce a rok. "
            f"Nízká čárka = v měsíci {by_gender(mep, 'nehlasoval', 'nehlasovala')} ani jednou. Měsíce bez zasedání (srpen) chybí.",
        )
    }</div>

<div class="grid-2">
  <section>
    <h2>Členství podrobně</h2>
    <div class="card"><ul class="plain">
      {"".join(membership_group(x) for x in mep["groups"])}
      {"".join(membership_party(x) for x in mep["parties"]) or f'<li class="muted">{esc(NO_PARTY_NOTE)}</li>'}
    </ul>
    <p class="source">Zdroj: <a href="{esc(mep.get("source_url"))}">EP Open Data</a></p></div>
  </section>
  <section>
    <h2>Výbory</h2>
    <div class="card">
      <ul class="plain">{"".join(committee_li(c) for c in committees_now) or '<li class="muted">Žádný aktuální výbor.</li>'}</ul>
      {f'<h3>Dříve</h3><ul class="plain">{"".join(committee_li(c) for c in committees_past)}</ul>' if committees_past else ""}
      <p class="source">Zdroj: <a href="{esc(mep.get("source_url"))}">EP Open Data</a></p>
    </div>
  </section>
</div>

<h2 id="proti-frakci">Kde hlasoval{a_suffix} jinak než frakce</h2>
<div class="card">
  <p>{by_gender(mep, "Hlasoval", "Hlasovala")} jinak než většina své frakce {fmt_num(ag["count"])}× ze
    {fmt_num(t["group_loyalty"][1])} hlasování, ve kterých se to počítá (z toho v závěrečných hlasováních {fmt_num(ag["count_main"])}×).
    {party_known}
    {"" if t["group_loyalty"][1] else "U nezařazených poslanců se nepočítá."}</p>
  {against_html}
</div>

<h2 id="rozhodly">Kde rozhodly české hlasy</h2>
<div class="card">
  {
        ui.note_line(
            'Těsná hlasování, která by bez českých hlasů dopadla opačně (<a href="rozhodujici">všechna</a>).',
            f"Většinou pozměňovací návrhy a dílčí hlasování. Ukazuje se, jak {by_gender(mep, 'hlasoval', 'hlasovala')} v těch, která proběhla "
            f"v době {by_gender(mep, 'jeho', 'jejího')} mandátu.",
        )
    }
  {
        vote_table(
            prof["decisive"],
            "<th>Volba</th><th>Na straně výsledku</th>",
            lambda v: f'<td class="extra pos pos-{v["position"]}">{position_for(v["position"], mep)}</td>{side_cell(v)}',
            empty_state(
                "Žádné takové hlasování v době mandátu.",
                "České hlasy rozhodují jen výjimečně, u velmi těsných výsledků.",
                [("rozhodujici", "Všechna hlasování, kde rozhodli Češi")],
            ),
        )
    }
</div>

<h2 id="temata">Podle témat</h2>
<div class="card">
  {
        ui.note_line(
            "Deset témat s nejvíce hlasováními podle Legislativní observatoře EP.",
            "Názvy témat jsou ruční český překlad (OEIL je jen anglicky a francouzsky).",
        )
    }
  <div class="table-wrap"><table class="stack topics">
    <thead><tr><th>Téma</th><th class="num">Hlasování</th><th class="num">Účast na hlasování</th><th class="num">Pro / proti / zdržel{
        a_suffix
    } se</th><th class="num">Hlasuje s frakcí</th></tr></thead>
    <tbody>{topics_rows}</tbody>
  </table></div>
</div>

<h2 id="s-kym">S kým hlasuje stejně</h2>
<div class="card">
  {
        ui.note_line(
            f'Podíl hlasování, kde oba hlasovali stejně. <a href="shoda?id={mep["id"]}">Celá tabulka shody</a>.',
            "Jen dvojice s aspoň 50 společnými hlasováními.",
        )
    }
  {
        f'''<div class="grid-2">
    <div><h3>Nejčastěji stejně</h3><ul class="plain">{"".join(pair_li(x) for x in pairs[:5])}</ul></div>
    <div><h3>Nejméně často stejně</h3><ul class="plain">{"".join(pair_li(x) for x in reversed(pairs[-5:]))}</ul></div>
  </div>'''
        if pairs
        else '<p class="muted">Nedostatek společných hlasování.</p>'
    }
</div>

<h2 id="posledni">Poslední závěrečná hlasování</h2>
<div id="recent">{recent_html}</div>
<form class="card mep-search" action="votes" method="get" role="search" aria-label="Hledání v hlasováních poslance">
  <h3 style="margin-top:0">Jak {by_gender(mep, "hlasoval", "hlasovala")} o…?</h3>
  <input type="hidden" name="mep" value="{mep["id"]}">
  <div class="controls">
    <input type="search" name="q" placeholder="Hledat v názvech hlasování (např. klima, migrace)" aria-label="Hledat v hlasováních">
    <label>Téma <select name="t"><option value="">všechna témata</option>{topic_options}</select></label>
    <label>Typ <select name="f"><option value="final">jen závěrečná</option><option value="main">všechna hlavní</option><option value="all">všechna hlasování</option></select></label>
    <button type="submit" class="more-btn">Hledat</button>
  </div>
  <p class="small muted">Výsledek ukáže přímo {
        by_gender(mep, "jeho", "její")
    } hlas u každého hlasování v době mandátu, s odkazem na detail.</p>
</form>
<p class="small profile-links foot-only">{ext_links}</p>"""
    ctx = {
        "name": name,
        "group_label": group_label,
        "party_label": party_label,
        "is_ni": is_ni,
        "group": g_obj,
        "party": p_obj,
        "active": active,
    }
    return body, share_context(prof, groups, parties, ctx, today)


def share_json(ctx: dict) -> str:
    return json.dumps(ctx, ensure_ascii=False).replace("</", "<\\/")
