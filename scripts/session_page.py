"""Stránka „Zasedání“ (zasedani.html): nejbližší (nebo právě skončené) plenární zasedání EP.

Nic se nestahuje ani neodhaduje, jen se spojují existující data:
- data/radar.json → session: program zasedání (body, dny, procedura, výbor, česká stopa; radar.py z agenda.json);
- data/proposals.json: události procedur s českou účastí (co se u zákona rozhoduje, časová osa);
- data/votes/ (HowTheyVote): dřívější hlasování o téže proceduře („minule“) a po zasedání výsledky;
- data/session_summaries.json: krátké AI shrnutí „o co jde“ (session_summaries.py, Claude Haiku, jen text bez čísel).

Pravidla (vypsaná i na webu, o-projektu#zasedani):
- Výběr „Tento týden se rozhoduje o…“ určuje pevné skóre, ne redakce: česká role (zpravodaj 3, stínový 2, stanovisko 1),
  zákon (COD, CNS, APP) +2, konečné schválení dohody s Radou +1. Nejvýš N_PICKS bodů, při shodě podle data a pořadí.
- „Co se rozhoduje“ plyne z typu procedury a jejích událostí (DECISIONS); u zákona bez známých událostí se nehádá.
- „Minule“ = poslední hlavní hlasování (závěrečné, dohoda, mandát, zamítnutí) o téže proceduře před zasedáním; není to předpověď.
- Výsledky = závěrečná hlasování v plénu ve dnech zasedání, spárovaná podle čísla procedury nebo dokumentu (A10-…, B10-…).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from build_pages import RESULT_LABEL, SHARE_BUTTON, esc, fmt_date, fmt_num, og_meta, page, read, split_bar
from compute_stats import active_positions, load_votes
from hub import _committee_html, _cz_html, _range, _title_link, radar_session_item, radar_steps
from layout import MODULES, json_script
from radar import READING_1, READING_2, timeline
from vote_kinds import KIND_LABELS, is_final, kind_of
from vote_parties import POSITIONS

N_PICKS = 5
ROLE_SCORE = {"rapporteur": 3, "co": 3, "shadow": 2, "opinion": 1, "shadow_opinion": 1}
LEGISLATIVE = {"COD", "CNS", "APP"}
PREV_KINDS = {"final", "provisional_agreement", "mandate", "rejection"}
# Co se u bodu rozhoduje podle typu procedury: (krátký popisek, vysvětlení). COD řeší decision() podle událostí.
DECISIONS = {
    "CNS": ("Zákon – konzultace", "Parlament dává stanovisko, o zákoně rozhoduje Rada."),
    "APP": ("Souhlas Parlamentu", "Parlament návrh schválí, nebo zamítne; měnit ho nemůže."),
    "INI": ("Zpráva z vlastního podnětu", "Parlament vyjadřuje svůj postoj; žádný zákon se tím nemění."),
    "RSP": ("Usnesení", "Nezávazné usnesení Parlamentu."),
    "DEC": ("Absolutorium", "Parlament rozhoduje, zda schválí hospodaření instituce EU za uplynulý rok."),
    "BUD": ("Rozpočet", "Hlasování o rozpočtu EU nebo jeho změně."),
    "NLE": ("Nelegislativní akt", "Stanovisko nebo souhlas Parlamentu k aktu, který přijímá Rada."),
}
COD_AGREEMENT = (
    "Konečné schválení dohody s Radou",
    "Hlasuje se o znění zákona dohodnutém s Radou. Když ho schválí plénum i Rada, zákon je přijatý.",
)
COD_FIRST = ("Postoj Parlamentu v 1. čtení", "Parlament řekne, jak má zákon podle něj vypadat. Konečné znění se pak vyjednává s Radou.")
COD_AGAIN = ("Další čtení zákona", "Parlament už o zákoně v plénu hlasoval, teď rozhoduje znovu.")
COD_UNKNOWN = (
    "Zákon v 1. čtení",
    "V 1. čtení Parlament buď přijme svůj postoj k návrhu Komise, nebo schválí znění dohodnuté s Radou.",
)
OBJECTION = ("Námitka proti aktu Komise", "Hlasuje se o tom, zda Parlament vznese námitku (nesouhlas) proti aktu Komise.")
DOC_RE = re.compile(r"([AB])-(\d+)-(\d{4})-(\d{4})")


def doc_reference(doc: str) -> str | None:
    """Číslo dokumentu z programu (A-10-2026-0265) ve tvaru HowTheyVote (A10-0265/2026); C-… a jiné None."""
    m = DOC_RE.fullmatch(doc)
    return f"{m[1]}{m[2]}-{m[4]}/{m[3]}" if m else None


def decision(item: dict, events: list[dict] | None) -> tuple[str, str] | None:
    """(co se rozhoduje, vysvětlení) z typu procedury a událostí. Bez procedury jen námitka podle názvu, jinak None."""
    ptype = (item.get("procedure") or {}).get("type")
    if ptype == "COD":
        if events is None:
            return COD_UNKNOWN
        plenary = max((e["date"] for e in events if e["type"] in READING_1 | READING_2 | {"PLENARY_DECISION"}), default="")
        agreement = max((e["date"] for e in events if e["type"] == "COMMITTEE_APPROVE_PROVISIONAL_AGREEMENT"), default="")
        if agreement and agreement > plenary:
            return COD_AGREEMENT
        return COD_AGAIN if plenary else COD_FIRST
    if ptype in DECISIONS:
        return DECISIONS[ptype]
    if (item.get("title_cs") or "").startswith("Námitka podle čl. 11"):
        return OBJECTION
    return None


def pick_score(item: dict, dec: tuple[str, str] | None) -> int:
    cz = max((ROLE_SCORE.get(c["role"], 0) for c in item.get("cz") or []), default=0)
    legislative = (item.get("procedure") or {}).get("type") in LEGISLATIVE
    return cz + (2 if legislative else 0) + (1 if dec == COD_AGREEMENT else 0)


def cz_counts(v: dict, meps_by_id: dict) -> list[int]:
    cz = active_positions(v, meps_by_id)
    return [sum(p["position"] == k for p in cz) for k in POSITIONS]


def related_votes(item: dict, votes: list[dict]) -> list[dict]:
    """Hlasování o téže věci: podle čísla procedury, jinak podle dokumentu z programu (A10-…, B10-…)."""
    label = (item.get("procedure") or {}).get("label")
    refs = {r for r in (doc_reference(d) for d in item.get("docs") or []) if r}
    return [v for v in votes if (label and (v.get("procedure") or {}).get("reference") == label) or (v.get("reference") in refs)]


def vote_brief(v: dict, meps_by_id: dict) -> dict:
    kind = kind_of(v)
    return {
        "id": v["id"],
        "date": v["date"],
        "kind": kind,
        "result": v.get("result"),
        "final": is_final(v),
        "cz": cz_counts(v, meps_by_id),
    }


def session_view(radar: dict | None, proposals: dict | None, votes: list[dict], meps_by_id: dict, summaries: dict | None) -> dict | None:
    """Zasedání pro stránku: body programu s rozhodnutím, výběrem, „minule“ a výsledky. Bez programu None."""
    s = (radar or {}).get("session")
    if not s:
        return None
    events = {
        p["label"]: p["events"]
        for p in (proposals or {}).get("items", [])
        if p.get("kind") == "procedure" and p.get("label") and "events" in p
    }
    sums = (summaries or {}).get("items", {})
    items = []
    for it in s["items"]:
        label = (it.get("procedure") or {}).get("label")
        ev = events.get(label) if label else None
        dec = decision(it, ev)
        rel = sorted(related_votes(it, votes), key=lambda v: (v["date"], v["id"]))
        before = [vote_brief(v, meps_by_id) for v in rel if v["date"] < s["from"] and kind_of(v) in PREV_KINDS]
        results = [vote_brief(v, meps_by_id) for v in rel if s["from"] <= v["date"] <= s["to"] and is_final(v)]
        key = label or it["id"]
        tl = timeline(ev, (it.get("procedure") or {}).get("type")) if ev else None
        items.append(
            {
                **it,
                "key": key,
                "decision": dec,
                "score": pick_score(it, dec),
                "previous": before[-2:],
                "results": results,
                "steps": tl["steps"] if tl else None,
                "reached": tl["reached"] if tl else None,
                "summary": (sums.get(key) or {}).get("shrnuti"),
            }
        )
    order = {it["id"]: i for i, it in enumerate(s["items"])}
    picks = sorted((i for i in items if i["score"] > 0), key=lambda i: (-i["score"], i["date"], order[i["id"]]))[:N_PICKS]
    return {
        "from": s["from"],
        "to": s["to"],
        "fetched": s.get("fetched"),
        "items": items,
        "picks": [i["id"] for i in picks],
        "has_results": any(i["results"] for i in items),
    }


# --- HTML ---------------------------------------------------------------------------------------------------


def _counts_html(c: list[int]) -> str:
    return f"{split_bar(c)}<span class='small'>Češi: {c[0]} pro · {c[1]} proti · {c[2]} zdrž. · {c[3]} nehl.</span>"


def _vote_href(v: dict, root: str) -> str:
    return f"{root}v/{v['id']}" if v["final"] else f"{root}vote?id={v['id']}&amp;m={v['date'][:7]}"


def previous_html(prev: list[dict], root: str) -> str:
    if not prev:
        return ""
    rows = "".join(
        f'<li><a href="{_vote_href(v, root)}">{fmt_date(v["date"])} · {esc(KIND_LABELS.get(v["kind"], v["kind"]))}</a>'
        f' · {esc(RESULT_LABEL.get(v["result"], "výsledek neuveden"))}<div class="zs-bar">{_counts_html(v["cz"])}</div></li>'
        for v in prev
    )
    return (
        '<div class="zs-prev"><p class="zs-h">Minule o téže věci</p>'
        f'<ul class="plain">{rows}</ul><p class="small muted">Jak hlasovali čeští poslanci dřív; není to předpověď.</p></div>'
    )


def results_html(results: list[dict], root: str) -> str:
    if not results:
        return ""
    rows = "".join(
        f'<li><a href="{_vote_href(v, root)}"><strong>{esc(RESULT_LABEL.get(v["result"], "výsledek neuveden"))}</strong> '
        f'{fmt_date(v["date"])}</a><div class="zs-bar">{_counts_html(v["cz"])}</div></li>'
        for v in results
    )
    return f'<div class="zs-res"><p class="zs-h">Jak to dopadlo</p><ul class="plain">{rows}</ul></div>'


def pick_html(it: dict, root: str) -> str:
    title = _title_link(it.get("title_cs") or it.get("title_en") or it["id"], (it.get("procedure") or {}).get("label"), root)
    comm, chip = _committee_html(it.get("committee"), root)
    dec = it["decision"]
    summary = (
        f'<p class="zs-sum">{esc(it["summary"])} <span class="ai-tag" title="Shrnutí napsala AI (Claude Haiku) jen z úředního názvu; '
        f'čísla ani hodnocení neobsahuje.">AI</span></p>'
        if it.get("summary")
        else ""
    )
    steps = ""
    if it.get("steps"):
        done = [x for x in it["steps"] if x.get("date")]
        last = f": naposledy {esc(done[-1]['label'].lower())} ({fmt_date(done[-1].get('date_to') or done[-1]['date'])})" if done else ""
        steps = f'<details class="zs-steps"><summary>Průběh procedury{last}</summary>{radar_steps(it["steps"], it["reached"])}</details>'
    meta = " · ".join(x for x in (fmt_date(it["date"]), (it.get("procedure") or {}).get("label"), comm) if x)
    return (
        f'<li class="card zs-pick"><p class="zs-meta small">{chip}{esc(meta)}</p><h3 class="rd-title">{title}</h3>{summary}'
        + (f'<p class="zs-dec"><strong>{esc(dec[0])}.</strong> {esc(dec[1])}</p>' if dec else "")
        + _cz_html(it.get("cz") or [], root)
        + steps
        + results_html(it["results"], root)
        + previous_html(it["previous"], root)
        + "</li>"
    )


def program_html(items: list[dict], root: str) -> str:
    days = sorted({i["date"] for i in items})
    out = []
    for d in days:
        rows = []
        for i in (x for x in items if x["date"] == d):
            li = radar_session_item(i, root)
            extra = results_html(i["results"], root)
            rows.append(li.replace("</li>", f"{extra}</li>") if extra else li)
        out.append(f'<h3 class="zs-day">{esc(fmt_date(d))}</h3><ol class="ns-list rd-list">{"".join(rows)}</ol>')
    return "".join(out)


def share_context(view: dict, data_day: str | None) -> dict:
    """Kontext karty ke sdílení a pro Instagram (share.js sessionCardOps): vybrané body, co se rozhoduje, česká stopa, výsledek."""
    when = _range(view["from"], view["to"])
    picks = sorted((i for i in view["items"] if i["id"] in view["picks"]), key=lambda i: view["picks"].index(i["id"]))

    def result(i: dict) -> str | None:
        if not i["results"]:
            return None
        r = i["results"][-1]
        return f"{RESULT_LABEL.get(r['result'], 'výsledek neuveden')} · Češi {r['cz'][0]} pro, {r['cz'][1]} proti, {r['cz'][2]} se zdrželo"

    data = {
        "when": when,
        "results": view["has_results"],
        "dataDay": data_day or view.get("fetched") or view["from"],
        "picks": [
            {
                "title": i.get("title_cs") or i.get("title_en") or i["id"],
                "decision": i["decision"][0] if i["decision"] else None,
                "cz": ("Česká stopa: " + ", ".join(f"{c['name']} ({c['role_cs']})" for c in i["cz"])) if i.get("cz") else None,
                "result": result(i),
            }
            for i in picks
        ],
    }
    return {
        "kind": "session",
        "path": "zasedani",
        "filename": f"ep-watch-zasedani-{view['from']}",
        "subtitle": f"Zasedání pléna · {when}",
        "text": f"Zasedání Evropského parlamentu {when}: o čem se rozhoduje a česká stopa. Zdroj: program EP, EP Watch CZ",
        "trust": "Karta má datum dat, zdroj a adresu stránky. Výběr bodů pravidlem, ne redakcí.",
        "data": data,
    }


def session_body(view: dict, categories: list[str], labels: dict[str, str], root: str = "") -> str:
    when = _range(view["from"], view["to"])
    picks = [i for i in view["items"] if i["id"] in view["picks"]]
    picks.sort(key=lambda i: view["picks"].index(i["id"]))
    lead = (
        "Výsledky hlasování o bodech programu a jak hlasovali čeští poslanci."
        if view["has_results"]
        else "O čem bude plénum hlasovat, co se u zákonů rozhoduje a kdo z českých poslanců na nich pracoval."
    )
    filters = (
        '<div class="controls rd-filters" role="group" aria-label="Filtry">'
        '<label>Téma <select id="rd-cat"><option value="">všechna</option>'
        + "".join(f'<option value="{k}">{esc(labels[k])}</option>' for k in categories if k in labels)
        + '</select></label><label><input type="checkbox" id="rd-leg"> jen zákony</label>'
        '<label><input type="checkbox" id="rd-cz"> jen s českou stopou</label></div>'
    )
    as_of = f" k {fmt_date(view['fetched'])}" if view.get("fetched") else ""
    picks_html = (
        '<section aria-labelledby="zs-h-picks"><h2 id="zs-h-picks">Tento týden se rozhoduje o…</h2>'
        '<p class="small muted">Výběr pravidlem, ne redakcí: nejdřív body s českým zpravodajem, pak zákony a konečná schválení '
        f'dohod s Radou (<a href="{root}o-projektu#zasedani">pravidlo</a>).</p>'
        f'<ol class="zs-picks">{"".join(pick_html(i, root) for i in picks)}</ol></section>'
        if picks
        else ""
    )
    return f"""<div class="back-row"><p class="small"><a href="{root}hlasovani">← Hlasování</a></p>{SHARE_BUTTON}</div>
<nav class="subnav" aria-label="Hlasování">
  <a href="{root}hlasovani" data-page="votes-overview">Přehled</a>
  <a href="{root}votes" data-page="votes-list">Všechna hlasování</a>
  <a href="{root}temata" data-page="votes-topics">Podle témat</a>
  <a href="{root}zasedani" data-page="votes-session" aria-current="page">Zasedání</a>
  <a href="{root}radar" data-page="votes-radar">Co se chystá</a>
</nav>
<h1>Zasedání pléna <span class="zs-when">{when}</span></h1>
<p class="lead">{lead}</p>
<p class="ns-when zs-status" data-from="{view["from"]}" data-to="{view["to"]}"><strong>{when}</strong><span class="ns-count" aria-live="polite"></span>
  · {fmt_num(len(view["items"]))} bodů v programu</p>
{picks_html}
<section aria-labelledby="zs-h-prog"><h2 id="zs-h-prog">Celý program po dnech</h2>
{filters}
{program_html(view["items"], root)}
<p class="rd-empty muted" hidden>Filtru nic neodpovídá.</p>
<p class="source">Program EP{as_of}, může se změnit (<a href="https://data.europarl.europa.eu">EP Open Data</a>) · výsledky
  <a href="https://howtheyvote.eu">HowTheyVote.eu</a> · AI shrnutí jen z úředního názvu · <a href="{root}o-projektu#zasedani">jak to skládáme</a></p>
</section>"""


def session_page(data_dir: Path, base_url: str | None) -> tuple[str, str] | None:
    """(zasedani.html, HTML) nebo None, když program zasedání není."""
    from categories import LABEL
    from overrides import apply_name_overrides

    radar_path = data_dir / "radar.json"
    if not radar_path.exists():
        return None
    radar = read(radar_path)
    meps_doc = read(data_dir / "meps.json")
    apply_name_overrides(meps_doc["meps"], data_dir / "manual" / "overrides.json")
    meps_by_id = {m["id"]: m for m in meps_doc["meps"]}
    proposals = read(data_dir / "proposals.json") if (data_dir / "proposals.json").exists() else None
    summaries = read(data_dir / "session_summaries.json") if (data_dir / "session_summaries.json").exists() else None
    votes = load_votes(data_dir / "votes")[1] if (data_dir / "votes" / "index.json").exists() else []
    view = session_view(radar, proposals, votes, meps_by_id, summaries)
    if view is None:
        return None
    release = ((read(data_dir / "overview.json").get("sources") or {}).get("votes") or {}).get("release") if view["has_results"] else None
    body = session_body(view, radar.get("categories", []), LABEL) + (
        f'<script type="application/json" id="share-context">{json_script(share_context(view, release))}</script>'
    )
    title = f"Zasedání pléna {_range(view['from'], view['to'])} – EP Watch CZ"
    desc = "Program plenárního zasedání EP: o čem se hlasuje, co se u zákonů rozhoduje, česká stopa a po zasedání výsledky."
    meta = og_meta(title, desc, "zasedani.html", base_url, None, "EP Watch CZ – zasedání Evropského parlamentu")
    html = page(title, body, current="votes", description=desc, meta=meta, scripts=MODULES.format(root="", page="pages/zasedani.js"))
    return "zasedani.html", html


def view_json(data_dir: Path) -> dict | None:
    """Pro build_instagram.py: stejný pohled jako stránka (bez HTML)."""
    radar_path = data_dir / "radar.json"
    if not radar_path.exists():
        return None
    meps = {m["id"]: m for m in read(data_dir / "meps.json")["meps"]}
    proposals = read(data_dir / "proposals.json") if (data_dir / "proposals.json").exists() else None
    votes = load_votes(data_dir / "votes")[1] if (data_dir / "votes" / "index.json").exists() else []
    summaries = read(data_dir / "session_summaries.json") if (data_dir / "session_summaries.json").exists() else None
    return session_view(read(radar_path), proposals, votes, meps, summaries)


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    v = view_json(root / "data")
    print(json.dumps({k: v[k] for k in ("from", "to", "picks", "has_results")} if v else None, ensure_ascii=False))
