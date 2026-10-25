"""Stránky „Příběh zákona“ (N3): public/z/{rok}-{číslo}-{typ}.html pro každou proceduru.

Procedura = legislativní nebo jiný postup EP (např. 2023/0447(COD)). Stránka ukazuje:
- průběh z událostí procedury v EP Open Data (stejné kroky jako radar „Co se chystá“, scripts/radar.py),
- všechna jmenovitá hlasování k proceduře z HowTheyVote a jak v nich hlasovali Češi,
- českou stopu (zpravodaj, stínoví zpravodajové) z EP Open Data.

Stránka vzniká pro procedury, o kterých se hlasovalo (data/votes), a pro procedury s českou účastí (data/proposals.json).
Co zdroj nemá, se neuvádí: bez načtených událostí stránka řekne, že průběh zatím nemá, a odkáže na Legislativní observatoř.
Volá se z build_pages.py.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from build_pages import HTV, RESULT_LABEL, ROOT, back_row, display_name, esc, fmt_date, fmt_num, kind_of, og_meta, split_bar
from build_web import vote_title
from compute_stats import active_positions
from layout import json_script, page
from radar import COMMITTEES, CZ_ROLE_CS, CZ_ROLES, EVENT_CS, OEIL_URL, ROLE_ORDER, timeline
from vote_kinds import KIND_LABELS, is_final
from vote_parties import POSITIONS

# Druh procedury podle zkratky v čísle (2023/0447(COD) -> COD). Neznámá zkratka se nepřekládá.
PROCESS_TYPE_CS = {
    "COD": "řádný legislativní postup (zákon)",
    "CNS": "legislativní postup – konzultace",
    "APP": "legislativní postup – souhlas",
    "NLE": "nelegislativní akt",
    "INI": "zpráva z vlastního podnětu",
    "RSP": "usnesení k tématu",
    "DEC": "udělení absolutoria",
    "BUD": "rozpočtový postup",
    "BUI": "rozpočtový postup",
    "DEA": "akt v přenesené pravomoci",
    "RPS": "prováděcí opatření",
    "INL": "legislativní podnět Parlamentu",
    "IMM": "imunita poslance",
    "REG": "jednací řád",
    "ACI": "interinstitucionální dohoda",
    "RSO": "vnitřní organizace Parlamentu",
    "INS": "institucionální postup",
}
# Co text znamená (3. obrázek karty hlasování, blok „CO TO ZNAMENÁ“): jedna věta na typ procedury, ručně psané a schválené
# autorem 25. 10. 2026 (hromadné zadání 24. 10. 2026, úkol 1). Bez odhadů průběhu, jen co typ postupu znamená.
PROCESS_EFFECT_CS = {
    "COD": "Zákon EU: platí, až když ho schválí Parlament i Rada.",
    "CNS": "O zákonu rozhoduje Rada, Parlament dává jen stanovisko.",
    "APP": "Parlament návrh schválí, nebo zamítne; měnit ho nemůže. Bez jeho souhlasu akt neplatí.",
    "NLE": "Stanovisko nebo souhlas Parlamentu k aktu, který přijímá Rada.",
    "INI": "Nezávazný postoj Parlamentu, nemění zákony.",
    "RSP": "Nezávazný postoj Parlamentu, nemění zákony.",
    "DEC": "Parlament rozhoduje, zda schválí, jak instituce EU hospodařila s rozpočtem.",
    "BUD": "Rozpočet EU platí, když ho schválí Parlament i Rada.",
    "BUI": "Rozpočet EU platí, když ho schválí Parlament i Rada.",
    "DEA": "Akt Komise; když proti němu Parlament vznese námitku, nevstoupí v platnost.",
    "RPS": "Opatření Komise; Parlament ho může námitkou zablokovat.",
    "INL": "Parlament žádá Komisi o návrh zákona; Komise ho podat nemusí, ale musí odpovědět.",
    "IMM": "Rozhodnutí o imunitě jednoho poslance; nemění zákony.",
    "REG": "Změna pravidel jednání Parlamentu; platí jen pro Parlament.",
    "ACI": "Dohoda institucí EU o tom, jak spolupracují.",
    "RSO": "Vnitřní organizace Parlamentu (výbory, delegace); nemění zákony.",
    "INS": "Institucionální otázka EU podle smluv (např. volební pravidla nebo změna smluv).",
}
# Typy s časovou osou na kartě; ostatní (jednokrokové nebo nezávazné) mají blok „CO TO ZNAMENÁ“ (rozhodnutí 25. 10. 2026: i INI).
TIMELINE_TYPES = {"COD", "CNS", "APP", "NLE", "BUD", "BUI", "DEC", "INL"}
CARD_STEPS = 6


def card_steps(steps: list[dict], limit: int = CARD_STEPS) -> list[dict]:
    """Kroky časové osy pro kartu: hotové s datem, poslední hotový = „teď“, budoucí bez data. Delší osa: první, „…“, posledních limit−2."""
    done = [x for x in steps if x.get("date")]
    out = [
        {
            "label": x["label"],
            "date": fmt_date(x.get("date_to") or x["date"]) if x.get("date") else None,
            "state": ("now" if x is done[-1] else "done") if x.get("date") else "next",
        }
        for x in steps
    ]
    if len(out) > limit:
        out = [out[0], {"label": "…", "date": None, "state": "gap"}, *out[-(limit - 2) :]]
    return out


def next_text(steps: list[dict]) -> str | None:
    """„Co bude dál“ z kroků, které procedura ještě čeká (FUTURE_STEPS v radar.py); bez vlastních odhadů."""
    rest = [x["label"] for x in steps if not x.get("date")]
    if not rest:
        return None
    return "Co bude dál: " + ", pak ".join([rest[0], *(r[0].lower() + r[1:] for r in rest[1:])]) + "."


LABEL_RE = re.compile(r"^(\d{4})/(\d{4})\(([A-Z]{3})\)$")
EP_API_PROC = "https://data.europarl.europa.eu/api/v2/procedures/{pid}?format=application%2Fld%2Bjson&language=cs"


def slug(label: str | None) -> str | None:
    """2023/0447(COD) -> 2023-0447-COD (adresa stránky z/); jiný tvar čísla stránku nemá."""
    m = LABEL_RE.match(label) if isinstance(label, str) else None
    return f"{m[1]}-{m[2]}-{m[3]}" if m else None


def proc_id(label: str) -> str:
    """2023/0447(COD) -> 2023-0447 (identifikátor procedury v EP Open Data)."""
    m = LABEL_RE.match(label)
    return f"{m[1]}-{m[2]}"


def procedure_url(label: str | None, root: str = "") -> str | None:
    s = slug(label)
    return f"{root}z/{s}" if s else None


def _read(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def collect(data_dir: Path, votes: list[dict]) -> dict[str, dict]:
    """{číslo procedury: {label, title_cs, title_en, events, committee, participants, fetched, votes}} ze všech zdrojů."""
    items = {
        i["label"]: i
        for i in _read(data_dir / "proposals.json", {}).get("items", [])
        if i.get("kind") == "procedure" and slug(i.get("label"))
    }
    state = _read(data_dir / "proposals_state.json", {}).get("procedures") or {}
    # API občas vrací u procedury víc čísel (změna typu, např. CNS -> NLE): stav platí pro každé z nich.
    by_label = {
        lb: meta
        for meta in state.values()
        for lb in (meta.get("label") if isinstance(meta.get("label"), list) else [meta.get("label")])
        if slug(lb)
    }
    out: dict[str, dict] = {}
    for v in votes:
        ref = (v.get("procedure") or {}).get("reference")
        if slug(ref):
            out.setdefault(ref, {"votes": [], "title_en": (v.get("procedure") or {}).get("title")})["votes"].append(v)
    for label in items:
        out.setdefault(label, {"votes": [], "title_en": None})
    # Procedury z programu nejbližšího zasedání (radar.json): stránka i bez hlasování a událostí, aby název bodu programu
    # vedl na Příběh zákona stejně jako jinde na webu.
    agenda = {}
    for it in ((_read(data_dir / "radar.json", {}) or {}).get("session") or {}).get("items", []):
        lb = (it.get("procedure") or {}).get("label")
        if slug(lb):
            agenda.setdefault(lb, it)
            out.setdefault(lb, {"votes": [], "title_en": None})
    for label, row in out.items():
        it, st = items.get(label), by_label.get(label) or {}
        row["label"] = label
        row["title_cs"] = (
            ((it or {}).get("title") or {}).get("cs")
            or st.get("title_cs")
            or next((v["title_cs"] for v in row["votes"] if v.get("title_cs")), None)
            or (agenda.get(label) or {}).get("title_cs")
        )
        row["title_en"] = ((it or {}).get("title") or {}).get("en") or row["title_en"] or (agenda.get(label) or {}).get("title_en")
        row["on_agenda"] = (agenda.get(label) or {}).get("date")
        row["events"] = (it or {}).get("events") if it and "events" in it else st.get("events")
        row["committee"] = (
            (it or {}).get("committee") or st.get("committee") or ((agenda.get(label) or {}).get("committee") or {}).get("code")
        )
        row["participants"] = (it or {}).get("participants") or []
        row["fetched"] = bool(it) or bool(st)  # procedura byla v EP Open Data dohledána (role jsou známé)
        row["votes"].sort(key=lambda v: (v["date"], v.get("timestamp") or "", v["id"]))
    return out


def cz_trace(row: dict, vote_roles: dict, meps_by_id: dict) -> list[dict]:
    """Česká role v proceduře, každý poslanec jednou s nejvyšší rolí: z účastníků procedury, jinak z rolí u hlasování."""
    best: dict[int, str] = {}

    def add(mep_id: int, role: str | None):
        if role and (mep_id not in best or ROLE_ORDER.index(role) < ROLE_ORDER.index(best[mep_id])):
            best[mep_id] = role

    for p in row["participants"]:
        add(p["mep_id"], CZ_ROLES.get(p.get("role")))
    for v in row["votes"]:
        for r in vote_roles.get(str(v["id"]), []):
            add(r["mep_id"], r["role"] if r["role"] in ROLE_ORDER else None)
    rows = [{"mep_id": m, "role": r} for m, r in best.items() if m in meps_by_id]
    return sorted(rows, key=lambda r: (ROLE_ORDER.index(r["role"]), meps_by_id[r["mep_id"]].get("sort_label") or ""))


def steps_html(tl: dict) -> str:
    """Časová osa procedury jako na radaru (hub.radar_steps)."""
    from hub import radar_steps  # hub.py importuje build_pages, proto až tady

    return radar_steps(tl["steps"], tl["reached"])


def events_html(events: list[dict]) -> str:
    rows = []
    for e in sorted(events, key=lambda e: e["date"]):
        label = EVENT_CS.get(e["type"])
        txt = esc(label) if label else f'<span class="muted">jiný krok ({esc(e["type"])})</span>'
        rows.append(f'<li><span class="ev-date">{fmt_date(e["date"])}</span> {txt}</li>')
    return f'<ol class="plain ev-list">{"".join(rows)}</ol>'


def vote_row(v: dict, meps_by_id: dict, final_pages: set[int]) -> str:
    kind, _ = kind_of(v)
    cz = active_positions(v, meps_by_id)
    n = [sum(p["position"] == k for p in cz) for k in POSITIONS]
    href = f"{ROOT}v/{v['id']}" if v["id"] in final_pages else f"{ROOT}vote?id={v['id']}&amp;m={v['date'][:7]}"
    res = v.get("result")
    # Název procedury je v nadpisu stránky, v řádku stačí, o čem se hlasovalo (popis z HowTheyVote).
    what = v.get("description_cs") or v.get("description") or vote_title(v)
    sub = " · ".join(x for x in (KIND_LABELS.get(kind, kind), v.get("reference")) if x)
    return (
        f'<tr><td class="num date">{fmt_date(v["date"])}</td>'
        f'<td class="title"><a class="vote-title" href="{href}">{esc(what)}</a>'
        + (f'<div class="small muted">{esc(sub)}</div>' if sub else "")
        + f'</td><td class="result result-{res or ""}">{esc(RESULT_LABEL.get(res, "neuveden"))}</td>'
        f'<td class="extra cz">{split_bar(n)}<div class="small"><span class="who">Češi:</span> {n[0]} pro · {n[1]} proti · {n[2]} zdrž. · {n[3]} nehl.</div></td></tr>'
    )


def procedure_page(row: dict, meps_by_id: dict, vote_roles: dict, final_pages: set[int], base_url: str | None) -> tuple[str, str]:
    label = row["label"]
    ptype = LABEL_RE.match(label)[3]
    title = row["title_cs"] or row["title_en"] or label
    oeil = OEIL_URL.format(label=label)
    api = EP_API_PROC.format(pid=proc_id(label))
    comm = row.get("committee")
    comm_txt = f"výbor {comm}" + (f" ({COMMITTEES[comm][0]})" if comm in COMMITTEES else "") if comm else None
    meta = " · ".join(esc(x) for x in (label, PROCESS_TYPE_CS.get(ptype), comm_txt) if x)
    votes = row["votes"]
    finals = [v for v in votes if is_final(v)]

    if row.get("events"):
        tl = timeline(row["events"], ptype)
        story = (
            f"{steps_html(tl)}"
            + (
                f'<p class="small muted">Poslední krok: {esc(tl["last_event"]["label"])} ({fmt_date(tl["last_event"]["date"])}).</p>'
                if tl.get("last_event")
                else ""
            )
            + f'<details class="explain"><summary>Všechny kroky procedury ({fmt_num(len(row["events"]))})</summary>'
            f"{events_html(row['events'])}</details>"
            f'<p class="source">Průběh z událostí procedury v <a href="{esc(api)}">EP Open Data</a> (CC BY 4.0), '
            f'podrobnosti v <a href="{esc(oeil)}">Legislativní observatoři EP</a>.</p>'
        )
    else:
        days = sorted({v["date"] for v in votes})
        why = (
            "EP Open Data u této procedury zatím žádné kroky neeviduje."
            if row.get("events") == []
            else "Podrobný průběh procedury z EP Open Data zatím nemáme načtený, doplní se při denní aktualizaci."
        )
        story = f'<p class="muted">{why} Celý průběh je v <a href="{esc(oeil)}">Legislativní observatoři EP</a>.</p>' + (
            f"<p>Plénum o ní hlasovalo: {', '.join(fmt_date(d) for d in days)}.</p>" if days else ""
        )

    trace = cz_trace(row, vote_roles, meps_by_id)
    if trace:
        lis = "".join(
            f'<li><a href="{ROOT}p/{r["mep_id"]}">{esc(display_name(meps_by_id[r["mep_id"]]))}</a> '
            f'<span class="muted">– {esc(CZ_ROLE_CS[r["role"]])}</span></li>'
            for r in trace
        )
        trace_html = f'<ul class="plain">{lis}</ul><p class="source">Zdroj: <a href="{esc(api)}">EP Open Data</a> (CC BY 4.0).</p>'
    elif row["fetched"]:
        trace_html = (
            '<p class="muted">Žádný český poslanec nebyl u této procedury zpravodajem ani stínovým zpravodajem (podle EP Open Data).</p>'
        )
    else:
        trace_html = '<p class="muted">Role poslanců u této procedury zatím nemáme načtené z EP Open Data.</p>'

    def vote_table(rows: list[dict]) -> str:
        return (
            '<div class="table-wrap"><table class="stack"><thead><tr><th class="num">Datum</th><th>Hlasování</th>'
            "<th>Výsledek</th><th>Češi</th></tr></thead><tbody>"
            + "".join(vote_row(v, meps_by_id, final_pages) for v in rows)
            + "</tbody></table></div>"
        )

    main = [v for v in votes if is_final(v) or v.get("is_main")]
    other = [v for v in votes if v not in main]
    if votes:
        table = (
            (vote_table(main) if main else '<p class="muted">Hlavní hlasování (o celém textu nebo o mandátu) v datech není.</p>')
            + (
                f'<details class="explain wide"><summary>Pozměňovací návrhy a dílčí hlasování ({fmt_num(len(other))})</summary>'
                f"{vote_table(other)}</details>"
                if other
                else ""
            )
            + f'<p class="source">Jmenovitá hlasování v plénu od 16. 7. 2024. Češi = poslanci v mandátu k datu hlasování. '
            f'Zdroj: <a href="{HTV}">HowTheyVote.eu</a> (ODbL).</p>'
        )
    else:
        table = (
            '<p class="muted">O této proceduře zatím neproběhlo v 10. volebním období žádné jmenovité hlasování v plénu '
            "(podle HowTheyVote.eu).</p>"
        )

    last_final = finals[-1] if finals else None
    # Karta ke sdílení (share.js lawCardOps): název, kde procedura je, poslední závěrečné hlasování a hlasy Čechů.
    done_steps = [x for x in (timeline(row["events"], ptype)["steps"] if row.get("events") else []) if x.get("date")]
    now = done_steps[-1] if done_steps else None
    cz_final = [sum(p["position"] == k for p in active_positions(last_final, meps_by_id)) for k in POSITIONS] if last_final else None
    share_ctx = {
        "kind": "law",
        "path": f"z/{slug(label)}",
        "filename": f"ep-watch-zakon-{slug(label)}",
        "subtitle": f"Příběh zákona · {label}",
        "text": f"{title} ({label}): průběh v Evropském parlamentu a jak hlasovali Češi. Zdroj: EP Open Data, HowTheyVote.eu, EP Watch CZ",
        "data": {
            "title": title,
            "label": label,
            "kind": PROCESS_TYPE_CS.get(ptype),
            "now": f"{now['label']} ({fmt_date(now.get('date_to') or now['date'])})" if now else None,
            "agenda": fmt_date(row["on_agenda"]) if row.get("on_agenda") else None,
            "final": {
                "date": fmt_date(last_final["date"]),
                "result": RESULT_LABEL.get(last_final.get("result"), "výsledek neuveden").capitalize(),
                "cz": cz_final,
            }
            if last_final
            else None,
            "dataDay": max([v["date"] for v in votes] + [e["date"] for e in row.get("events") or []], default=None),
        },
    }
    summary = (
        f"Závěrečné hlasování {fmt_date(last_final['date'])}: {RESULT_LABEL.get(last_final.get('result'), 'výsledek neuveden')}."
        if last_final
        else "Závěrečné hlasování v datech zatím není."
    )
    body = f"""{back_row(f"{ROOT}votes", "← Všechna hlasování")}
<p class="muted vote-meta">{meta}</p>
<h1>{esc(title)}</h1>
<p class="lead">{esc(summary)} Jmenovitých hlasování: {fmt_num(len(votes))}.</p>
<p class="muted">Příběh zákona: jak procedura prošla Parlamentem, od přidělení výboru po hlasování v plénu.</p>
{f'<p class="rd-next"><strong>Na programu pléna {fmt_date(row["on_agenda"])}</strong> · <a href="{ROOT}zasedani">Zasedání</a></p>' if row.get("on_agenda") else ""}
<section aria-labelledby="z-prubeh"><h2 id="z-prubeh">Průběh</h2>{story}</section>
<section aria-labelledby="z-stopa"><h2 id="z-stopa">Česká stopa</h2>{trace_html}</section>
<section aria-labelledby="z-hlas"><h2 id="z-hlas">Hlasování v plénu</h2>{table}</section>
<details class="links-more"><summary>zdroje a odkazy</summary><p class="small"><a href="{esc(oeil)}">Legislativní observatoř EP ({esc(label)})</a> ·
<a href="{esc(api)}">EP Open Data API</a>{f" · anglický název: {esc(row['title_en'])}" if row.get("title_en") and row["title_cs"] else ""}</p></details>
<script type="application/json" id="share-context">{json_script(share_ctx)}</script>"""
    path = f"z/{slug(label)}.html"
    desc = f"{title} ({label}): průběh procedury v Evropském parlamentu, {len(votes)} jmenovitých hlasování a jak hlasovali čeští poslanci."
    return path, page(
        f"{title} – příběh zákona – EP Watch CZ",
        body,
        root=ROOT,
        current="votes",
        description=desc,
        meta=og_meta(f"{title} – příběh zákona", desc, path, base_url),
        scripts=f'<script type="module" src="{ROOT}app.js"></script>\n<script type="module" src="{ROOT}share.js"></script>\n',
    )


def procedure_pages(data_dir: Path, votes: list[dict], meps_by_id: dict, base_url: str | None) -> dict[str, str]:
    vr = _read(data_dir / "vote_roles.json", {}).get("votes", {})
    final_pages = {v["id"] for v in votes if is_final(v)}
    return dict(procedure_page(row, meps_by_id, vr, final_pages, base_url) for row in collect(data_dir, votes).values())


def motion_signers(data_dir: Path) -> dict[str, list[dict]]:
    """{číslo procedury: [{name, group}]} čeští podepisující návrhů usnesení (proposals.json, jen česká účast).
    Přednost má společný návrh (o něm se v plénu hlasuje), jinak vlastní návrhy frakcí. Skupina = „jménem“ (in_name_of)."""
    meps = {m["id"]: m for m in (_read(data_dir / "meps.json", {}) or {}).get("meps", [])}
    glabel = {g.get("ep_code") or g["code"]: g["short_label"] for g in _read(data_dir / "groups.json", []) or []}
    glabel.update({g["code"]: g["short_label"] for g in _read(data_dir / "groups.json", []) or []})
    by_proc: dict[str, dict[str, list]] = {}
    for it in _read(data_dir / "proposals.json", {}).get("items", []):
        if it.get("kind") not in ("motion", "joint_motion") or not it.get("procedure"):
            continue
        by_proc.setdefault(it["procedure"], {"motion": [], "joint_motion": []})[it["kind"]].extend(it.get("participants") or [])
    out = {}
    for proc, kinds in by_proc.items():
        people = kinds["joint_motion"] or kinds["motion"]
        seen, rows = set(), []
        for p in people:
            m = meps.get(p.get("mep_id"))
            if not m or p["mep_id"] in seen:
                continue
            seen.add(p["mep_id"])
            rows.append(
                {
                    "name": display_name(m),
                    "sort": m.get("sort_label") or display_name(m),
                    "group": glabel.get(p.get("in_name_of"), p.get("in_name_of")),
                }
            )
        y, n = proc.split("-", 1) if "-" in proc else (None, None)
        if y and rows:
            out[f"{y}/{n}(RSP)"] = [{"name": r["name"], "group": r["group"]} for r in sorted(rows, key=lambda r: r["sort"])]
    return out


def procedure_briefs(data_dir: Path, votes: list[dict]) -> dict[str, dict]:
    """{číslo procedury: {label, kind, now, path}} pro 3. obrázek detailu karty hlasování: druh procedury a poslední krok
    z událostí EP (stejně jako karta Příběhu zákona). Bez událostí jen číslo, druh a odkaz."""
    out = {}
    signers = motion_signers(data_dir)
    for label, row in collect(data_dir, votes).items():
        m = LABEL_RE.match(label)
        if not m:
            continue
        ptype = m[3]
        done = [x for x in (timeline(row["events"], ptype)["steps"] if row.get("events") else []) if x.get("date")]
        now = done[-1] if done else None
        all_steps = timeline(row["events"], ptype)["steps"] if row.get("events") else []
        timeline_mode = ptype in TIMELINE_TYPES
        out[label] = {
            "label": label,
            "type": ptype,
            "kind": PROCESS_TYPE_CS.get(ptype),
            "now": f"{now['label']} ({fmt_date(now.get('date_to') or now['date'])})" if now else None,
            "path": f"z/{slug(label)}",
            "mode": "timeline" if timeline_mode and done else "effect",
            "steps": card_steps(all_steps) if timeline_mode and done else [],
            "next": next_text(all_steps) if timeline_mode and done else None,
            "effect": PROCESS_EFFECT_CS.get(ptype),
            "signers": signers.get(label, []) if not timeline_mode else [],
        }
    return out
