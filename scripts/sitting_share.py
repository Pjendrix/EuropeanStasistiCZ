"""Karusel ke sdílení zasedání pléna (share.js, kind „sitting“): Novinky (blok zasedání) i stránka Zasedání po zasedání.

Vstup je blok zasedání z news.session_block (jen data HowTheyVote a vote_roles.json, žádná AI, žádná předběžná data).
Snímky (jen ty, pro které jsou data; pořadí pevné):
  1. overview: počty závěrečných hlasování, přijato / zamítnuto, Češi jednotní, Češi rozdělení, česká stopa,
  2. main: hlavní hlasování (stejný výběr jako na Novinkách, news.pick_votes): výsledek EP a hlasy Čechů,
  3. split: kde se Češi rozdělili (STRONG_SPLIT jako /rozkol): jak hlasovaly české strany k datu hlasování,
  4. trace: česká stopa: kdo z Čechů byl zpravodajem nebo stínovým zpravodajem (vote_roles.json), s portrétem.
Všechna čísla spočítá tento kód; karta je jen vykreslí.
"""

from __future__ import annotations

import datetime as dt

from compute_stats import active_positions, cz_split
from hub import _range, cz_role
from vote_parties import card_items
from web_ui import display_name, photo_url, vote_title

RESULT_LABEL = {"ADOPTED": "přijato", "REJECTED": "zamítnuto", "LAPSED": "propadlo", "WITHDRAWN": "staženo"}
POSITIONS = ("FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE")
MAX_SPLIT = 3
MAX_TRACE = 4
ROLE_ORDER = {"rapporteur": 0, "co": 1, "opinion": 2, "shadow": 3, "shadow_opinion": 4}


def _counts(positions: list[str]) -> list[int]:
    return [sum(p == k for p in positions) for k in POSITIONS]


def _vote_head(v: dict, cz: list[int]) -> dict:
    c = v["counts"]
    return {
        "id": v["id"],
        "title": vote_title(v),
        "date": v["date"],
        "result": v.get("result"),
        "resultLabel": RESULT_LABEL.get(v.get("result"), "výsledek neuveden"),
        "ep": [c["for"], c["against"], c["abstention"], c["did_not_vote"]],
        "cz": cz,
    }


def split_items(feats: list[dict], meps_by_id: dict, parties: list[dict], groups: list[dict]) -> list[dict]:
    """Hlasování, kde se Češi výrazně rozdělili, od nejrozdělenějšího; u každého české strany a jejich hlasy."""
    rows = []
    for f in feats:
        if not f["split"]:
            continue
        v = f["vote"]
        active = active_positions(v, meps_by_id)
        rows.append((-(cz_split(active) or (0,))[0], -f["turnout"], v["date"], v["id"], f, active))
    rows.sort(key=lambda r: r[:4])
    out = []
    for *_, f, active in rows[:MAX_SPLIT]:
        items = card_items(active, meps_by_id, parties, groups)
        out.append(
            {
                **_vote_head(f["vote"], f["cz"]),
                "parties": [{"label": it["label"], "color": it.get("color"), "counts": _counts(it["positions"])} for it in items],
            }
        )
    return out


def trace_items(feats: list[dict], meps_by_id: dict, vote_roles: dict) -> list[dict]:
    """Hlasování s českou stopou (zpravodaj, stínový zpravodaj… z vote_roles.json): nejdřív zpravodajové, pak novější."""
    rows = []
    for f in feats:
        roles = [r for r in vote_roles.get(str(f["vote"]["id"])) or [] if r.get("mep_id") in meps_by_id]
        if not roles:
            continue
        people = []
        for r in sorted(roles, key=lambda r: (ROLE_ORDER.get(r["role"], 9), meps_by_id[r["mep_id"]].get("sort_label") or "")):
            if any(p["id"] == r["mep_id"] for p in people):
                continue
            m = meps_by_id[r["mep_id"]]
            people.append({"id": m["id"], "name": display_name(m), "role": cz_role(m["id"], r["role"]), "photoUrl": photo_url(m, thumb=True) or None})
        best = min(ROLE_ORDER.get(r["role"], 9) for r in roles)
        rows.append((best, -dt.date.fromisoformat(f["vote"]["date"]).toordinal(), -f["vote"]["id"], {**_vote_head(f["vote"], f["cz"]), "people": people}))
    rows.sort(key=lambda r: r[:3])
    return [r[3] for r in rows[:MAX_TRACE]]


def sitting_data(block: dict, meps_by_id: dict, parties: list[dict], groups: list[dict], vote_roles: dict) -> dict:
    """Data karuselu ze session_block (s klíčem feats). Snímky bez dat se vynechají (overview je vždy)."""
    feats = block["feats"]
    finals = [f["vote"] for f in feats]
    main = [_vote_head(f["vote"], f["cz"]) for f in block["picks"]]
    split = split_items(feats, meps_by_id, parties, groups)
    trace = trace_items(feats, meps_by_id, vote_roles)
    slides = ["overview"] + [k for k, items in (("main", main), ("split", split), ("trace", trace)) if items]
    return {
        "when": _range(block["from"], block["to"]),
        "from": block["from"],
        "to": block["to"],
        "finals": block["finals"],
        "votes": block["votes"],
        "adopted": sum(v.get("result") == "ADOPTED" for v in finals),
        "rejected": sum(v.get("result") == "REJECTED" for v in finals),
        "united": block["united"],
        "considered": block["considered"],
        "splits": block["splits"],
        "trace": block["trace"],
        "main": main,
        "split": split,
        "traceItems": trace,
        "slides": slides,
    }


def sitting_context(data: dict, path: str, data_day: str | None = None) -> dict:
    """Kontext panelu sdílení (share-panel.js) pro karusel zasedání."""
    when = data["when"]
    return {
        "kind": "sitting",
        "path": path,
        "title": "Sdílet zasedání",
        "subtitle": f"Zasedání pléna · {when}",
        "filename": f"ep-watch-zasedani-{data['from']}",
        "text": f"Zasedání Evropského parlamentu {when}: jak hlasovali čeští poslanci. Zdroj: HowTheyVote.eu, EP Watch CZ",
        "trust": "Karty mají datum dat, zdroj a adresu stránky. Výběr hlasování pravidlem, ne redakcí; strany k datu hlasování.",
        "data": {**data, **({"dataDay": data_day} if data_day else {})},
    }
